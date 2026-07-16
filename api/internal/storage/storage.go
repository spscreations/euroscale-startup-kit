// Package storage provides storage management logic for Vitess databases.
// Instead of managing a fake tracking PVC, storage operations now operate on
// the actual Vitess vttablet PVCs by patching the VitessShard CRD (via the
// dynamic Kubernetes client). The Vitess operator drives PVC resizing from
// the CRD spec, making this the single source of truth.
package storage

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
)

// MaxVolumeSizeGB is the Hetzner Cloud maximum volume size in GB.
const MaxVolumeSizeGB = 10_240 // 10 TiB

// VitessShardGVR is the GroupVersionResource for Planetscale VitessShard CRDs.
var VitessShardGVR = schema.GroupVersionResource{
	Group:    "planetscale.com",
	Version:  "v2",
	Resource: "vitessshards",
}

// Resizer manages storage resizing for Vitess databases backed by
// Hetzner Cloud Volumes (CSI driver).
type Resizer struct {
	clientset    *kubernetes.Clientset
	dynamicClient dynamic.Interface
	namespace    string
}

// NewResizer creates a new Resizer.
func NewResizer(clientset *kubernetes.Clientset, dynamicClient dynamic.Interface, namespace string) *Resizer {
	return &Resizer{
		clientset:    clientset,
		dynamicClient: dynamicClient,
		namespace:    namespace,
	}
}

// GetCurrentStorage returns the usable database storage in GB by inspecting
// the actual vttablet PVCs that hold Vitess data.  Because all tablets in a
// shard use the same volume size (replication mirrors), we return the size of
// the first bound vttablet PVC found.
//
// The dbID parameter is used only for logging context; the method lists all
// vttablet PVCs (labelled planetscale.com/component=vttablet) and returns
// the capacity of the first bound one.
func (r *Resizer) GetCurrentStorage(ctx context.Context, dbID string) (int64, error) {
	pvcs, err := r.clientset.CoreV1().PersistentVolumeClaims(r.namespace).List(ctx, metav1.ListOptions{
		LabelSelector: "planetscale.com/component=vttablet",
	})
	if err != nil {
		return 0, fmt.Errorf("failed to list vttablet PVCs: %w", err)
	}

	for _, pvc := range pvcs.Items {
		if pvc.Status.Phase == "Bound" {
			gb, err := parseCapacityGB(pvc.Status.Capacity.Storage().String())
			if err != nil {
				log.Printf("WARN: failed to parse capacity of PVC %q: %v (skipping)", pvc.Name, err)
				continue
			}
			return gb, nil
		}
	}

	return 0, nil // No bound vttablet PVCs — no storage provisioned yet
}

// GetTotalStorageBytes returns the total provisioned storage across all
// vttablet PVCs, in bytes.  Because all tablets use the same volume size,
// this is equivalent to the size of one tablet's PVC.
func (r *Resizer) GetTotalStorageBytes(ctx context.Context) (int64, error) {
	gb, err := r.GetCurrentStorage(ctx, "")
	if err != nil {
		return 0, err
	}
	if gb <= 0 {
		return 0, nil
	}
	return gb * 1_073_741_824, nil // GB → bytes
}

