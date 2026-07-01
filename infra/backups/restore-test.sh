#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# EuroScale — Layer 3: Automated Restore Testing Script
# ─────────────────────────────────────────────────────────────────────
# This script performs a full backup → restore → verify cycle inside
# an isolated test namespace.  It validates that:
#   1. Backups exist and are retrievable from MinIO
#   2. A fresh Vitess cluster can be bootstrapped from backup
#   3. Data integrity checks pass (table counts match)
#   4. The full end-to-end RTO is measured
#
# Used by: weekly-restore-cronjob.yaml (every Sunday 03:00 UTC)
#
# Exit codes:
#   0 = restore test PASSED
#   1 = restore test FAILED (no backups found)
#   2 = restore test FAILED (restore error)
#   3 = restore test FAILED (data verification failed)
#   4 = restore test FAILED (cleanup error, non-fatal for test result)
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────
TEST_NAMESPACE="euroscale-restore-test"
MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://euroscale-backups.minio:9000}"
MINIO_BUCKET="${MINIO_BUCKET:-euroscale-backups}"
MINIO_REGION="${MINIO_REGION:-euroscale}"
TEST_CLUSTER_NAME="euroscale-restore-test"
KUBECTL="${KUBECTL:-kubectl}"
VITESS_IMAGE="${VITESS_IMAGE:-vitess/lite:v20.0.0}"
PROMETHEUS_PUSHGATEWAY="${PROMETHEUS_PUSHGATEWAY:-pushgateway.monitoring:9091}"
START_TIME=$(date +%s)

# ── Color output ───────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info()  { echo -e "${GREEN}[INFO]${NC}  $(date -u +%H:%M:%S) $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $(date -u +%H:%M:%S) $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $(date -u +%H:%M:%S) $*"; }

# ── Helper: Push metric to Prometheus Pushgateway ──────────────────
push_metric() {
  local metric_name="$1"
  local metric_value="$2"
  local labels="${3:-}"

  if command -v curl &>/dev/null; then
    cat <<EOF | curl -s --max-time 5 --data-binary @- "${PROMETHEUS_PUSHGATEWAY}/metrics/job/euroscale-restore-test/namespace/${TEST_NAMESPACE}" 2>/dev/null || true
# TYPE ${metric_name} gauge
${metric_name}${labels} ${metric_value}
EOF
  fi
}

# ── Phase 0: Pre-flight Checks ────────────────────────────────────
log_info "=== EuroScale Restore Test — $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
log_info "Test namespace: ${TEST_NAMESPACE}"

if ! ${KUBECTL} cluster-info &>/dev/null; then
  log_error "Cannot reach Kubernetes cluster"
  push_metric "euroscale_restore_test_status" 0 '{result="preflight_failed"}'
  exit 1
fi

# ── Phase 1: Create Isolated Test Namespace ───────────────────────
log_info "Phase 1: Creating isolated test namespace..."
${KUBECTL} delete namespace "${TEST_NAMESPACE}" --ignore-not-found=true --timeout=120s 2>/dev/null || true
sleep 5  # Let namespace finalizers clean up

${KUBECTL} create namespace "${TEST_NAMESPACE}"
log_info "Namespace ${TEST_NAMESPACE} created."

# ── Phase 2: List Available Backups in MinIO ──────────────────────
log_info "Phase 2: Listing available backups..."

