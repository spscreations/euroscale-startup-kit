// Package pitr provides the Point-In-Time Recovery (PITR) backend API for
// EuroScale databases. It supports listing backups from both VitessBackup
// CRD objects and vtctlclient, triggering K8s Job-based restores, and
// tracking restore status.
package pitr

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
)

// VitessBackupGVR is the GroupVersionResource for Planetscale VitessBackup CRDs.
// This is configurable — the Planetscale Vitess operator registers backups
// under planetscale.com/v2.
var VitessBackupGVR = schema.GroupVersionResource{
	Group:    "planetscale.com",
	Version:  "v2",
	Resource: "vitessbackups",
}

// ── Types ─────────────────────────────────────────────────────────────────────

// BackupInfo represents a single database backup.
type BackupInfo struct {
	ID       string `json:"id"`
	Keyspace string `json:"keyspace"`
	Cell     string `json:"cell,omitempty"`
	Type     string `json:"type"`     // "full" or "incremental"
	Position string `json:"position"` // GTID position for PITR
	Time     string `json:"time"`     // ISO 8601 timestamp
	Size     int64  `json:"size"`     // bytes
	Status   string `json:"status"`   // "completed", "in-progress", "failed"
}

// RestoreRequest is the JSON body for POST /api/v1/restore.
type RestoreRequest struct {
	DatabaseID       string `json:"database_id"`
	RestoreTimestamp string `json:"restore_timestamp"` // PITR target, ISO 8601
	RestoreType      string `json:"restore_type"`      // "pitr" or "latest"
	Keyspace         string `json:"keyspace,omitempty"`  // Vitess keyspace name (default "main")
	Shard            string `json:"shard,omitempty"`     // Vitess shard name (default "-")
}