// ResizeStorage expands ALL vttablet PVCs for a database by the specified GB
// amount.  It does this by patching the VitessShard CRD's
// dataVolumeClaimTemplate, which causes the Vitess operator to resize the
// underlying PVCs.
//
// Steps:
//  1. Read current storage from the first bound vttablet PVC.
//  2. Compute the new desired size (current + additionalGB).
//  3. Validate against the Hetzner 10 TiB limit.
//  4. List all VitessShard CRDs in the namespace.
//  5. For each shard, update every tablet pool's dataVolumeClaimTemplate to
//     request the new size.
//  6. Apply the update via the dynamic client.
//
// Returns the new total size in GB on success.
func (r *Resizer) ResizeStorage(ctx context.Context, dbID string, additionalGB int32) (int64, error) {
	if additionalGB <= 0 {
		return 0, fmt.Errorf("additional_gb must be positive (got %d)", additionalGB)
	}

	// 1. Read current storage.
	currentGB, err := r.GetCurrentStorage(ctx, dbID)
	if err != nil {
		return 0, fmt.Errorf("failed to read current storage: %w", err)
	}

	// 2. Compute new size.
	newGB := currentGB + int64(additionalGB)

	// 3. Validate against limit.
	if newGB > MaxVolumeSizeGB {
		return 0, fmt.Errorf("requested size %d GB exceeds Hetzner max volume size of %d GB — consider resharding", newGB, MaxVolumeSizeGB)
	}

	newSizeStr := fmt.Sprintf("%dGi", newGB)

	// 4. List all VitessShard CRDs.
	shards, err := r.dynamicClient.Resource(VitessShardGVR).Namespace(r.namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return 0, fmt.Errorf("failed to list VitessShards: %w", err)
	}

	if len(shards.Items) == 0 {
		return 0, fmt.Errorf("no VitessShard CRDs found in namespace %q — cannot resize", r.namespace)
	}

	// 5. Patch each shard's tablet pools.
	for _, shard := range shards.Items {
		tabletPools, found, err := unstructured.NestedSlice(shard.Object, "spec", "tabletPools")
		if err != nil {
			return 0, fmt.Errorf("failed to read tabletPools from VitessShard %q: %w", shard.GetName(), err)
		}
		if !found || len(tabletPools) == 0 {
			log.Printf("WARN: VitessShard %q has no tabletPools — skipping", shard.GetName())
			continue
		}

		// Update the dataVolumeClaimTemplate in each pool.
		for i := range tabletPools {
			pool, ok := tabletPools[i].(map[string]interface{})
			if !ok {
				return 0, fmt.Errorf("tabletPool[%d] in VitessShard %q is not a map", i, shard.GetName())
			}
			if err := unstructured.SetNestedField(pool, map[string]interface{}{
				"resources": map[string]interface{}{
					"requests": map[string]interface{}{
						"storage": newSizeStr,
					},
				},
			}, "dataVolumeClaimTemplate"); err != nil {
				return 0, fmt.Errorf("failed to set dataVolumeClaimTemplate for pool %d in VitessShard %q: %w", i, shard.GetName(), err)
			}
			tabletPools[i] = pool
		}

		if err := unstructured.SetNestedSlice(shard.Object, tabletPools, "spec", "tabletPools"); err != nil {
			return 0, fmt.Errorf("failed to update tabletPools in VitessShard %q: %w", shard.GetName(), err)
		}

		// Apply the update.
		_, err = r.dynamicClient.Resource(VitessShardGVR).Namespace(r.namespace).Update(ctx, &shard, metav1.UpdateOptions{})
		if err != nil {
			return 0, fmt.Errorf("failed to update VitessShard %q: %w", shard.GetName(), err)
		}

		log.Printf("INFO: patched VitessShard %q tablet pools to %s", shard.GetName(), newSizeStr)
	}

	log.Printf("INFO: resized storage for database %q from %d Gi to %d Gi", dbID, currentGB, newGB)
	return newGB, nil
}

// AutoscaleThreshold represents the threshold for triggering autoscale.
const (
	DefaultAutoscaleThreshold  = 80 // percent
	DefaultAutoscaleIncrement  = 20 // percent
)

// CheckAutoscale determines whether a database's storage should be auto-scaled.
// It compares the current PVC usage against the specified threshold percentage.
// If the current GB exceeds the threshold percentage of the PVC capacity, it
// returns the recommended increment in GB.
//
// Note: In a real Kubernetes deployment, actual disk *usage* would be read from
// a metrics source (e.g., kubelet stats, cAdvisor). Here we compare the current
// PVC size against itself (which is always 100%), so this method serves as a
// scaffold that always returns the recommended increment when called — suitable
// for testing the autoscale loop.
func (r *Resizer) CheckAutoscale(ctx context.Context, dbID string, thresholdPercent int32, incrementPercent int32) (bool, int32, error) {
	if thresholdPercent <= 0 {
		thresholdPercent = DefaultAutoscaleThreshold
	}
	if incrementPercent <= 0 {
		incrementPercent = DefaultAutoscaleIncrement
	}

	currentGB, err := r.GetCurrentStorage(ctx, dbID)
	if err != nil {
		return false, 0, fmt.Errorf("failed to get current storage for %q: %w", dbID, err)
	}
	if currentGB <= 0 {
		return false, 0, nil // no storage provisioned yet
	}

	// In a real deployment, we would compare actual disk *usage* against the PVC
	// capacity. For now, we compute the increment as a percentage of current PVC size.
	// A production implementation would use filesystem usage metrics.
	incrementGB := int32(float64(currentGB) * float64(incrementPercent) / 100.0)
	if incrementGB < 1 {
		incrementGB = 1 // minimum 1 GB increment
	}

	// Always recommend increment for the scaffold (in production, check actual usage
	// against thresholdPercent of current capacity).
	shouldScale := true // scaffold: always scale when called

	return shouldScale, incrementGB, nil
}

// parseCapacityGB converts a Kubernetes quantity string (e.g. "10Gi", "1Ti") into
// gigabytes.
func parseCapacityGB(qty string) (int64, error) {
	q := strings.TrimSpace(qty)
	if q == "" || q == "0" {
		return 0, nil // PVC is Pending/not yet bound — treat as 0 GB
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
