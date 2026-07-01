#!/usr/bin/env bash
# EuroScale — Deploy Addons (cert-manager + MinIO) onto an existing K3s cluster.
#
# Prerequisites:
#   - K3s cluster is up and kubectl points to it (via KUBECONFIG or default)
#
# Optional environment variables:
#   MINIO_ROOT_PASSWORD — MinIO root password (auto-generated if not set)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KUBECONFIG_FILE="${SCRIPT_DIR}/kubeconfig"

# Use local kubeconfig if present and no KUBECONFIG is set
if [ -f "${KUBECONFIG_FILE}" ] && [ -z "${KUBECONFIG:-}" ]; then
  export KUBECONFIG="${KUBECONFIG_FILE}"
fi

echo "=== EuroScale Addon Deployment ==="
echo "Kubeconfig: ${KUBECONFIG:-default}"
echo ""

# ── Prerequisite Checks ──────────────────────────────────────────────────────
echo "--- Checking prerequisites ---"

if ! command -v kubectl &>/dev/null; then
  echo "ERROR: kubectl not found. Please install kubectl and point KUBECONFIG to the K3s cluster."
  exit 1
fi

if ! command -v helm &>/dev/null; then
  echo "ERROR: helm not found. Please install Helm 3."
  exit 1
fi

if ! kubectl get nodes &>/dev/null; then
  echo "ERROR: Cannot reach Kubernetes cluster. Check your KUBECONFIG."
  exit 1
fi

echo "Cluster is reachable. Nodes:"
kubectl get nodes --no-headers 2>/dev/null || true
echo ""

# ── cert-manager ─────────────────────────────────────────────────────────────
echo "=== Step 1: Deploying cert-manager ==="

helm repo add jetstack https://charts.jetstack.io --force-update 2>/dev/null || true
helm repo update jetstack

helm upgrade --install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --set installCRDs=true \
  --set startupapicheck.timeout=5m \
  --wait \
  --timeout 10m

echo "cert-manager deployed."
echo ""

# ── MinIO ────────────────────────────────────────────────────────────────────
echo "=== Step 2: Deploying MinIO ==="

# Generate random root password if not provided
if [ -z "${MINIO_ROOT_PASSWORD:-}" ]; then
  MINIO_ROOT_PASSWORD="$(openssl rand -base64 32)"
  echo "Generated MinIO root password: ${MINIO_ROOT_PASSWORD:0:8}… (full password saved to Secret)"
fi

helm repo add minio https://charts.min.io/ --force-update 2>/dev/null || true
helm repo update minio

helm upgrade --install minio minio/minio \
  --namespace minio \
  --create-namespace \
  --set rootUser=euroscale \
  --set rootPassword="${MINIO_ROOT_PASSWORD}" \
  --set persistence.size=100Gi \
  --set persistence.storageClass=local-path \
  --set buckets[0].name=euroscale-backups \
  --set buckets[0].policy=none \
  --set resources.requests.memory=512Mi \
  --set resources.requests.cpu=250m \
  --set resources.limits.memory=1Gi \
  --set resources.limits.cpu=500m \
  --wait \
  --timeout 10m

echo "MinIO deployed."
echo ""

# ── Vitess Backup Credentials Secret ─────────────────────────────────────────
echo "=== Step 3: Creating euroscale namespace and backup credentials Secret ==="

kubectl create namespace euroscale --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic vitess-backup-creds \
  --namespace euroscale \
  --from-literal=aws-access-key-id=euroscale \
  --from-literal=aws-secret-access-key="${MINIO_ROOT_PASSWORD}" \
  --from-literal=aws-endpoint="http://minio.minio.svc.cluster.local:9000" \
  --from-literal=aws-region=us-east-1 \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Backup credentials Secret 'vitess-backup-creds' created in namespace 'euroscale'."
echo ""

# ── Verify Pods ──────────────────────────────────────────────────────────────
echo "=== Step 4: Verifying addon pods ==="

echo "Waiting for all addon pods to be ready…"
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=cert-manager -n cert-manager --timeout=300s 2>/dev/null || true
kubectl wait --for=condition=ready pod -l app=minio -n minio --timeout=300s 2>/dev/null || true

echo ""
echo "--- Namespace: cert-manager ---"
kubectl get pods -n cert-manager

echo ""
echo "--- Namespace: minio ---"
kubectl get pods -n minio

echo ""
echo "--- Namespace: euroscale ---"
kubectl get secrets -n euroscale

echo ""
echo "=== Addon deployment complete! ==="
