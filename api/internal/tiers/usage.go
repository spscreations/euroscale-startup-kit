// Package tiers — usage tracking.
//
// Usage data is stored per-user in K8s Secrets named "usage-{userID}" with
// JSON-encoded fields: database_count, storage_bytes, read_units, write_units.
//
// Concurrency note: increment/decrement operations use read-modify-write on
// the underlying Secret. In a multi-replica deployment this carries a small
// risk of lost updates; for production, a proper counter store (e.g. Redis
// with INCR/DECR) is recommended.
package tiers

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// ── Usage shape ─────────────────────────────────────────────────────────────

// Usage tracks the current consumption for a user.
type Usage struct {
	DatabaseCount int32 `json:"database_count"`
	StorageBytes  int64 `json:"storage_bytes"`
	ReadUnits     int64 `json:"read_units"`
	WriteUnits    int64 `json:"write_units"`
}

// ── Secret helpers ──────────────────────────────────────────────────────────

func usageSecretName(userID string) string {
	return fmt.Sprintf("usage-%s", sanitizeForK8sName(userID))
}

// sanitizeForK8sName converts a string to a valid K8s name (lowercase RFC 1123).
func sanitizeForK8sName(s string) string {
	// Convert to lowercase and replace non-alphanumeric chars (except hyphen/dot) with hyphen.
	var result strings.Builder
	for _, c := range strings.ToLower(s) {
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '.' {
			result.WriteRune(c)
		} else {
			result.WriteRune('-')
		}
	}
	name := result.String()
	// Trim leading/trailing non-alphanumeric chars.
	name = strings.TrimFunc(name, func(r rune) bool {
		return !((r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'))
	})
	// Ensure minimum length.
	if name == "" {
		name = "default"
	}
	return name
}

func (s *Store) getOrCreateUsageSecret(ctx context.Context, userID string) (*corev1.Secret, error) {
	name := usageSecretName(userID)
	secret, err := s.clientset.CoreV1().Secrets(s.namespace).Get(ctx, name, metav1.GetOptions{})
	if err == nil {
		return secret, nil
	}

	// Create a new usage secret.
	usage := Usage{}
	data, _ := json.Marshal(usage)

	newSecret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: s.namespace,
			Labels: map[string]string{
				"app":     "euroscale",
				"managed": "true",
				"usage":   "true",
				"user_id": userID,
			},
		},
		Type: corev1.SecretTypeOpaque,
		Data: map[string][]byte{
			"usage": data,
		},
	}

	created, err := s.clientset.CoreV1().Secrets(s.namespace).Create(ctx, newSecret, metav1.CreateOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to create usage secret for %q: %w", userID, err)
	}
	return created, nil
}

func (s *Store) readUsage(ctx context.Context, userID string) (*Usage, error) {
	secret, err := s.getOrCreateUsageSecret(ctx, userID)
	if err != nil {
		return nil, err
	}

	raw, ok := secret.Data["usage"]
	if !ok || len(raw) == 0 {
		return &Usage{}, nil
	}

	var usage Usage
	if err := json.Unmarshal(raw, &usage); err != nil {
		return nil, fmt.Errorf("failed to unmarshal usage for %q: %w", userID, err)
	}
	return &usage, nil
}

func (s *Store) writeUsage(ctx context.Context, userID string, usage *Usage) error {
	secret, err := s.clientset.CoreV1().Secrets(s.namespace).Get(ctx, usageSecretName(userID), metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get usage secret for %q: %w", userID, err)
	}

	data, err := json.Marshal(usage)
	if err != nil {
		return fmt.Errorf("failed to marshal usage for %q: %w", userID, err)
	}

	secret.Data["usage"] = data
	_, err = s.clientset.CoreV1().Secrets(s.namespace).Update(ctx, secret, metav1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("failed to update usage secret for %q: %w", userID, err)
	}
	return nil
}

// ── Public API ──────────────────────────────────────────────────────────────

// GetCurrentUsage returns the current usage for a user.
func (s *Store) GetCurrentUsage(ctx context.Context, userID string) (*Usage, error) {
	return s.readUsage(ctx, userID)
}

// IncrementDatabaseCount increments the database count for a user by 1.
func (s *Store) IncrementDatabaseCount(ctx context.Context, userID string) error {
	usage, err := s.readUsage(ctx, userID)
	if err != nil {
		return err
	}
	usage.DatabaseCount++
	return s.writeUsage(ctx, userID, usage)
}

// DecrementDatabaseCount decrements the database count for a user by 1.
// The count will not go below 0.
func (s *Store) DecrementDatabaseCount(ctx context.Context, userID string) error {
	usage, err := s.readUsage(ctx, userID)
	if err != nil {
		return err
	}
	if usage.DatabaseCount > 0 {
		usage.DatabaseCount--
	}
	return s.writeUsage(ctx, userID, usage)
}

// SetDatabaseCount sets the database count for a user to an absolute value.
// Used to reconcile usage counters against actual owned K8s database secrets.
func (s *Store) SetDatabaseCount(ctx context.Context, userID string, n int32) error {
	if n < 0 {
		n = 0
	}
	usage, err := s.readUsage(ctx, userID)
	if err != nil {
		return err
	}
	if usage.DatabaseCount == n {
		return nil
	}
	usage.DatabaseCount = n
	return s.writeUsage(ctx, userID, usage)
}

// AddStorageBytes adds the given number of bytes to the user's storage usage.
// The delta can be positive (increment) or negative (decrement).
func (s *Store) AddStorageBytes(ctx context.Context, userID string, delta int64) error {
	usage, err := s.readUsage(ctx, userID)
	if err != nil {
		return err
	}
	usage.StorageBytes += delta
	if usage.StorageBytes < 0 {
		usage.StorageBytes = 0
	}
	return s.writeUsage(ctx, userID, usage)
}
