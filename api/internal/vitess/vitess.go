// Package vitess provides a manager for interacting with a Vitess cluster
// to provision and deprovision keyspaces (databases) by patching the
// VitessCluster CRD's spec.keyspaces array.
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

// Manager handles database provisioning operations via the VitessCluster CRD.
type Manager struct {
	vtgateAddr    string
	vtctldAddr    string
	dynamicClient dynamic.Interface
	namespace     string
	clusterName   string
}

// NewManager creates a new Manager configured to talk to the given
// vtgate and vtctld addresses.
func NewManager(vtgateAddr, vtctldAddr string, dynamicClient dynamic.Interface, namespace string) (*Manager, error) {
	return &Manager{
		vtgateAddr:    vtgateAddr,
		vtctldAddr:    vtctldAddr,
		dynamicClient: dynamicClient,
		namespace:     namespace,
		clusterName:   "euroscale",
	}, nil
}

// Close is a no-op.
func (m *Manager) Close() error {
	return nil
}

// VtctldAddr returns the vtctld address.
func (m *Manager) VtctldAddr() string {
	return m.vtctldAddr
}

var clusterGVR = schema.GroupVersionResource{
	Group:    "planetscale.com",
	Version:  "v2",
	Resource: "vitessclusters",
}

// CreateDatabase adds a new keyspace to the VitessCluster CRD's spec.keyspaces array.
// It clones the first existing keyspace as a template, updates the name and reduces
// replicas to 1 per cell pool.
func (m *Manager) CreateDatabase(ctx context.Context, name string) error {
	if err := validateDatabaseName(name); err != nil {
		return err
	}

	cluster, err := m.dynamicClient.Resource(clusterGVR).Namespace(m.namespace).Get(ctx, m.clusterName, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get VitessCluster %q: %w", m.clusterName, err)
	}

	// Get existing keyspaces to use first one as a template.
	keyspaces, found, err := unstructured.NestedSlice(cluster.Object, "spec", "keyspaces")
	if err != nil || !found || len(keyspaces) == 0 {
		// No existing keyspaces — use a built-in minimal default template.
		keyspaces = []interface{}{defaultKeyspaceTemplate()}
	}

	// Clone the first keyspace as a template.
	template, ok := keyspaces[0].(map[string]interface{})
	if !ok {
		return fmt.Errorf("failed to parse keyspace template")
	}

	// Deep copy via JSON round-trip is safest for nested maps.
	newKS := deepCopyMap(template)
	newKS["name"] = name

	// Reduce replicas to 1 per pool.
	partitionings, ok := newKS["partitionings"].([]interface{})
	if !ok {
		return fmt.Errorf("keyspace template missing partitionings")
	}
	for _, partRaw := range partitionings {
		part, ok := partRaw.(map[string]interface{})
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
		for _, tpRaw := range pools {
			pool, ok := tpRaw.(map[string]interface{})
			if !ok {
				continue
			}
			pool["replicas"] = int64(1)
		}
	}

	// Append the new keyspace.
	keyspaces = append(keyspaces, newKS)
	if err := unstructured.SetNestedSlice(cluster.Object, keyspaces, "spec", "keyspaces"); err != nil {
		return fmt.Errorf("failed to set keyspaces: %w", err)
	}

	_, err = m.dynamicClient.Resource(clusterGVR).Namespace(m.namespace).Update(ctx, cluster, metav1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("failed to update VitessCluster with keyspace %q: %w", name, err)
	}

	return nil
}