// RestoreInfo tracks the state of a single restore operation.
type RestoreInfo struct {
	RestoreID        string    `json:"restore_id"`
	DatabaseID       string    `json:"database_id"`
	RestoreTimestamp string    `json:"restore_timestamp,omitempty"`
	RestoreType      string    `json:"restore_type"`
	Status           string    `json:"status"` // "in-progress", "completed", "failed"
	JobName          string    `json:"job_name"`
	ErrorMessage     string    `json:"error_message,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
	CompletedAt      *time.Time `json:"completed_at,omitempty"`
}

// ── HTTP response shapes ──────────────────────────────────────────────────────

type listBackupsResponse struct {
	Backups []BackupInfo `json:"backups"`
}

type triggerRestoreResponse struct {
	RestoreID string `json:"restore_id"`
	Status    string `json:"status"`
}

type listRestoresResponse struct {
	Restores []RestoreInfo `json:"restores"`
}

// ── Handler ───────────────────────────────────────────────────────────────────

// Handler manages PITR backup listing, restore triggering, and status tracking.
type Handler struct {
	clientset     kubernetes.Interface
	dynamicClient dynamic.Interface
	vtctldAddr    string
	namespace     string

	mu             sync.RWMutex
	activeRestores map[string]*RestoreInfo // restoreID -> info (in-memory)
}

// NewHandler creates a new PITR handler.
func NewHandler(clientset kubernetes.Interface, dynamicClient dynamic.Interface, vtctldAddr, namespace string) *Handler {
	return &Handler{
		clientset:      clientset,
		dynamicClient:  dynamicClient,
		vtctldAddr:     vtctldAddr,
		namespace:      namespace,
		activeRestores: make(map[string]*RestoreInfo),
	}
}

// ── HTTP Handlers ─────────────────────────────────────────────────────────────

// HandleListBackups handles GET /api/v1/backups?database_id=&user_id=
//
// It queries both VitessBackup CRD objects in the cluster and runs
// vtctlclient to list available backups, merging the results.
func (h *Handler) HandleListBackups(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	databaseID := r.URL.Query().Get("database_id")
	// userID := r.URL.Query().Get("user_id") // reserved for future ACL filtering

	backups := make([]BackupInfo, 0)

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	// 1. Query VitessBackup CRD objects in the cluster.
	crdBackups, err := h.listCRDBackups(ctx, databaseID)
	if err != nil {
		log.Printf("WARNING: failed to list VitessBackup CRDs: %v", err)
		// Don't fail — fall through to vtctlclient.
	} else {
		backups = append(backups, crdBackups...)
	}

	// 2. Run vtctlclient to list available backups for the keyspace.
	//    The database ID maps to a keyspace name via K8s secrets.
	vtBackups, err := h.listVtctlBackups(ctx, databaseID)
	if err != nil {
		log.Printf("WARNING: failed to list backups via vtctlclient: %v", err)
	} else {
		backups = append(backups, vtBackups...)
	}

	// Deduplicate by ID.
	seen := make(map[string]bool)
	deduped := make([]BackupInfo, 0, len(backups))
	for _, b := range backups {
		if !seen[b.ID] {
			seen[b.ID] = true
			deduped = append(deduped, b)
		}
	}

	writeJSON(w, http.StatusOK, listBackupsResponse{Backups: deduped})
}

// HandleTriggerBackup handles POST /api/v1/backups-trigger — triggers a full backup
// via vtctldclient BackupShard for the main/- keyspace.
func (h *Handler) HandleTriggerBackup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	keyspace := "main"
	shard := "-"

	log.Printf("INFO: triggering full backup for keyspace=%s shard=%s", keyspace, shard)
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	output, err := runCommand(ctx, "vtctldclient",
		"--server", h.vtctldAddr,
		"BackupShard",
		keyspace+"/"+shard,
	)
	if err != nil {
		log.Printf("ERROR: BackupShard failed: %v output=%s", err, output)
		writeJSON(w, http.StatusInternalServerError, map[string]string{
			"message": "backup failed: " + err.Error(),
		})
		return
	}

	log.Printf("INFO: backup triggered: %s", output)
	writeJSON(w, http.StatusAccepted, map[string]string{
		"status":  "triggered",
		"message": "backup started",
		"detail":  output,
	})
}

// HandleTriggerIncrementalBackup handles POST /api/v1/incremental-backup-trigger
// — triggers an incremental backup via vtctldclient BackupShard --incremental-from-pos.
//
// Request body (optional):
//
//	{
//	  "from_position": "MySQL56/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:1-N"
//	}
//
// If from_position is omitted, the current GTID position is auto-detected.
func (h *Handler) HandleTriggerIncrementalBackup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	keyspace := "main"
	shard := "-"

	// Parse optional body for explicit position.
	var body struct {
		FromPosition string `json:"from_position"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	// If no explicit position, fetch current GTID.
	fromPos := body.FromPosition
	if fromPos == "" {
		log.Printf("INFO: no from_position provided — auto-detecting current GTID...")
		pos, err := h.fetchCurrentGTID(ctx, keyspace, shard)
		if err != nil {
			log.Printf("ERROR: failed to get current GTID: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{
				"message": "failed to get GTID position: " + err.Error(),
			})
			return
		}
		fromPos = pos
		log.Printf("INFO: auto-detected GTID: %s", fromPos)
	}

	log.Printf("INFO: triggering incremental backup for %s/%s from pos=%s", keyspace, shard, fromPos)

	output, err := runCommand(ctx, "vtctldclient",
		"--server", h.vtctldAddr,
		"BackupShard",
		"--incremental-from-pos="+fromPos,
		keyspace+"/"+shard,
	)
	if err != nil {
		log.Printf("ERROR: incremental BackupShard failed: %v output=%s", err, output)
		writeJSON(w, http.StatusInternalServerError, map[string]string{
			"message": "incremental backup failed: " + err.Error(),
		})
		return
	}

	log.Printf("INFO: incremental backup triggered: %s", output)
	writeJSON(w, http.StatusAccepted, map[string]string{
		"status":       "triggered",
		"message":      "incremental backup started",
		"from_position": fromPos,
		"detail":       output,
	})
}

