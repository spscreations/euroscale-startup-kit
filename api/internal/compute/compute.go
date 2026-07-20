// Package compute provides compute-unit management for Vitess databases.
// It patches VitessShard CRDs to adjust vttablet and mysqld CPU resource
// limits, where 1 CU (compute unit) = 1000m CPU split as:
//
//	vttablet: 340m
//	mysqld:   660m
package compute

import (
	"context"
	"fmt"
	"log"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
)

// VitessShardGVR is the GroupVersionResource for Planetscale VitessShard CRDs.
var VitessShardGVR = schema.GroupVersionResource{
	Group:    "planetscale.com",
	Version:  "v2",
	Resource: "vitessshards",
}

// CUMilliCPU is the millicpu per compute unit.
const CUMilliCPU = 1000 // 1 CU = 1000m

// CPU split per component (must sum to CUMilliCPU).
const (
	VttabletMilliCPU = 340 // 340m per CU
	MysqldMilliCPU   = 660 // 660m per CU
)

// Resizer manages compute resizing for Vitess databases.
type Resizer struct {
	dynamicClient dynamic.Interface
	namespace     string
}

// NewResizer creates a new compute Resizer.
func NewResizer(dynamicClient dynamic.Interface, namespace string) *Resizer {
	return &Resizer{
		dynamicClient: dynamicClient,
		namespace:     namespace,
	}
}

// GetCurrentCU returns the current total CU for a database by reading the
// CPU limits from the first VitessShard's tablet pool.
func (r *Resizer) GetCurrentCU(ctx context.Context, databaseID string) (float64, error) {
	shards, err := r.dynamicClient.Resource(VitessShardGVR).Namespace(r.namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return 0, fmt.Errorf("failed to list VitessShards: %w", err)
	}

	if len(shards.Items) == 0 {
		return 0, nil // no shards yet
	}

	// Read from first shard's first tablet pool's vttablet CPU limit.
	shard := shards.Items[0]
	tabletPools, found, err := unstructured.NestedSlice(shard.Object, "spec", "tabletPools")
	if err != nil || !found || len(tabletPools) == 0 {
		return 0, nil
	}

	pool, ok := tabletPools[0].(map[string]interface{})
	if !ok {
		return 0, nil
	}

	vttablet, found, err := unstructured.NestedMap(pool, "vttablet", "resources", "limits")
	if err != nil || !found {
		return 0, nil
	}

	cpuStr, ok := vttablet["cpu"].(string)
	if !ok {
		return 0, nil
	}

	var vttabletMilli int64
	if _, err := fmt.Sscanf(cpuStr, "%dm", &vttabletMilli); err != nil {
		// Try bare float (e.g. "1" = 1 core = 1000m)
		var cores float64
		if _, err := fmt.Sscanf(cpuStr, "%f", &cores); err != nil {
			return 0, nil
		}
		vttabletMilli = int64(cores * 1000)
	}

	// Convert from vttablet millicpu to CU (vttablet gets 340m per CU)
	cu := float64(vttabletMilli) / float64(VttabletMilliCPU)
	return cu, nil
}

// ResizeCompute adjusts the CPU limits for all shards of a database by the
// specified additional CU. It patches each shard's tablet pools to update
// vttablet and mysqld resource limits.
//
// Returns the new total CU after the resize.
func (r *Resizer) ResizeCompute(ctx context.Context, databaseID string, additionalCU float64) (float64, error) {
	if additionalCU <= 0 {
		return 0, fmt.Errorf("additional_cu must be positive (got %f)", additionalCU)
	}

	// 1. Read current CU.
	currentCU, err := r.GetCurrentCU(ctx, databaseID)
	if err != nil {
		return 0, fmt.Errorf("failed to read current CU: %w", err)
	}

	// 2. Compute new total.
	newTotalCU := currentCU + additionalCU

	// 3. Convert to millicpu per component.
	vttabletCPU := fmt.Sprintf("%dm", int(newTotalCU*float64(VttabletMilliCPU)))
	mysqldCPU := fmt.Sprintf("%dm", int(newTotalCU*float64(MysqldMilliCPU)))

	// 4. List all VitessShard CRDs.
	shards, err := r.dynamicClient.Resource(VitessShardGVR).Namespace(r.namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return 0, fmt.Errorf("failed to list VitessShards: %w", err)
	}

	if len(shards.Items) == 0 {
		return 0, fmt.Errorf("no VitessShard CRDs found in namespace %q — cannot resize compute", r.namespace)
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

		for i := range tabletPools {
			pool, ok := tabletPools[i].(map[string]interface{})
			if !ok {
				return 0, fmt.Errorf("tabletPool[%d] in VitessShard %q is not a map", i, shard.GetName())
			}

			// Set vttablet CPU limits.
			if err := unstructured.SetNestedField(pool, map[string]interface{}{
				"cpu": vttabletCPU,
			}, "vttablet", "resources", "limits"); err != nil {
				return 0, fmt.Errorf("failed to set vttablet CPU limit for pool %d in VitessShard %q: %w", i, shard.GetName(), err)
			}

			// Set mysqld CPU limits.
			if err := unstructured.SetNestedField(pool, map[string]interface{}{
				"cpu": mysqldCPU,
			}, "mysqld", "resources", "limits"); err != nil {
				return 0, fmt.Errorf("failed to set mysqld CPU limit for pool %d in VitessShard %q: %w", i, shard.GetName(), err)
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

		log.Printf("INFO: patched VitessShard %q compute to vttablet=%s mysqld=%s (%.2f CU total)",
			shard.GetName(), vttabletCPU, mysqldCPU, newTotalCU)
	}

	log.Printf("INFO: resized compute for database %q from %.2f CU to %.2f CU (+%.2f CU)",
		databaseID, currentCU, newTotalCU, additionalCU)

	return newTotalCU, nil
}
