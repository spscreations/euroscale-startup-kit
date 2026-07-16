// Package main implements the EuroScale metrics collector.
//
// It runs as a Kubernetes CronJob every 5 minutes, collecting CPU and disk
// usage metrics for all euroscale-managed databases and storing them in
// per-database ConfigMaps.
//
// Architecture:
//
//	1. List all database credentials Secrets (label: app=euroscale, managed=true)
//	2. For each database, read current PVC size from vttablet PVCs
//	3. Read CPU usage from cAdvisor / K8s metrics API (placeholder for now)
//	4. Store a data point in the ConfigMap "metrics-{databaseID}" as JSON array
//	5. Prune old data points to keep a maximum of 288 (24h at 5-min intervals)
//
// This is a standalone binary designed to run as a CronJob container.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/spscreations/euroscale-startup-kit/api/internal/storage"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

// metricPoint represents a single data point for CPU and disk usage.
type metricPoint struct {
	Timestamp  int64   `json:"ts"`
	CPUPercent float64 `json:"cpu_pct"`
	DiskGB     float64 `json:"disk_gb"`
}

const (
	// maxMetricPoints is the maximum number of data points to retain (24h at 5-min intervals = 288).
	maxMetricPoints = 288

	// metricsConfigMapPrefix is the prefix for per-database metrics ConfigMaps.
	metricsConfigMapPrefix = "metrics-"
)

func main() {
	namespace := os.Getenv("NAMESPACE")
	if namespace == "" {
		namespace = "euroscale"
	}

	// Create in-cluster K8s clientset.
	config, err := rest.InClusterConfig()
	if err != nil {
		log.Fatalf("Failed to create in-cluster K8s config: %v", err)
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		log.Fatalf("Failed to create K8s clientset: %v", err)
	}

	dynamicClient, err := dynamic.NewForConfig(config)
	if err != nil {
		log.Fatalf("Failed to create dynamic K8s client: %v", err)
	}

	resizer := storage.NewResizer(clientset, dynamicClient, namespace)

	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
	defer cancel()

	// List all database credentials secrets.
	secrets, err := clientset.CoreV1().Secrets(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: "app=euroscale,managed=true,!usage",
	})
	if err != nil {
		log.Printf("ERROR: failed to list database secrets: %v", err)
		os.Exit(1)
	}

	now := time.Now().Unix()
	var collected int

	for _, secret := range secrets.Items {
		dbID := secret.Labels["database"]
		if dbID == "" {
			continue
		}

		// Get current storage from vttablet PVCs.
		diskGB, err := resizer.GetCurrentStorage(ctx, dbID)
		if err != nil {
			log.Printf("WARN: failed to get storage for %q: %v", dbID, err)
			continue
		}

		// CPU usage placeholder. In production, this would query the K8s
		// metrics API or cAdvisor for the Vitess tablet pods.
		cpuPct := getCPUUsage(ctx, clientset, namespace, dbID)

		// Load existing metrics from ConfigMap.
		points, err := loadMetrics(ctx, clientset, namespace, dbID)
		if err != nil {
			log.Printf("WARN: failed to load existing metrics for %q: %v — starting fresh", dbID, err)
			points = []metricPoint{}
		}

		// Append new data point.
		point := metricPoint{
			Timestamp:  now,
			CPUPercent: cpuPct,
			DiskGB:     float64(diskGB),
		}
		points = append(points, point)

		// Prune to maxMetricPoints.
		if len(points) > maxMetricPoints {
			points = points[len(points)-maxMetricPoints:]
		}

		// Save back to ConfigMap.
		if err := saveMetrics(ctx, clientset, namespace, dbID, points); err != nil {
			log.Printf("ERROR: failed to save metrics for %q: %v", dbID, err)
			continue
		}

		collected++
		log.Printf("INFO: collected metrics for database %q (disk=%.1f GB, cpu=%.1f%%, total_points=%d)",
			dbID, float64(diskGB), cpuPct, len(points))
	}

	if collected == 0 {
		log.Println("No databases found — nothing to collect.")
	} else {
		log.Printf("Metrics collection complete. Collected data for %d database(s).", collected)
	}
}

// getCPUUsage returns CPU usage as a percentage for the given database.
// This is a placeholder that returns 0 until cAdvisor or K8s metrics API
// integration is added.
func getCPUUsage(ctx context.Context, clientset *kubernetes.Clientset, namespace, dbID string) float64 {
	// TODO: In production, query K8s metrics API for the vttablet pods
	// associated with this database's VitessShard. For now, return 0.
	//
	// Example production implementation:
	//  1. Find the VitessShard CRD for this database
	//  2. List vttablet pods in that shard
	//  3. Query metrics.k8s.io/v1beta1 for pod CPU metrics
	//  4. Return the average CPU percentage across all tablet pods
	return 0.0
}

// loadMetrics reads the existing metrics array from the per-database ConfigMap.
func loadMetrics(ctx context.Context, clientset *kubernetes.Clientset, namespace, dbID string) ([]metricPoint, error) {
	cmName := metricsConfigMapPrefix + dbID

	cm, err := clientset.CoreV1().ConfigMaps(namespace).Get(ctx, cmName, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("ConfigMap %q not found: %w", cmName, err)
	}

	var data []byte
	if d, ok := cm.BinaryData["metrics.json"]; ok {
		data = d
	} else if d, ok := cm.Data["metrics.json"]; ok {
		data = []byte(d)
	} else {
		// No metrics yet.
		return []metricPoint{}, nil
	}

	var points []metricPoint
	if err := json.Unmarshal(data, &points); err != nil {
		return nil, fmt.Errorf("failed to unmarshal metrics: %w", err)
	}

	return points, nil
}

// saveMetrics stores the metrics array in a per-database ConfigMap.
func saveMetrics(ctx context.Context, clientset *kubernetes.Clientset, namespace, dbID string, points []metricPoint) error {
	data, err := json.Marshal(points)
	if err != nil {
		return fmt.Errorf("failed to marshal metrics: %w", err)
	}

	cmName := metricsConfigMapPrefix + dbID

	cm := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      cmName,
			Namespace: namespace,
			Labels: map[string]string{
				"app":      "euroscale",
				"type":     "metrics",
				"database": dbID,
			},
		},
		Data: map[string]string{
			"metrics.json": string(data),
		},
	}

	// Try to update first; if not found, create.
	_, err = clientset.CoreV1().ConfigMaps(namespace).Update(ctx, cm, metav1.UpdateOptions{})
	if err != nil {
		_, err = clientset.CoreV1().ConfigMaps(namespace).Create(ctx, cm, metav1.CreateOptions{})
		if err != nil {
			return fmt.Errorf("failed to create/update ConfigMap: %w", err)
		}
	}

	return nil
}
