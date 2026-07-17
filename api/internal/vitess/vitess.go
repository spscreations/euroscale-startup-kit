// Package vitess provides a manager for interacting with a Vitess cluster
// to provision and deprovision keyspaces (databases) via VitessKeyspace CRDs.
package vitess

import (
	"context"
	"crypto/rand"
	"fmt"
	"math/big"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
)

// Manager handles database provisioning operations via VitessKeyspace CRDs.
type Manager struct {
	vtgateAddr    string
	vtctldAddr    string
	dynamicClient dynamic.Interface
	namespace     string
}

// NewManager creates a new Manager configured to talk to the given
// vtgate and vtctld addresses.
//
// vtgateAddr should be in "host:port" format (e.g. "euroscale-vtgate:3306").
// Used for future health checks and direct MySQL operations.
//
// vtctldAddr should be in "host:port" format (e.g. "euroscale-vtctld:15999").
// Used for backup/restore operations.
func NewManager(vtgateAddr, vtctldAddr string, dynamicClient dynamic.Interface, namespace string) (*Manager, error) {
	return &Manager{
		vtgateAddr:    vtgateAddr,
		vtctldAddr:    vtctldAddr,
		dynamicClient: dynamicClient,
		namespace:     namespace,
	}, nil
}

// Close is a no-op. Retained for backward compatibility with callers that
// defer Close.
func (m *Manager) Close() error {
	return nil
}

// VtctldAddr returns the vtctld address used for administrative operations
// such as listing backups and triggering restores.
func (m *Manager) VtctldAddr() string {
	return m.vtctldAddr
}

// CreateDatabase creates a new keyspace in Vitess by creating a VitessKeyspace CRD.
// It clones the existing "main" keyspace as a template, changes the name to the
// new keyspace, and sets replicas to 1 per cell pool to keep resource usage low.
func (m *Manager) CreateDatabase(ctx context.Context, name string) error {
	if err := validateDatabaseName(name); err != nil {
		return err
	}

	keyspaceGVR := schema.GroupVersionResource{
		Group:    "planetscale.com",
		Version:  "v2",
		Resource: "vitesskeyspaces",
	}

	// Get the main keyspace to use as a template.
	mainKeyspaces, err := m.dynamicClient.Resource(keyspaceGVR).Namespace(m.namespace).List(ctx, metav1.ListOptions{
		LabelSelector: "planetscale.com/keyspace=main",
	})
	if err != nil {
		return fmt.Errorf("failed to list main keyspace templates: %w", err)
	}
	if len(mainKeyspaces.Items) == 0 {
		return fmt.Errorf("no main keyspace found to use as template — Vitess cluster may not be initialized")
	}

	template := mainKeyspaces.Items[0].DeepCopy()

	// Clean metadata for the new keyspace.
	unstructured.RemoveNestedField(template.Object, "metadata", "creationTimestamp")
	unstructured.RemoveNestedField(template.Object, "metadata", "generation")
	unstructured.RemoveNestedField(template.Object, "metadata", "resourceVersion")
	unstructured.RemoveNestedField(template.Object, "metadata", "uid")
	unstructured.RemoveNestedField(template.Object, "metadata", "ownerReferences")
	unstructured.RemoveNestedField(template.Object, "metadata", "managedFields")

	// Set the new keyspace identity.
	template.SetName(fmt.Sprintf("euroscale-%s-6f85067f", name))
	labels := template.GetLabels()
	if labels == nil {
		labels = make(map[string]string)
	}
	labels["planetscale.com/keyspace"] = name
	template.SetLabels(labels)

	// Set spec name to the database name.
	if err := unstructured.SetNestedField(template.Object, name, "spec", "name"); err != nil {
		return fmt.Errorf("failed to set keyspace name: %w", err)
	}

	// Reduce replicas to 1 per pool for non-main keyspaces.
	partitionings, found, err := unstructured.NestedSlice(template.Object, "spec", "partitionings")
	if err != nil || !found {
		return fmt.Errorf("failed to get partitionings from template: %w", err)
	}
	for _, p := range partitionings {
		part, ok := p.(map[string]interface{})
		if !ok {
			continue
		}
		equal, ok := part["equal"].(map[string]interface{})
		if !ok {
			continue
		}
		shardTmpl, ok := equal["shardTemplate"].(map[string]interface{})
		if !ok {
			continue
		}
		pools, ok := shardTmpl["tabletPools"].([]interface{})
		if !ok {
			continue
		}
		for _, tp := range pools {
			pool, ok := tp.(map[string]interface{})
			if !ok {
				continue
			}
			pool["replicas"] = int64(1)
		}
	}
	if err := unstructured.SetNestedSlice(template.Object, partitionings, "spec", "partitionings"); err != nil {
		return fmt.Errorf("failed to update partitionings: %w", err)
	}

	_, err = m.dynamicClient.Resource(keyspaceGVR).Namespace(m.namespace).Create(ctx, template, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("failed to create VitessKeyspace CRD for %q: %w", name, err)
	}

	return nil
}