// fetchCurrentGTID queries the current GTID position from the shard primary
// via vtctldclient ShardReplicationPositions.
func (h *Handler) fetchCurrentGTID(ctx context.Context, keyspace, shard string) (string, error) {
	output, err := runCommand(ctx, "vtctldclient",
		"--server", h.vtctldAddr,
		"ShardReplicationPositions",
		keyspace+"/"+shard,
	)
	if err != nil {
		return "", fmt.Errorf("ShardReplicationPositions: %w", err)
	}

	// Extract MySQL56/... GTID set from the output.
	re := regexp.MustCompile(`MySQL56/[0-9a-f\-:]+`)
	matches := re.FindString(output)
	if matches == "" {
		return "", fmt.Errorf("no GTID position found in output: %s", output)
	}
	return matches, nil
}

// HandleTriggerRestore handles POST /api/v1/restore
//
// Request body:
//
//	{
//	  "database_id": "...",
//	  "restore_timestamp": "2026-07-04T14:30:00Z",
//	  "restore_type": "pitr"
//	}
//
// On trigger, a K8s Job is created to perform the restore asynchronously.
// The response returns immediately with the restore ID.
func (h *Handler) HandleTriggerRestore(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req RestoreRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "invalid request body"})
		return
	}

	if req.DatabaseID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "database_id is required"})
		return
	}
	if req.RestoreType == "" {
		req.RestoreType = "pitr"
	}
	if req.RestoreType != "pitr" && req.RestoreType != "latest" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "restore_type must be 'pitr' or 'latest'"})
		return
	}

	// Validate PITR requires a timestamp.
	if req.RestoreType == "pitr" && req.RestoreTimestamp == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "restore_timestamp is required for pitr restore type"})
		return
	}

	// Default keyspace and shard.
	if req.Keyspace == "" {
		req.Keyspace = "main"
	}
	if req.Shard == "" {
		req.Shard = "-"
	}

	restoreID := uuid.New().String()
	jobName := fmt.Sprintf("euroscale-restore-%s", strings.ReplaceAll(restoreID[:8], "-", ""))

	now := time.Now().UTC()
	info := &RestoreInfo{
		RestoreID:        restoreID,
		DatabaseID:       req.DatabaseID,
		RestoreTimestamp: req.RestoreTimestamp,
		RestoreType:      req.RestoreType,
		Status:           "in-progress",
		JobName:          jobName,
		CreatedAt:        now,
	}

	// Store in-memory for status tracking.
	h.mu.Lock()
	h.activeRestores[restoreID] = info
	h.mu.Unlock()

	// Create the K8s Job in a background goroutine.
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()

		if err := h.createRestoreJob(ctx, jobName, req); err != nil {
			log.Printf("ERROR: failed to create restore job %s: %v", jobName, err)
			h.mu.Lock()
			info.Status = "failed"
			info.ErrorMessage = err.Error()
			now := time.Now().UTC()
			info.CompletedAt = &now
			h.mu.Unlock()
		}
	}()

	log.Printf("INFO: triggered restore %s (type=%s) for database %s, job=%s",
		restoreID, req.RestoreType, req.DatabaseID, jobName)

	writeJSON(w, http.StatusAccepted, triggerRestoreResponse{
		RestoreID: restoreID,
		Status:    "in-progress",
	})
}

// HandleRestoreStatus handles GET /api/v1/restores?database_id=
//
// Returns a list of past and in-progress restores with status.
func (h *Handler) HandleRestoreStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	databaseID := r.URL.Query().Get("database_id")

	h.mu.RLock()
	defer h.mu.RUnlock()

	restores := make([]RestoreInfo, 0, len(h.activeRestores))
	for _, info := range h.activeRestores {
		if databaseID != "" && info.DatabaseID != databaseID {
			continue
		}
		// Sync status from the K8s Job if still in-progress.
		if info.Status == "in-progress" {
			h.syncJobStatus(info)
		}
		restores = append(restores, *info)
	}

	if restores == nil {
		restores = []RestoreInfo{}
	}

	writeJSON(w, http.StatusOK, listRestoresResponse{Restores: restores})
}

