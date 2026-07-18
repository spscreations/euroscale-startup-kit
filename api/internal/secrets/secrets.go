// Package secrets manages the storage and retrieval of database credentials
// as Kubernetes Secrets in the euroscale namespace.
package secrets

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"math/big"
	"strings"
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
		// Skip secrets that are not credentials (e.g. ssl-client certs, usage tracking)
		if !strings.HasPrefix(secret.Name, "db-") || strings.Contains(secret.Name, "-ssl-") {
			continue
		}

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

// ── SSL Client Certificates ─────────────────────────────────────────────────

// sslSecretName returns the secret name for SSL client certificates.
func sslSecretName(databaseID string) string {
	return fmt.Sprintf("db-%s-ssl-client", databaseID)
}

// SSLCertificates holds PEM-encoded client certificates for mTLS.
type SSLCertificates struct {
	CACert     string
	ClientCert string
	ClientKey  string
}

// GenerateSSLCertificates creates a client certificate signed by the given CA.
func GenerateSSLCertificates(caCertPEM, caKeyPEM string) (*SSLCertificates, error) {
	// Parse CA cert and key
	caCertBlock, _ := pem.Decode([]byte(caCertPEM))
	if caCertBlock == nil {
		return nil, fmt.Errorf("failed to parse CA certificate")
	}
	caCert, err := x509.ParseCertificate(caCertBlock.Bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse CA certificate: %w", err)
	}
	caKeyBlock, _ := pem.Decode([]byte(caKeyPEM))
	if caKeyBlock == nil {
		return nil, fmt.Errorf("failed to parse CA key")
	}
	caKey, err := x509.ParsePKCS8PrivateKey(caKeyBlock.Bytes)
	if err != nil {
		// Try PKCS1
		caKey, err = x509.ParsePKCS1PrivateKey(caKeyBlock.Bytes)
		if err != nil {
			// Try EC
			caKey, err = x509.ParseECPrivateKey(caKeyBlock.Bytes)
			if err != nil {
				return nil, fmt.Errorf("failed to parse CA key: %w", err)
			}
		}
	}

	// Generate client key
	clientKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, fmt.Errorf("failed to generate client key: %w", err)
	}

	// Create client certificate template
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, fmt.Errorf("failed to generate serial: %w", err)
	}
	clientTmpl := &x509.Certificate{
		SerialNumber: serial,
		Subject: pkix.Name{
			CommonName: "euroscale-client",
		},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
		BasicConstraintsValid: true,
	}

	// Sign client cert with CA
	clientCertDER, err := x509.CreateCertificate(rand.Reader, clientTmpl, caCert, &clientKey.PublicKey, caKey)
	if err != nil {
		return nil, fmt.Errorf("failed to create client certificate: %w", err)
	}

	// Encode to PEM
	clientCertPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: clientCertDER})
	clientKeyDER, _ := x509.MarshalPKCS8PrivateKey(clientKey)
	clientKeyPEM := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: clientKeyDER})

	return &SSLCertificates{
		CACert:     caCertPEM,
		ClientCert: string(clientCertPEM),
		ClientKey:  string(clientKeyPEM),
	}, nil
}

// SaveSSLCertificates stores SSL client certificates as a K8s Secret.
func (s *Store) SaveSSLCertificates(ctx context.Context, databaseID, userID string, certs *SSLCertificates) error {
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      sslSecretName(databaseID),
			Namespace: s.namespace,
			Labels: map[string]string{
				"app":      "euroscale",
				"database": databaseID,
				"managed":  "true",
				"user_id":  userID,
			},
		},
		Type: corev1.SecretTypeOpaque,
		StringData: map[string]string{
			"ca-cert.pem":     certs.CACert,
			"client-cert.pem": certs.ClientCert,
			"client-key.pem":  certs.ClientKey,
		},
	}
	_, err := s.clientset.CoreV1().Secrets(s.namespace).Create(ctx, secret, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("failed to create ssl cert secret %q: %w", sslSecretName(databaseID), err)
	}
	return nil
}

// GetSSLCertificates retrieves SSL client certificates from the K8s Secret.
func (s *Store) GetSSLCertificates(ctx context.Context, databaseID string) (*SSLCertificates, error) {
	secret, err := s.clientset.CoreV1().Secrets(s.namespace).Get(ctx, sslSecretName(databaseID), metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("ssl cert secret not found for %q: %w", databaseID, err)
	}
	return &SSLCertificates{
		CACert:     string(secret.Data["ca-cert.pem"]),
		ClientCert: string(secret.Data["client-cert.pem"]),
		ClientKey:  string(secret.Data["client-key.pem"]),
	}, nil
}

// DeleteSSLCertificates removes the SSL cert secret for a database.
func (s *Store) DeleteSSLCertificates(ctx context.Context, databaseID string) error {
	err := s.clientset.CoreV1().Secrets(s.namespace).Delete(ctx, sslSecretName(databaseID), metav1.DeleteOptions{})
	if err != nil {
		return fmt.Errorf("failed to delete ssl cert secret %q: %w", sslSecretName(databaseID), err)
	}
	return nil
}

// ── Autoscale configuration ──────────────────────────────────────────────────

// autoscaleSecretNameFor returns the deterministic Secret name for autoscale config.
func autoscaleSecretNameFor(databaseID string) string {
	return fmt.Sprintf("autoscale-%s", databaseID)
}