// DeleteDatabase deletes a VitessKeyspace CRD, which triggers the Vitess operator
// to remove all associated shards, tablets, and topology entries.
func (m *Manager) DeleteDatabase(ctx context.Context, name string) error {
	if err := validateDatabaseName(name); err != nil {
		return err
	}

	keyspaceGVR := schema.GroupVersionResource{
		Group:    "planetscale.com",
		Version:  "v2",
		Resource: "vitesskeyspaces",
	}

	// Find the keyspace CRD by label.
	list, err := m.dynamicClient.Resource(keyspaceGVR).Namespace(m.namespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("planetscale.com/keyspace=%s", name),
	})
	if err != nil {
		return fmt.Errorf("failed to list keyspaces for deletion of %q: %w", name, err)
	}

	if len(list.Items) == 0 {
		// Keyspace doesn't exist — already gone, treat as success.
		return nil
	}

	for _, ks := range list.Items {
		if err := m.dynamicClient.Resource(keyspaceGVR).Namespace(m.namespace).Delete(ctx, ks.GetName(), metav1.DeleteOptions{}); err != nil {
			return fmt.Errorf("failed to delete VitessKeyspace CRD %q: %w", ks.GetName(), err)
		}
	}

	return nil
}

// GenerateCredentials creates a random username and password for a database user.
//
// Username: prefix "u_" + 12 alphanumeric characters (crypto/rand).
// Password: 48 characters with alphanumeric + special characters (crypto/rand).
func GenerateCredentials() (username string, password string, err error) {
	username, err = generateUsername()
	if err != nil {
		return "", "", fmt.Errorf("failed to generate username: %w", err)
	}

	password, err = generatePassword()
	if err != nil {
		return "", "", fmt.Errorf("failed to generate password: %w", err)
	}

	return username, password, nil
}

// ── helpers ─────────────────────────────────────────────────────────────────

// validateDatabaseName ensures the name contains only safe characters.
func validateDatabaseName(name string) error {
	if name == "" {
		return fmt.Errorf("database name must not be empty")
	}
	if len(name) > 64 {
		return fmt.Errorf("database name must be 64 characters or fewer")
	}
	for _, r := range name {
		if !isSafeNameChar(r) {
			return fmt.Errorf("database name %q contains invalid character %q", name, r)
		}
	}
	return nil
}

func isSafeNameChar(r rune) bool {
	return (r >= 'a' && r <= 'z') ||
		(r >= 'A' && r <= 'Z') ||
		(r >= '0' && r <= '9') ||
		r == '_'
}

const (
	usernameCharset = "abcdefghijklmnopqrstuvwxyz0123456789"
	passwordCharset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}|;:,.<>?"
	usernameLength  = 12
	passwordLength  = 48
)

func generateUsername() (string, error) {
	return randomString(usernameCharset, usernameLength)
}

func generatePassword() (string, error) {
	return randomString(passwordCharset, passwordLength)
}

// randomString generates a cryptographically random string from the given
// character set using crypto/rand.
func randomString(charset string, length int) (string, error) {
	var b strings.Builder
	b.Grow(length)

	charsetLen := big.NewInt(int64(len(charset)))
	for i := 0; i < length; i++ {
		idx, err := rand.Int(rand.Reader, charsetLen)
		if err != nil {
			return "", fmt.Errorf("crypto/rand error: %w", err)
		}
		b.WriteByte(charset[idx.Int64()])
	}

	return b.String(), nil
}
