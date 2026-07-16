// Package main implements the EuroScale autoscale checker.
//
// It runs as a Kubernetes CronJob every 5 minutes, listing all databases
// with autoscale enabled and resizing storage when PVC usage exceeds
// the configured threshold.
//
// Architecture:
//
//	1. List all K8s Secrets with label type=autoscale
//	2. For each enabled database, check current PVC size via vttablet PVCs
//	3. If storage exceeds threshold%, calculate the increment and call ResizeStorage
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
	"github.com/spscreations/euroscale-startup-kit/api/internal/tiers"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

// autoscaleConfig is the JSON shape stored in autoscale K8s Secrets.
type autoscaleConfig struct {
	Enabled          bool  `json:"enabled"`
	ThresholdPercent int32 `json:"threshold_percent"`
	IncrementPercent int32 `json:"increment_percent"`
}

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

	// List all autoscale secrets.
	secrets, err := clientset.CoreV1().Secrets(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: "app=euroscale,type=autoscale",
	})
	if err != nil {
		log.Printf("ERROR: failed to list autoscale secrets: %v", err)
		os.Exit(1)
	}

	if len(secrets.Items) == 0 {
		log.Println("No autoscale secrets found — nothing to check.")
		return
	}

	log.Printf("Found %d autoscale secret(s)", len(secrets.Items))

	for _, secret := range secrets.Items {
		dbID := secret.Labels["database"]
		if dbID == "" {
			log.Printf("WARN: autoscale secret %q has no database label — skipping", secret.Name)
			continue
		}

		// Parse autoscale config.
		cfgJSON, ok := secret.Data["autoscale.json"]
		if !ok {
			log.Printf("WARN: autoscale secret for %q has no autoscale.json key — skipping", dbID)
			continue
		}

		var cfg autoscaleConfig
		if err := json.Unmarshal(cfgJSON, &cfg); err != nil {
			log.Printf("ERROR: failed to unmarshal autoscale config for %q: %v", dbID, err)
			continue
		}

		if !cfg.Enabled {
			log.Printf("INFO: autoscale disabled for database %q — skipping", dbID)
			continue
		}

		log.Printf("INFO: checking autoscale for database %q (threshold=%d%%, increment=%d%%)",
			dbID, cfg.ThresholdPercent, cfg.IncrementPercent)

		// Check if autoscale is needed.
		shouldScale, incrementGB, err := resizer.CheckAutoscale(ctx, dbID, cfg.ThresholdPercent, cfg.IncrementPercent)
		if err != nil {
			log.Printf("ERROR: failed to check autoscale for %q: %v", dbID, err)
			continue
		}

		if !shouldScale {
			log.Printf("INFO: database %q is below threshold — no resize needed", dbID)
			continue
		}

		tierStore := tiers.NewStore(clientset, namespace)

		log.Printf("INFO: triggering autoscale resize for database %q (increment=%d GB)", dbID, incrementGB)

		// ── Tier limit enforcement ────────────────────────────
		userID := secret.Labels["user_id"]
		if userID != "" {
			tier := tierStore.GetTierForUser(ctx, userID)
			currentGB, _ := resizer.GetCurrentStorage(ctx, dbID)
			requestedTotal := currentGB + int64(incrementGB)
			if tier.MaxStorageGB != tiers.UnlimitedDBs && requestedTotal > tier.MaxStorageGB {
				log.Printf("SKIP: tier limit for user %q on %s plan: %d GB max (current=%d, requested=%d)",
					userID, tier.Name, tier.MaxStorageGB, currentGB, requestedTotal)
				continue
			}
		}

		// Perform the resize.
		newTotalGB, err := resizer.ResizeStorage(ctx, dbID, incrementGB)
		if err != nil {
			log.Printf("ERROR: failed to resize storage for %q: %v", dbID, err)
			continue
		}

		log.Printf("INFO: successfully resized storage for database %q to %d GB", dbID, newTotalGB)

		// Save a record of the autoscale event as a K8s Secret annotation.
		if err := recordAutoscaleEvent(ctx, clientset, namespace, dbID, incrementGB, newTotalGB); err != nil {
			log.Printf("WARN: failed to record autoscale event for %q: %v", dbID, err)
		}
	}

	log.Println("Autoscale check complete.")
}

// recordAutoscaleEvent stores metadata about the autoscale action as an
// annotation on the autoscale Secret so operators can see resize history.
func recordAutoscaleEvent(ctx context.Context, clientset *kubernetes.Clientset, namespace, dbID string, incrementGB int32, newTotalGB int64) error {
	secretName := fmt.Sprintf("autoscale-%s", dbID)

	secret, err := clientset.CoreV1().Secrets(namespace).Get(ctx, secretName, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get autoscale secret: %w", err)
	}

	if secret.Annotations == nil {
		secret.Annotations = make(map[string]string)
	}

	eventKey := fmt.Sprintf("euroscale.app/last-autoscale-%d", time.Now().Unix())
	eventValue := fmt.Sprintf("resized_by=%dGB,new_total=%dGB", incrementGB, newTotalGB)
	secret.Annotations[eventKey] = eventValue

	// Keep only the last 10 autoscale events.
	var keys []string
	for k := range secret.Annotations {
		if len(k) > len("euroscale.app/last-autoscale-") &&
			k[:len("euroscale.app/last-autoscale-")] == "euroscale.app/last-autoscale-" {
			keys = append(keys, k)
		}
	}
	if len(keys) > 10 {
		// Simple cleanup: remove the oldest key.
		for i := 0; i < len(keys)-10; i++ {
			delete(secret.Annotations, keys[i])
		}
	}

	_, err = clientset.CoreV1().Secrets(namespace).Update(ctx, secret, metav1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("failed to update autoscale secret annotations: %w", err)
	}

	return nil
}
