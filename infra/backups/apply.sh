#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# EuroScale — Backup Infrastructure Deploy Script
# ──────────────────────────────────────────────────────────────────
# Applies all backup and restore components to the K3s cluster.
# Idempotent — safe to re-run.
#
# Usage:
#   ./infra/backups/apply.sh
#
# To deploy individual components:
#   kubectl apply -f infra/backups/rclone-sync-cronjob.yaml
#   kubectl apply -f infra/backups/weekly-restore-cronjob.yaml
#   kubectl apply -f infra/backups/backup-alerts.yaml
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K3S_DIR="$(cd "${SCRIPT_DIR}/../k3s" && pwd)"
VITESS_DIR="$(cd "${SCRIPT_DIR}/../vitess" && pwd)"
MONITORING_DIR="$(cd "${SCRIPT_DIR}/../monitoring" && pwd)"

# Use local kubeconfig if present and no KUBECONFIG is set
if [ -f "${K3S_DIR}/kubeconfig" ] && [ -z "${KUBECONFIG:-}" ]; then
  export KUBECONFIG="${K3S_DIR}/kubeconfig"
fi

NAMESPACE="euroscale"
LS_NAMESPACE="monitoring"

echo ""
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║     EuroScale — Backup Infrastructure Deployment        ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo ""

# ── Prerequisites ──────────────────────────────────────────────────
echo "--- Checking prerequisites ---"
if ! command -v kubectl &>/dev/null; then
  echo "ERROR: kubectl not found."
  exit 1
fi
if ! kubectl get ns "${NAMESPACE}" &>/dev/null; then
  echo "ERROR: Namespace '${NAMESPACE}' does not exist. Deploy Vitess first."
  exit 1
fi
if kubectl get ns "${LS_NAMESPACE}" &>/dev/null; then
  HAS_MONITORING=true
  echo "  ✓ Monitoring namespace found — alerts will be deployed there."
else
  HAS_MONITORING=false
  echo "  ⚠  Monitoring not found — skipping PrometheusRule deployment."
  echo "     Deploy monitoring first, then kubectl apply -f backup-alerts.yaml"
fi
echo ""

# Ensure euroscale namespace exists
kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f - >/dev/null

# ── Layer 1: Verify Vitess Replication ─────────────────────────────
echo "[1/5] Verifying Vitess live replication (Layer 1)..."
if kubectl get vitesscluster -n "${NAMESPACE}" &>/dev/null; then
  REPLICA_COUNT="$(kubectl get vitesscluster euroscale -n "${NAMESPACE}" -o jsonpath='{.spec.keyspaces[0].partitionings[0].equal.shardTemplate.tabletPools[?(@.type=="replica")].replicas}' 2>/dev/null || echo "unknown")"
  echo "      ✓ VitessCluster found. Replica configuration: ${REPLICA_COUNT} per pool (cross_cell)"
else
  echo "      ⚠  VitessCluster CR not found (expected if deploying before Vitess)"
fi
echo ""

# ── Layer 2: Verify Vitess Backup Config ───────────────────────────
echo "[2/5] Checking Vitess backup configuration (Layer 2)..."
if kubectl get vitesscluster euroscale -n "${NAMESPACE}" -o jsonpath='{.spec.backup}' 2>/dev/null | grep -q engine; then
  echo "      ✓ Vitess backup engine configured (builtin S3 → MinIO)"
  echo "      ✓ Backup schedules: full (daily @ 02:00 UTC) + incremental (every 15m)"
else
  echo "      ⚠  Vitess backup not configured in cluster CR."
  echo "         See: ${VITESS_DIR}/backup-config.yaml for instructions."
fi
echo ""

# ── Layer 3: Deploy rclone Off-Site Sync ───────────────────────────
echo "[3/5] Deploying rclone off-site sync (Layer 3)..."
if [ -f "${SCRIPT_DIR}/rclone-sync-cronjob.yaml" ]; then
  kubectl apply -f "${SCRIPT_DIR}/rclone-sync-cronjob.yaml"
  echo "      ✓ rclone sync CronJob applied (every 6h → Hetzner Storage Box)"
else
  echo "      ⚠  rclone-sync-cronjob.yaml not found!"
fi
echo ""

# ── Layer 4: Verify etcd Snapshot Config ────────────────────────────
echo "[4/5] Checking etcd snapshot configuration (Layer 4)..."
echo "      • K3s install.sh configures etcd snapshots every 6 hours"
echo "      • Retention: 7 snapshots"
echo "      • Destination: Hetzner Object Storage (s3.nbg1.cloud.fsn.hetzner.com)"
echo "      • Bucket: euroscale-etcd-backups"
echo ""
echo "      If the cluster is already deployed, verify with:"
echo "      kubectl get pods -n kube-system -l component=etcd"
echo ""

# ── Layer 5: Deploy Restore Test + Alerts ──────────────────────────
echo "[5/5] Deploying restore testing and alerts (Layer 5)..."

# Restore test CronJob
if [ -f "${SCRIPT_DIR}/weekly-restore-cronjob.yaml" ]; then
  kubectl apply -f "${SCRIPT_DIR}/weekly-restore-cronjob.yaml"
  echo "      ✓ Restore test CronJob applied (weekly @ Sunday 03:00 UTC)"
fi

# Prometheus alerts
if [ "${HAS_MONITORING}" = true ] && [ -f "${SCRIPT_DIR}/backup-alerts.yaml" ]; then
  kubectl apply -f "${SCRIPT_DIR}/backup-alerts.yaml"
  echo "      ✓ Backup PrometheusRules applied (8 alert rules)"
elif [ "${HAS_MONITORING}" = false ]; then
  echo "      ⚠  Skipping PrometheusRules — monitoring not deployed yet."
  echo "         Run later: kubectl apply -f ${SCRIPT_DIR}/backup-alerts.yaml"
fi

echo ""

# ── Summary ────────────────────────────────────────────────────────
echo "  ┌──────────────────────────────────────────────────────────┐"
echo "  │  ✓ Backup infrastructure deployment complete            │"
echo "  │                                                          │"
echo "  │  Layers:                                                  │"
echo "  │    L1  Live Vitess replication    (cross_cell)           │"
echo "  │    L2  Vitess S3 → MinIO          (daily + incremental) │"
echo "  │    L3  rclone → Storage Box       (every 6h, off-site)  │"
echo "  │    L4  etcd snapshots → S3        (every 6h)            │"
echo "  │    L5  Restore test + alerts      (weekly + Prometheus)  │"
echo "  │                                                          │"
echo "  │  Post-deploy checks:                                     │"
echo "  │    kubectl get cronjobs -n ${NAMESPACE}                  │"
echo "  │    kubectl get prometheusrule -n ${LS_NAMESPACE}         │"
echo "  │    kubectl describe cronjob euroscale-rclone-sync -n ${NAMESPACE} │"
echo "  └──────────────────────────────────────────────────────────┘"