// ── Internal helpers ──────────────────────────────────────────────────────────

// listCRDBackups lists backups from the VitessBackup CRD objects.
func (h *Handler) listCRDBackups(ctx context.Context, databaseID string) ([]BackupInfo, error) {
	list, err := h.dynamicClient.Resource(VitessBackupGVR).Namespace(h.namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list VitessBackup CRDs: %w", err)
	}

	backups := make([]BackupInfo, 0, len(list.Items))
	for _, item := range list.Items {
		backup := h.parseCRDBackup(item)
		// TODO: filter by keyspace matching database_id when available
		backups = append(backups, backup)
	}

	return backups, nil
}

// parseCRDBackup extracts BackupInfo from a VitessBackup unstructured object.
func (h *Handler) parseCRDBackup(item unstructured.Unstructured) BackupInfo {
	info := BackupInfo{
		ID:     item.GetName(),
		Status: "completed",
	}

	// Try to pull from spec.keyspace and spec.type.
	if spec, ok := item.Object["spec"].(map[string]interface{}); ok {
		if ks, ok := spec["keyspace"].(string); ok {
			info.Keyspace = ks
		}
		if bt, ok := spec["type"].(string); ok {
			info.Type = bt
		}
	}

	// Try to pull from status fields.
	if status, ok := item.Object["status"].(map[string]interface{}); ok {
		if pos, ok := status["position"].(string); ok {
			info.Position = pos
		}
		if t, ok := status["time"].(string); ok {
			info.Time = t
		}
		if sz, ok := status["size"].(float64); ok {
			info.Size = int64(sz)
		}
		if complete, ok := status["complete"].(bool); ok && !complete {
			info.Status = "in-progress"
		}
	}

	// Use creation timestamp as fallback time.
	if info.Time == "" {
		info.Time = item.GetCreationTimestamp().Time.Format(time.RFC3339)
	}

	// Default type if missing.
	if info.Type == "" {
		info.Type = "full"
	}

	return info
}

// listVtctlBackups lists backups via vtctlclient ListBackups.
func (h *Handler) listVtctlBackups(ctx context.Context, databaseID string) ([]BackupInfo, error) {
	// In a real implementation, we would resolve the keyspace name from
	// the database ID via K8s secrets. For now, we use the database ID
	// as the keyspace name (it is the validated database name).
	keyspace := databaseID
	if keyspace == "" {
		// If no database_id filter, we can't call ListBackups without a keyspace.
		return nil, nil
	}

	// Call vtctlclient via the vitess Manager.
	// This is done via exec.Command in the vitess package.
	// For the PITR handler, we exec directly since we have the vtctldAddr.
	output, err := h.runVtctlClient(ctx, "ListBackups", keyspace)
	if err != nil {
		return nil, err
	}

	return parseVtctlBackupList(output, keyspace), nil
}

// runVtctlClient executes a vtctlclient command and returns the output.
func (h *Handler) runVtctlClient(ctx context.Context, args ...string) (string, error) {
	// Build: vtctlclient --server <addr> <args...>
	fullArgs := append([]string{"--server", h.vtctldAddr}, args...)
	return runCommand(ctx, "vtctlclient", fullArgs...)
}

