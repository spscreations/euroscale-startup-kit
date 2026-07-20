// Package tiers defines the EuroScale subscription tier system and manages
// user-to-tier mappings via a Kubernetes ConfigMap ("euroscale-user-tiers").
//
// Tiers:
//
//	  Free       — 1 DB, 1 GB storage, 100k read units/mo
//	  Scale      — 3 DBs, 10 GB storage, 1M read + 500k write units/mo
//	  Team       — 10 DBs, 50 GB storage, 10M read + 5M write units/mo
//	  Business   — Unlimited DBs, 250 GB storage, burstable
//	  Enterprise — Unlimited DBs, unlimited storage, unlimited
package tiers

import (
	"context"
	"fmt"
	"strings"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// ── Tier constants ──────────────────────────────────────────────────────────

const (
	TierFree       = "free"
	TierScale      = "scale"
	TierTeam       = "team"
	TierBusiness   = "business"
	TierEnterprise = "enterprise"

	DefaultTier = TierFree
)

// UnlimitedDBs is the sentinel value for unlimited databases.
const UnlimitedDBs = -1

// ConfigMap name used to store user→tier mappings.
const userTierConfigMap = "euroscale-user-tiers"

// ── Tier definition ─────────────────────────────────────────────────────────

// Tier represents a subscription tier with its limits.
type Tier struct {
	Name                    string
	MaxDatabases            int     // -1 = unlimited
	MaxStorageGB            int64   // -1 = unlimited
	MaxTotalStorageGB       int64   // -1 = unlimited (total across all databases)
	ReadUnitsPerMonth       int64   // -1 = unlimited
	WriteUnitsPerMonth      int64   // -1 = unlimited
	AdditionalStorageGBPrice float64 // €0.20 per GB-month
	AutoscaleCUPrice         float64  // €0.04 per CU-hour
	AutoscaleMaxCU           int32    // max CU this tier can autoscale to (-1 = unlimited, 0 = disabled)
}

// tierDefs holds the canonical tier definitions.
var tierDefs = map[string]*Tier{
	TierFree: {
		Name:                    TierFree,
		MaxDatabases:            1,
		MaxStorageGB:            1,
		MaxTotalStorageGB:       1,
		ReadUnitsPerMonth:       100_000,
		WriteUnitsPerMonth:      0,
		AdditionalStorageGBPrice: 0.20,
		AutoscaleCUPrice:        0.04,
		AutoscaleMaxCU:          0,
	},
	TierScale: {
		Name:                    TierScale,
		MaxDatabases:            3,
		MaxStorageGB:            10,
		MaxTotalStorageGB:       100,
		ReadUnitsPerMonth:       1_000_000,
		WriteUnitsPerMonth:      500_000,
		AdditionalStorageGBPrice: 0.20,
		AutoscaleCUPrice:        0.04,
		AutoscaleMaxCU:          2,
	},
	TierTeam: {
		Name:                    TierTeam,
		MaxDatabases:            10,
		MaxStorageGB:            50,
		MaxTotalStorageGB:       500,
		ReadUnitsPerMonth:       10_000_000,
		WriteUnitsPerMonth:      5_000_000,
		AdditionalStorageGBPrice: 0.20,
		AutoscaleCUPrice:        0.04,
		AutoscaleMaxCU:          4,
	},
	TierBusiness: {
		Name:                    TierBusiness,
		MaxDatabases:            UnlimitedDBs,
		MaxStorageGB:            250,
		MaxTotalStorageGB:       2000,
		ReadUnitsPerMonth:       UnlimitedDBs, // burstable
		WriteUnitsPerMonth:      UnlimitedDBs, // burstable
		AdditionalStorageGBPrice: 0.20,
		AutoscaleCUPrice:        0.04,
		AutoscaleMaxCU:          8,
	},
	TierEnterprise: {
		Name:                    TierEnterprise,
		MaxDatabases:            UnlimitedDBs,
		MaxStorageGB:            UnlimitedDBs,
		MaxTotalStorageGB:       UnlimitedDBs,
		ReadUnitsPerMonth:       UnlimitedDBs,
		WriteUnitsPerMonth:      UnlimitedDBs,
		AdditionalStorageGBPrice: 0.20,
		AutoscaleCUPrice:        0.04,
		AutoscaleMaxCU:          UnlimitedDBs,
	},
}

// ── Public helpers ──────────────────────────────────────────────────────────

// GetTier returns the tier definition by name (case-insensitive).
// Returns nil if the tier name is unknown.
func GetTier(name string) *Tier {
	t, ok := tierDefs[strings.ToLower(name)]
	if !ok {
		return nil
	}
	return t
}

// IsUnlimited is a convenience for checking the sentinel value.
func IsUnlimited(v int64) bool { return v == UnlimitedDBs }

// ── Store ───────────────────────────────────────────────────────────────────

// Store manages user-tier mappings via a K8s ConfigMap.
type Store struct {
	clientset *kubernetes.Clientset
	namespace string
}

// NewStore creates a new tier store backed by a K8s ConfigMap.
func NewStore(clientset *kubernetes.Clientset, namespace string) *Store {
	return &Store{
		clientset: clientset,
		namespace: namespace,
	}
}

// EnsureConfigMap creates the "euroscale-user-tiers" ConfigMap if it
// does not already exist. Call this once at startup.
func (s *Store) EnsureConfigMap(ctx context.Context) error {
	_, err := s.clientset.CoreV1().ConfigMaps(s.namespace).Get(ctx, userTierConfigMap, metav1.GetOptions{})
	if err == nil {
		return nil // already exists
	}

	cm := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      userTierConfigMap,
			Namespace: s.namespace,
			Labels: map[string]string{
				"app":     "euroscale",
				"managed": "true",
			},
		},
		Data: make(map[string]string),
	}

	_, err = s.clientset.CoreV1().ConfigMaps(s.namespace).Create(ctx, cm, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("failed to create ConfigMap %q: %w", userTierConfigMap, err)
	}
	return nil
}

// SetUserTier assigns a tier to a user. The tier name is validated against
// the known tier map first.
func (s *Store) SetUserTier(ctx context.Context, userID, tierName string) error {
	tier := GetTier(tierName)
	if tier == nil {
		return fmt.Errorf("unknown tier %q", tierName)
	}

	cm, err := s.clientset.CoreV1().ConfigMaps(s.namespace).Get(ctx, userTierConfigMap, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get ConfigMap %q: %w", userTierConfigMap, err)
	}

	if cm.Data == nil {
		cm.Data = make(map[string]string)
	}
	cm.Data[userID] = tier.Name

	_, err = s.clientset.CoreV1().ConfigMaps(s.namespace).Update(ctx, cm, metav1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("failed to update ConfigMap %q: %w", userTierConfigMap, err)
	}
	return nil
}

// GetUserTier returns the tier name assigned to a user.
// Falls back to DefaultTier if the user has no explicit assignment.
func (s *Store) GetUserTier(ctx context.Context, userID string) string {
	cm, err := s.clientset.CoreV1().ConfigMaps(s.namespace).Get(ctx, userTierConfigMap, metav1.GetOptions{})
	if err != nil {
		return DefaultTier
	}

	tierName, ok := cm.Data[userID]
	if !ok || tierName == "" {
		return DefaultTier
	}
	return tierName
}

// GetTierForUser returns the full Tier definition for the given user.
func (s *Store) GetTierForUser(ctx context.Context, userID string) *Tier {
	tierName := s.GetUserTier(ctx, userID)
	t := GetTier(tierName)
	if t == nil {
		return tierDefs[DefaultTier]
	}
	return t
}
