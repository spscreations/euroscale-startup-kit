// Package secrets manages the storage and retrieval of database credentials
// as Kubernetes Secrets in the euroscale namespace.
package secrets

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/spscreations/euroscale-startup-kit/api/internal/models"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// Store provides credential persistence using K8s Secrets.
type Store struct {
	clientset *kubernetes.Clientset
	namespace string
}

// NewStore creates a new credentials store backed by K8s Secrets.
func NewStore(clientset *kubernetes.Clientset, namespace string) *Store {
	return &Store{
		clientset: clientset,
		namespace: namespace,
	}
}

// secretNameFor returns the deterministic Secret name for a given database ID.
func secretNameFor(databaseID string) string {
	return fmt.Sprintf("db-%s-creds", databaseID)
}

// SaveCredentials stores database credentials as a K8s Secret.
// The Secret is named "db-{databaseID}-creds" and carries labels:
//
//	app=euroscale, database=<databaseID>, managed=true
//
// UserID must be non-empty so ownership labels are always set (prevents
// ownerless secrets that break ACL checks).
func (s *Store) SaveCredentials(ctx context.Context, db *models.Database, creds *models.DatabaseCredentials) error {
	if db == nil || db.UserID == "" {
		return fmt.Errorf("user_id is required to save database credentials")
	}
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      secretNameFor(creds.DatabaseID),
			Namespace: s.namespace,
			Labels: map[string]string{
				"app":      "euroscale",
				"database": creds.DatabaseID,
				"managed":  "true",
				"user_id":  db.UserID,
			},
			Annotations: map[string]string{
				"euroscale.app/database-name":      db.Name,
				"euroscale.app/region":             db.Region,
				"euroscale.app/created-at":         db.CreatedAt.Format(time.RFC3339),
				"euroscale.app/parent-database-id": db.ParentDatabaseID,
			},
		},
		Type: corev1.SecretTypeOpaque,
		Data: map[string][]byte{
			"username":          []byte(creds.Username),
			"password":          []byte(creds.Password),
			"connection_string": []byte(creds.ConnectionString),
			"ssl_ca_pem":        []byte(creds.SSLCAPem),
		},
	}

	_, err := s.clientset.CoreV1().Secrets(s.namespace).Create(ctx, secret, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("failed to create k8s secret %q: %w", secretNameFor(creds.DatabaseID), err)
	}

	return nil
}

// GetCredentials retrieves database credentials from the corresponding K8s Secret.
func (s *Store) GetCredentials(ctx context.Context, databaseID string) (*models.DatabaseCredentials, error) {
	secret, err := s.clientset.CoreV1().Secrets(s.namespace).Get(ctx, secretNameFor(databaseID), metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get k8s secret for database %q: %w", databaseID, err)
	}

	return secretToCredentials(secret), nil
}

// DeleteCredentials removes the K8s Secret for a given database.
func (s *Store) DeleteCredentials(ctx context.Context, databaseID string) error {
	err := s.clientset.CoreV1().Secrets(s.namespace).Delete(ctx, secretNameFor(databaseID), metav1.DeleteOptions{})
	if err != nil {
		return fmt.Errorf("failed to delete k8s secret for database %q: %w", databaseID, err)
	}
	return nil
}

// UpdateCredentials replaces an existing K8s Secret with new credentials.
// UserID must be non-empty so ownership labels are always set (prevents
// ownerless secrets that break ACL checks).
func (s *Store) UpdateCredentials(ctx context.Context, db *models.Database, creds *models.DatabaseCredentials) error {
	if db == nil || db.UserID == "" {
		return fmt.Errorf("user_id is required to update database credentials")
	}
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      secretNameFor(creds.DatabaseID),
			Namespace: s.namespace,
			Labels: map[string]string{
				"app":      "euroscale",
				"database": creds.DatabaseID,
				"managed":  "true",
				"user_id":  db.UserID,
			},
			Annotations: map[string]string{
				"euroscale.app/database-name":      db.Name,
				"euroscale.app/region":             db.Region,
				"euroscale.app/created-at":         db.CreatedAt.Format(time.RFC3339),
				"euroscale.app/parent-database-id": db.ParentDatabaseID,
			},
		},
		Type: corev1.SecretTypeOpaque,
		Data: map[string][]byte{
			"username":          []byte(creds.Username),
			"password":          []byte(creds.Password),
			"connection_string": []byte(creds.ConnectionString),
			"ssl_ca_pem":        []byte(creds.SSLCAPem),
		},
	}

	_, err := s.clientset.CoreV1().Secrets(s.namespace).Update(ctx, secret, metav1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("failed to update k8s secret %q: %w", secretNameFor(creds.DatabaseID), err)
	}

	return nil
}