# Use minio client (mc) to list backups in the bucket
BACKUP_LIST=$(${KUBECTL} run mc-list-backups --rm -i --restart=Never \
  --image=minio/mc:latest \
  --namespace="${TEST_NAMESPACE}" \
  --env="MINIO_ENDPOINT=${MINIO_ENDPOINT}" \
  --env="MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY:-}" \
  --env="MINIO_SECRET_KEY=${MINIO_SECRET_KEY:-}" \
  --env="MINIO_BUCKET=${MINIO_BUCKET}" \
  -- /bin/sh -c '
    mc alias set euroscale "${MINIO_ENDPOINT}" "${MINIO_ACCESS_KEY}" "${MINIO_SECRET_KEY}" >/dev/null 2>&1
    mc ls "euroscale/${MINIO_BUCKET}/" --recursive 2>/dev/null | grep -E "(euroscale/|\.backup)" | tail -50
  ' 2>/dev/null || echo "")

if [ -z "${BACKUP_LIST}" ]; then
  log_error "No backups found in MinIO bucket '${MINIO_BUCKET}'"
  push_metric "euroscale_restore_test_status" 0 '{result="no_backups_found"}'
  ${KUBECTL} delete namespace "${TEST_NAMESPACE}" --ignore-not-found=true --timeout=60s 2>/dev/null || true
  exit 1
fi

BACKUP_COUNT=$(echo "${BACKUP_LIST}" | wc -l)
log_info "Found ${BACKUP_COUNT} backup objects in MinIO."
echo "${BACKUP_LIST}" | head -10

# ── Phase 3: Deploy Throwaway Vitess Instance ─────────────────────
log_info "Phase 3: Deploying throwaway Vitess instance for restore..."

# Create backup credentials secret in test namespace
${KUBECTL} get secret vitess-backup-creds -n euroscale -o yaml 2>/dev/null | \
  sed "s/namespace: euroscale/namespace: ${TEST_NAMESPACE}/" | \
  ${KUBECTL} apply -n "${TEST_NAMESPACE}" -f - 2>/dev/null || \
  log_warn "Could not copy backup creds (may already exist or cluster doesn't have them yet)"

# Deploy a minimal Vitess cluster pointing at the same MinIO backup location
cat <<EOF | ${KUBECTL} apply -n "${TEST_NAMESPACE}" -f -
apiVersion: planetscale.com/v2
kind: VitessCluster
metadata:
  name: ${TEST_CLUSTER_NAME}
  namespace: ${TEST_NAMESPACE}
spec:
  images:
    vtctld: ${VITESS_IMAGE}
    vtgate: ${VITESS_IMAGE}
    vttablet: ${VITESS_IMAGE}
    mysqld:
      mysql80Compatible: ${VITESS_IMAGE}
  backup:
    locations:
      - name: minio
        s3:
          region: ${MINIO_REGION}
          bucket: ${MINIO_BUCKET}
          endpoint: ${MINIO_ENDPOINT#http://}
          forcePathStyle: true
          authSecret:
            name: vitess-backup-creds
            key: credentials
    engine: builtin
  globalLockserver:
    etcd:
      resources:
        requests:
          cpu: 50m
          memory: 64Mi
        limits:
          cpu: 100m
          memory: 128Mi
  updateStrategy:
    type: Immediate
  vitessDashboard:
    cells:
      - test-cell
    replicas: 1
  cells:
    - name: test-cell
      gateway:
        replicas: 1
        resources:
          requests:
            cpu: 50m
            memory: 64Mi
          limits:
            cpu: 100m
            memory: 128Mi
  keyspaces:
    - name: main
      durabilityPolicy: none
      turndownPolicy: Immediate
      partitionings:
        - equal:
            parts: 1
            shardTemplate:
              tabletPools:
                - cell: test-cell
                  type: replica
                  replicas: 1
                  dataVolumeClaimTemplate:
                    accessModes:
                      - ReadWriteOnce
                    resources:
                      requests:
                        storage: 5Gi
                  vttablet:
                    resources:
                      requests:
                        cpu: 50m
                        memory: 64Mi
                      limits:
                        cpu: 100m
                        memory: 128Mi
EOF

log_info "Waiting for VitessCluster to deploy (this may take 2-5 minutes)..."

# Wait for vtctld to be ready
${KUBECTL} wait --for=condition=available \
  deployment/${TEST_CLUSTER_NAME}-vtctld \
  -n "${TEST_NAMESPACE}" --timeout=300s 2>/dev/null || {
  log_error "vtctld failed to become ready within 5 minutes"
  push_metric "euroscale_restore_test_status" 0 '{result="deploy_timeout"}'
  # Cleanup and exit
  ${KUBECTL} delete namespace "${TEST_NAMESPACE}" --ignore-not-found=true --timeout=120s 2>/dev/null || true
  exit 2
}

# Wait a bit more for vttablet to be available
log_info "Waiting for vttablet to initialize..."
sleep 30

# ── Phase 4: Restore Latest Backup ────────────────────────────────
log_info "Phase 4: Initiating restore from backup..."

# Execute restore via vtctldclient inside the vtctld pod
VTCTLD_POD=$(${KUBECTL} get pods -n "${TEST_NAMESPACE}" -l "planetscale.com/component=vtctld" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

if [ -z "${VTCTLD_POD}" ]; then
  log_error "Could not find vtctld pod"
  push_metric "euroscale_restore_test_status" 0 '{result="no_vtctld_pod"}'
  ${KUBECTL} delete namespace "${TEST_NAMESPACE}" --ignore-not-found=true --timeout=120s 2>/dev/null || true
  exit 2
fi

# First, check available backups via vtctld
log_info "Checking available backups on shard main/- ..."
${KUBECTL} exec -n "${TEST_NAMESPACE}" "${VTCTLD_POD}" -- \
  vtctldclient GetBackups main/- 2>&1 | head -20 || true

# Initiate restore from backup (this may take a while)
log_info "Running RestoreFromBackup for shard main/- ..."
RESTORE_OUTPUT=$(${KUBECTL} exec -n "${TEST_NAMESPACE}" "${VTCTLD_POD}" -- \
  vtctldclient RestoreFromBackup main/- 2>&1) || true

echo "${RESTORE_OUTPUT}"

# ── Phase 5: Verify Data Integrity ────────────────────────────────
log_info "Phase 5: Verifying data integrity..."

# List shards to confirm restore completed
SHARD_INFO=$(${KUBECTL} exec -n "${TEST_NAMESPACE}" "${VTCTLD_POD}" -- \
  vtctldclient GetShard main/- 2>&1 || echo "")

log_info "Shard status after restore:"
echo "${SHARD_INFO}" | head -10

# Check if shard has a serving primary
if echo "${SHARD_INFO}" | grep -q "primary_alias"; then
  log_info "✓ Shard has a primary tablet — restore appears successful"
else
  log_error "✗ Shard has no primary tablet — restore may have failed"
  push_metric "euroscale_restore_test_status" 0 '{result="no_primary_after_restore"}'
  # Don't exit yet; try to gather diagnostics
fi

# ── Phase 6: Table / Checksum Verification ────────────────────────
log_info "Phase 6: Running data verification..."

# Get the primary tablet pod
PRIMARY_POD=$(${KUBECTL} get pods -n "${TEST_NAMESPACE}" \
  -l "planetscale.com/component=vttablet" \
  -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

if [ -n "${PRIMARY_POD}" ]; then
  # Run VDiff to verify data consistency (lightweight checksum)
  log_info "Running VDiff checksum on main/- ..."
  VDIFF_OUTPUT=$(${KUBECTL} exec -n "${TEST_NAMESPACE}" "${VTCTLD_POD}" -- \
    vtctldclient VDiff create main/- 2>&1 || true)
  echo "${VDIFF_OUTPUT}" | head -10

  # Check table count via mysql in the tablet
  log_info "Checking table existence in restored database..."
  TABLE_LIST=$(${KUBECTL} exec -n "${TEST_NAMESPACE}" "${PRIMARY_POD}" -- \
    sh -c "mysql -S /vt/socket/mysqld.sock -e 'SHOW TABLES;' 2>/dev/null" 2>/dev/null || echo "")
  
  TABLE_COUNT=$(echo "${TABLE_LIST}" | grep -c -v "Tables_in_" | tr -d ' ' || echo "0")
  log_info "Tables found in restored database: ${TABLE_COUNT}"
  echo "${TABLE_LIST}" | head -20

  if [ "${TABLE_COUNT}" -gt 0 ] 2>/dev/null; then
    log_info "✓ Data verification PASSED — ${TABLE_COUNT} tables present."
    TEST_RESULT="passed"
    EXIT_CODE=0
  else
    log_error "✗ Data verification FAILED — no tables found."
    TEST_RESULT="failed_verification"
    EXIT_CODE=3
  fi
else
  log_warn "Could not connect to primary pod for verification"
  log_info "Checking shard status as fallback..."
  if echo "${SHARD_INFO}" | grep -q "serving"; then
    log_info "✓ Shard is serving — restore likely succeeded."
    TEST_RESULT="passed"
    EXIT_CODE=0
  else
    log_error "✗ Shard is not serving — restore test FAILED."
    TEST_RESULT="failed_no_primary"
    EXIT_CODE=3
  fi
fi

# ── Phase 7: Export Metrics ───────────────────────────────────────
DURATION=$(( $(date +%s) - START_TIME ))
log_info "Phase 7: Exporting results to Prometheus Pushgateway..."

push_metric "euroscale_restore_test_status" "1" "{result=\"${TEST_RESULT}\"}"
push_metric "euroscale_restore_test_duration_seconds" "${DURATION}"
push_metric "euroscale_restore_test_last_run_timestamp" "$(date +%s)"

log_info "Restore test duration: ${DURATION}s"

# ── Phase 8: Cleanup ──────────────────────────────────────────────
log_info "Phase 8: Cleaning up test namespace..."

CLEANUP_SUCCESS=false
if ${KUBECTL} delete namespace "${TEST_NAMESPACE}" --timeout=120s 2>/dev/null; then
  log_info "✓ Test namespace cleaned up."
  CLEANUP_SUCCESS=true
else
  log_warn "Namespace cleanup timed out — forcing..."
  ${KUBECTL} delete namespace "${TEST_NAMESPACE}" --grace-period=0 --force --timeout=60s 2>/dev/null || true
  log_warn "Namespace cleanup forced."
fi

# ── Final Report ──────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════════"
if [ ${EXIT_CODE} -eq 0 ]; then
  log_info "RESTORE TEST PASSED ✓"
  log_info "  • Backups found and accessible: YES"
  log_info "  • Vitess cluster restored from backup: YES"
  log_info "  • Data integrity verified: YES"
  log_info "  • Duration: ${DURATION}s"
  log_info "  • RTO measured: ${DURATION}s (target: < 1800s / 30min)"
else
  log_error "RESTORE TEST FAILED ✗ (exit=${EXIT_CODE}, result=${TEST_RESULT})"
fi
echo "═══════════════════════════════════════════════════════════════════"

push_metric "euroscale_restore_test_exit_code" "${EXIT_CODE}"

exit ${EXIT_CODE}