// DeleteDatabase removes a keyspace from the VitessCluster CRD's spec.keyspaces array.
func (m *Manager) DeleteDatabase(ctx context.Context, name string) error {
	if err := validateDatabaseName(name); err != nil {
		return err
	}

	cluster, err := m.dynamicClient.Resource(clusterGVR).Namespace(m.namespace).Get(ctx, m.clusterName, metav1.GetOptions{})
	if err != nil {
		// If the cluster doesn't exist, there's nothing to delete.
		return nil
	}

	keyspaces, found, err := unstructured.NestedSlice(cluster.Object, "spec", "keyspaces")
	if err != nil || !found {
		// No keyspaces at all — nothing to do.
		return nil
	}

	// Filter out the keyspace to delete.
	filtered := make([]interface{}, 0, len(keyspaces))
	for _, ksRaw := range keyspaces {
		ks, ok := ksRaw.(map[string]interface{})
		if !ok {
			continue
		}
		if ks["name"] == name {
			continue // skip this one
		}
		filtered = append(filtered, ks)
	}

	if len(filtered) == len(keyspaces) {
		// Keyspace wasn't found in the list.
		return nil
	}

	if err := unstructured.SetNestedSlice(cluster.Object, filtered, "spec", "keyspaces"); err != nil {
		return fmt.Errorf("failed to set keyspaces: %w", err)
	}

	_, err = m.dynamicClient.Resource(clusterGVR).Namespace(m.namespace).Update(ctx, cluster, metav1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("failed to update VitessCluster removing keyspace %q: %w", name, err)
	}

	return nil
}

// GenerateCredentials creates a random username and password.
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

// defaultKeyspaceTemplate returns a minimal built-in keyspace template
// used as a fallback when the VitessCluster has no existing keyspaces.
func defaultKeyspaceTemplate() map[string]interface{} {
	return map[string]interface{}{
		"name":             "",
		"durabilityPolicy": "cross_cell",
		"turndownPolicy":   "Immediate",
		"partitionings": []interface{}{
			map[string]interface{}{
				"equal": map[string]interface{}{
					"hexWidth": int64(0),
					"parts":    int64(1),
					"shardTemplate": map[string]interface{}{
						"databaseInitScriptSecret": map[string]interface{}{
							"key":  "init.sql",
							"name": "vitess-init-sql",
						},
						"tabletPools": []interface{}{
							map[string]interface{}{
								"cell":     "nuremberg",
								"type":     "replica",
								"replicas": int64(1),
								"vttablet": map[string]interface{}{
									"extraFlags": map[string]interface{}{},
									"resources": map[string]interface{}{
										"limits":   map[string]interface{}{"cpu": "256m", "memory": "256Mi"},
										"requests": map[string]interface{}{"cpu": "100m", "memory": "128Mi"},
									},
								},
								"mysqld": map[string]interface{}{
									"resources": map[string]interface{}{
										"limits":   map[string]interface{}{"cpu": "500m", "memory": "1Gi"},
										"requests": map[string]interface{}{"cpu": "250m", "memory": "512Mi"},
									},
								},
								"dataVolumeClaimTemplate": map[string]interface{}{
									"accessModes":      []interface{}{"ReadWriteOnce"},
									"storageClassName": "hcloud-volumes",
									"resources":        map[string]interface{}{"requests": map[string]interface{}{"storage": "10Gi"}},
								},
							},
						},
					},
				},
			},
		},
	}
}

// deepCopyMap does a shallow copy of a map[string]interface{} — sufficient
// for our use case since primitive values are copied by value.
func deepCopyMap(src map[string]interface{}) map[string]interface{} {
	dst := make(map[string]interface{}, len(src))
	for k, v := range src {
		switch val := v.(type) {
		case map[string]interface{}:
			dst[k] = deepCopyMap(val)
		case []interface{}:
			dst[k] = deepCopySlice(val)
		default:
			dst[k] = v
		}
	}
	return dst
}

func deepCopySlice(src []interface{}) []interface{} {
	dst := make([]interface{}, len(src))
	for i, v := range src {
		switch val := v.(type) {
		case map[string]interface{}:
			dst[i] = deepCopyMap(val)
		case []interface{}:
			dst[i] = deepCopySlice(val)
		default:
			dst[i] = v
		}
	}
	return dst
}

// ── helpers ─────────────────────────────────────────────────────────────────

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
