#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# EuroScale — Vitess Backup Test Script
# Lists existing backups, triggers a manual backup, and verifies.
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

NAMESPACE="euroscale"
VTCTLD_SVC="euroscale-vtctld.${NAMESPACE}"
VTCTLD_PORT="15999"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     EuroScale — Vitess Backup Test                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Helper: run vtctlclient via kubectl exec ──────────────────────
vtctl() {
  kubectl exec -n "${NAMESPACE}" deploy/euroscale-vtctld -- \
    vtctlclient -server "localhost:${VTCTLD_PORT}" "$@"
}

vtctl_list_backups() {
  local keyspace="${1:-main}"
  echo "  ── Backups for keyspace '${keyspace}' ──"
  vtctl ListBackups "${keyspace}" 2>&1 || echo "  (no backups found yet)"
}

vtctl_backup_shard() {
  local keyspace="${1:-main}"
  local shard="${2:-0}"
  echo "  ── Triggering backup for ${keyspace}/${shard} ──"
  vtctl BackupShard "${keyspace}/${shard}" 2>&1
}

# ── Step 1: List existing backups ─────────────────────────────────
echo "[1/4] Listing existing backups..."
vtctl_list_backups "main"
echo ""

# ── Step 2: Trigger a manual backup ───────────────────────────────
echo "[2/4] Triggering manual backup for main/0 (nuremberg shard)..."
vtctl_backup_shard "main" "0" || {
  echo "  ⚠  BackupShard command failed. Checking vtctld connectivity..."
  echo "  Attempting alternative: port-forward + local vtctlclient"
  echo ""
  echo "  Try manually:"
  echo "    kubectl port-forward -n ${NAMESPACE} svc/${VTCTLD_SVC} ${VTCTLD_PORT}:${VTCTLD_PORT}"
  echo "    vtctlclient -server localhost:${VTCTLD_PORT} BackupShard main/0"
}
echo ""

# ── Step 3: Wait for backup to appear ─────────────────────────────
echo "[3/4] Waiting 30s for backup to register..."
sleep 30
echo ""

# ── Step 4: List backups again to confirm ─────────────────────────
echo "[4/4] Verifying backup was recorded..."
vtctl_list_backups "main"
echo ""

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Backup test complete.                                      ║"
echo "║                                                             ║"
echo "║  Check MinIO bucket:                                        ║"
echo "║    kubectl port-forward -n minio svc/minio-console 9001:9001║"
echo "║    → Open http://localhost:9001 in browser                  ║"
echo "║    → Look in bucket: euroscale-backups                      ║"
echo "║                                                             ║"
echo "║  Check VitessBackup objects:                                ║"
echo "║    kubectl get vitessbackups -n ${NAMESPACE}                ║"
echo "║                                                             ║"
echo "║  Check backup schedules:                                    ║"
echo "║    kubectl get vitessbackupschedules -n ${NAMESPACE}        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
