// Package storage provides PVC resize logic for Vitess databases backed
// by Hetzner Cloud Volumes (CSI driver). It interacts with the Kubernetes
// API to patch PVC sizes and tracks usage changes.
package storage

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"
)

// MaxVolumeSizeGB is the Hetzner Cloud maximum volume size in GB.
const MaxVolumeSizeGB = 10_240 // 10 TiB

// Resizer manages PVC resizing for database volumes.
type Resizer struct {
	clientset *kubernetes.Clientset
	namespace string
}

// PVCConfig holds the parameters for provisioning a new PVC for a database.
type PVCConfig struct {
	DatabaseID string
	SizeGB     int64
}

// NewResizer creates a new Resizer.
func NewResizer(clientset *kubernetes.Clientset, namespace string) *Resizer {
	return &Resizer{
		clientset: clientset,
		namespace: namespace,
	}
}

// ResizePVC expands a database's PVC by the specified GB amount.
// If no PVC exists for the database, a new one is provisioned at the requested size.
//
// Steps:
//  1. Find the PVC by database ID label.
//  2. If none exists, create a new PVC at the requested size.
//  3. If one exists, read current capacity and compute new size.
//  4. Validate against Hetzner's 10 TB limit.
//  5. Patch the PVC with the new size.
//
// Returns the new total size in GB on success.
func (r *Resizer) ResizePVC(ctx context.Context, dbID string, additionalGB int32) (int64, error) {
	if additionalGB <= 0 {
		return 0, fmt.Errorf("additional_gb must be positive (got %d)", additionalGB)
	}

	// 1. Find the PVC by label.
	pvc, err := r.findPVCByDatabaseID(ctx, dbID)
	if err != nil {
		// If no PVC exists, auto-provision one at the requested size.
		newGB := int64(additionalGB)
		_, err := r.CreatePVC(ctx, PVCConfig{DatabaseID: dbID, SizeGB: newGB})
		if err != nil {
			return 0, fmt.Errorf("no PVC found for database %q and failed to create one: %w", dbID, err)
		}
		log.Printf("INFO: auto-provisioned PVC for database %q at %d Gi", dbID, newGB)
		return newGB, nil
	}

	// 2. Parse current capacity.
	currentGB, err := parseCapacityGB(pvc.Status.Capacity.Storage().String())
	if err != nil {
		return 0, fmt.Errorf("failed to parse current PVC capacity for %q: %w", dbID, err)
	}

	// 3. Compute new size.
	newGB := currentGB + int64(additionalGB)

	// 4. Validate against limit.
	if newGB > MaxVolumeSizeGB {
		return 0, fmt.Errorf("requested size %d GB exceeds Hetzner max volume size of %d GB — consider resharding", newGB, MaxVolumeSizeGB)
	}

	// 5. Build and apply the patch.
	patch := []byte(fmt.Sprintf(
		`{"spec":{"resources":{"requests":{"storage":"%dGi"}}}}`,
		newGB,
	))

	_, err = r.clientset.CoreV1().PersistentVolumeClaims(r.namespace).Patch(
		ctx,
		pvc.Name,
		types.MergePatchType,
		patch,
		metav1.PatchOptions{},
	)
	if err != nil {
		return 0, fmt.Errorf("failed to patch PVC %q: %w", pvc.Name, err)
	}

	log.Printf("INFO: resized PVC %q for database %q from %d Gi to %d Gi",
		pvc.Name, dbID, currentGB, newGB)

	return newGB, nil
}

// pvcNameFor returns the deterministic PVC name for a given database ID.
func pvcNameFor(dbID string) string {
	return fmt.Sprintf("db-%s-data", dbID)
}

// CreatePVC provisions a new PVC for a database.
func (r *Resizer) CreatePVC(ctx context.Context, cfg PVCConfig) (*corev1.PersistentVolumeClaim, error) {
	storageClassName := "local-path" // default for development; overridden by env
	if sc := os.Getenv("EUROSCALE_STORAGE_CLASS"); sc != "" {
		storageClassName = sc
	}

	sizeGB := cfg.SizeGB
	if sizeGB <= 0 {
		sizeGB = 1
	}

	pvc := &corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{
			Name:      pvcNameFor(cfg.DatabaseID),
			Namespace: r.namespace,
			Labels: map[string]string{
				"app":                        "euroscale",
				"euroscale.app/database-id": cfg.DatabaseID,
				"managed":                    "true",
			},
		},
		Spec: corev1.PersistentVolumeClaimSpec{
			AccessModes: []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
			Resources: corev1.VolumeResourceRequirements{
				Requests: corev1.ResourceList{
					corev1.ResourceStorage: resource.MustParse(fmt.Sprintf("%dGi", sizeGB)),
				},
			},
			StorageClassName: &storageClassName,
		},
	}

	created, err := r.clientset.CoreV1().PersistentVolumeClaims(r.namespace).Create(ctx, pvc, metav1.CreateOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to create PVC %q: %w", pvcNameFor(cfg.DatabaseID), err)
	}

	return created, nil
}

// findPVCByDatabaseID looks up a PVC labelled euroscale.app/database-id=<dbID>.
func (r *Resizer) findPVCByDatabaseID(ctx context.Context, dbID string) (*corev1.PersistentVolumeClaim, error) {
	list, err := r.clientset.CoreV1().PersistentVolumeClaims(r.namespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("euroscale.app/database-id=%s", dbID),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list PVCs: %w", err)
	}

	if len(list.Items) == 0 {
		return nil, fmt.Errorf("no PVC found with label euroscale.app/database-id=%s", dbID)
	}

	if len(list.Items) > 1 {
		return nil, fmt.Errorf("expected 1 PVC for database %q, found %d", dbID, len(list.Items))
	}

	return &list.Items[0], nil
}

// parseCapacityGB converts a Kubernetes quantity string (e.g. "10Gi", "1Ti") into
// gigabytes.
func parseCapacityGB(qty string) (int64, error) {
	q := strings.TrimSpace(qty)
	if q == "" {
		return 0, fmt.Errorf("empty capacity string")
	}

	multiplier := int64(1)

	// Handle binary suffixes used by Kubernetes.
	switch {
	case strings.HasSuffix(q, "Ti"):
		multiplier = 1024
		q = strings.TrimSuffix(q, "Ti")
	case strings.HasSuffix(q, "Gi"):
		q = strings.TrimSuffix(q, "Gi")
	case strings.HasSuffix(q, "Mi"):
		q = strings.TrimSuffix(q, "Mi")
		return 0, fmt.Errorf("capacity in Mi is unexpected for volume sizes")
	case strings.HasSuffix(q, "Ki"):
		q = strings.TrimSuffix(q, "Ki")
		return 0, fmt.Errorf("capacity in Ki is unexpected for volume sizes")
	default:
		// Try bare integer (bytes).
		v, err := strconv.ParseInt(q, 10, 64)
		if err != nil {
			return 0, fmt.Errorf("unrecognized capacity format: %q", qty)
		}
		gigabytes := v / (1024 * 1024 * 1024)
		if gigabytes <= 0 {
			return 0, fmt.Errorf("capacity too small: %q", qty)
		}
		return gigabytes, nil
	}

	val, err := strconv.ParseInt(q, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid numeric value in capacity %q: %w", qty, err)
	}

	return val * multiplier, nil
}