// parseVtctlBackupList parses the raw text output of `vtctlclient ListBackups`.
// The output format varies by Vitess version; we attempt a best-effort parse.
func parseVtctlBackupList(output, keyspace string) []BackupInfo {
	backups := make([]BackupInfo, 0)

	// vtctlclient ListBackups output is typically tabular with headers:
	//   name\tkeyspace\tshard\tstart_time\tend_time\tstatus
	// Or JSON-style output. We attempt to parse line-by-line.
	lines := strings.Split(strings.TrimSpace(output), "\n")
	for i, line := range lines {
		if i == 0 && strings.Contains(line, "name") {
			continue // skip header
		}
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		fields := strings.Split(line, "\t")
		bi := BackupInfo{
			Keyspace: keyspace,
			Type:     "full",
			Status:   "completed",
		}

		if len(fields) >= 1 {
			bi.ID = strings.TrimSpace(fields[0])
		}
		if len(fields) >= 2 {
			bi.Keyspace = strings.TrimSpace(fields[1])
		}
		if len(fields) >= 4 {
			bi.Time = strings.TrimSpace(fields[3])
		}
		if len(fields) >= 5 {
			// end_time
			if bi.Time == "" {
				bi.Time = strings.TrimSpace(fields[4])
			}
		}
		if len(fields) >= 6 {
			bi.Status = strings.TrimSpace(fields[5])
		}

		// Generate a synthetic ID from the name field if not set.
		if bi.ID == "" {
			bi.ID = fmt.Sprintf("backup-%d", i)
		}

		backups = append(backups, bi)
	}

	return backups
}

// createRestoreJob creates a K8s Job that runs vtctlclient RestoreFromBackup.
func (h *Handler) createRestoreJob(ctx context.Context, jobName string, req RestoreRequest) error {
	// Build the shard reference: keyspace/shard (e.g. "main/-").
	shardRef := req.Keyspace + "/" + req.Shard

	backoffLimit := int32(0)
	ttlSeconds := int32(3600) // clean up after 1 hour

	// Build the vtctlclient command.
	command := []string{
		"vtctlclient",
		"--server", h.vtctldAddr,
		"RestoreFromBackup",
	}
	// Add PITR timestamp if specified.
	if req.RestoreType == "pitr" && req.RestoreTimestamp != "" {
		command = append(command, "--restore_to_timestamp", req.RestoreTimestamp)
	}
	command = append(command, shardRef)

	job := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:      jobName,
			Namespace: h.namespace,
			Labels: map[string]string{
				"app":              "euroscale-pitr",
				"euroscale.app/restore-id": req.DatabaseID,
			},
		},
		Spec: batchv1.JobSpec{
			BackoffLimit:            &backoffLimit,
			TTLSecondsAfterFinished: &ttlSeconds,
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{
						"app": jobName,
					},
				},
				Spec: corev1.PodSpec{
					RestartPolicy: corev1.RestartPolicyNever,
					Containers: []corev1.Container{
						{
							Name:  "restore",
							Image: "vitess/vtctld:latest",
							Command: command,
							Env: []corev1.EnvVar{
								{Name: "VTCTLD_ADDR", Value: h.vtctldAddr},
							},
						},
					},
				},
			},
		},
	}

	_, err := h.clientset.BatchV1().Jobs(h.namespace).Create(ctx, job, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("failed to create restore job: %w", err)
	}

	log.Printf("INFO: created restore job %s for database %s", jobName, req.DatabaseID)
	return nil
}

// syncJobStatus checks the K8s Job status and updates the in-memory RestoreInfo.
func (h *Handler) syncJobStatus(info *RestoreInfo) {
	if info.JobName == "" {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	job, err := h.clientset.BatchV1().Jobs(h.namespace).Get(ctx, info.JobName, metav1.GetOptions{})
	if err != nil {
		log.Printf("WARNING: failed to get restore job %s: %v", info.JobName, err)
		return
	}

	if job.Status.Succeeded > 0 {
		info.Status = "completed"
		now := time.Now().UTC()
		info.CompletedAt = &now
	} else if job.Status.Failed > 0 {
		info.Status = "failed"
		info.ErrorMessage = "restore job failed — check job logs for details"
		now := time.Now().UTC()
		info.CompletedAt = &now
	}
	// Otherwise still "in-progress"
}

// ── JSON helpers ──────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// runCommand executes a command and returns combined stdout/stderr.
func runCommand(ctx context.Context, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("command %s failed: %w", name, err)
	}
	return string(output), nil
}