// ListAll returns all euroscale-managed databases by querying K8s Secrets
// with the label app=euroscale, managed=true, excluding usage-tracking secrets.
func (s *Store) ListAll(ctx context.Context) ([]models.Database, error) {
	secretsList, err := s.clientset.CoreV1().Secrets(s.namespace).List(ctx, metav1.ListOptions{
		LabelSelector: "app=euroscale,managed=true,!usage",
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list k8s secrets: %w", err)
	}

	databases := make([]models.Database, 0, len(secretsList.Items))
	for _, secret := range secretsList.Items {
		// Defensive: skip secrets without a "database" label (e.g. usage tracking secrets
		// that may have gotten the managed=true label).
		if secret.Labels["database"] == "" {
			continue
		}

		db := models.Database{
			ID:               secret.Labels["database"],
			Name:             secret.Annotations["euroscale.app/database-name"],
			Engine:           models.EngineMySQL,
			Region:           secret.Annotations["euroscale.app/region"],
			Host:             "",
			Port:             3306,
			Username:         string(secret.Data["username"]),
			Status:           models.StatusReady,
			UserID:           secret.Labels["user_id"],
			ParentDatabaseID: secret.Annotations["euroscale.app/parent-database-id"],
		}

		if createdAt, err := time.Parse(time.RFC3339, secret.Annotations["euroscale.app/created-at"]); err == nil {
			db.CreatedAt = createdAt
		}

		databases = append(databases, db)
	}

	return databases, nil
}

// secretToCredentials extracts DatabaseCredentials from a K8s Secret.
func secretToCredentials(secret *corev1.Secret) *models.DatabaseCredentials {
	return &models.DatabaseCredentials{
		DatabaseID:       secret.Labels["database"],
		Username:         string(secret.Data["username"]),
		Password:         string(secret.Data["password"]),
		ConnectionString: string(secret.Data["connection_string"]),
		SSLCAPem:         string(secret.Data["ssl_ca_pem"]),
	}
}

// SaveIPWhitelist stores the IP whitelist entries in the database's K8s Secret
// under the "ip_whitelist" key as a JSON-serialized array.
func (s *Store) SaveIPWhitelist(ctx context.Context, databaseID string, entries []models.IPWhitelistEntry) error {
	// Read the existing secret to preserve other fields.
	secret, err := s.clientset.CoreV1().Secrets(s.namespace).Get(ctx, secretNameFor(databaseID), metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get k8s secret for database %q: %w", databaseID, err)
	}

	entriesJSON, err := json.Marshal(entries)
	if err != nil {
		return fmt.Errorf("failed to marshal IP whitelist: %w", err)
	}

	if secret.Data == nil {
		secret.Data = make(map[string][]byte)
	}
	secret.Data["ip_whitelist"] = entriesJSON

	_, err = s.clientset.CoreV1().Secrets(s.namespace).Update(ctx, secret, metav1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("failed to update IP whitelist in k8s secret for database %q: %w", databaseID, err)
	}

	return nil
}

// GetUserID returns the user_id label from a database's K8s Secret.
// Returns empty string if the secret or label is not found.
func (s *Store) GetUserID(ctx context.Context, databaseID string) string {
	secret, err := s.clientset.CoreV1().Secrets(s.namespace).Get(ctx, secretNameFor(databaseID), metav1.GetOptions{})
	if err != nil {
		return ""
	}
	return secret.Labels["user_id"]
}

// GetAnnotations returns the annotations map from a database's K8s Secret.
// Returns nil if the secret is not found or has no annotations.
func (s *Store) GetAnnotations(ctx context.Context, databaseID string) map[string]string {
	secret, err := s.clientset.CoreV1().Secrets(s.namespace).Get(ctx, secretNameFor(databaseID), metav1.GetOptions{})
	if err != nil {
		return nil
	}
	return secret.Annotations
}

// GetIPWhitelist retrieves the IP whitelist entries from the database's K8s Secret.
// If the "ip_whitelist" key does not exist, it returns an empty slice.
func (s *Store) GetIPWhitelist(ctx context.Context, databaseID string) ([]models.IPWhitelistEntry, error) {
	secret, err := s.clientset.CoreV1().Secrets(s.namespace).Get(ctx, secretNameFor(databaseID), metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get k8s secret for database %q: %w", databaseID, err)
	}

	entriesJSON, ok := secret.Data["ip_whitelist"]
	if !ok || len(entriesJSON) == 0 {
		return []models.IPWhitelistEntry{}, nil
	}

	var entries []models.IPWhitelistEntry
	if err := json.Unmarshal(entriesJSON, &entries); err != nil {
		return nil, fmt.Errorf("failed to unmarshal IP whitelist for database %q: %w", databaseID, err)
	}

	return entries, nil
}

// ── Autoscale configuration ──────────────────────────────────────────────────

// autoscaleSecretNameFor returns the deterministic Secret name for autoscale config.
func autoscaleSecretNameFor(databaseID string) string {
	return fmt.Sprintf("autoscale-%s", databaseID)
}
