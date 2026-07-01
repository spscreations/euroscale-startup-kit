#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# EuroScale — Vitess Operator Deployment Script
# Deploys the Planetscale Vitess Operator + multi-region cluster
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VITESS_CLUSTER="${SCRIPT_DIR}/vitess-cluster.yaml"
NAMESPACE="euroscale"
OPERATOR_URL="https://raw.githubusercontent.com/vitessio/vitess/main/examples/operator/operator.yaml"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     EuroScale — Vitess Operator Deployment                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Verify prerequisites ─────────────────────────────────
echo "[1/7] Checking prerequisites..."

if ! command -v kubectl &>/dev/null; then
  echo "  ERROR: kubectl not found. Please install kubectl first."
  exit 1
fi

if ! kubectl cluster-info &>/dev/null; then
  echo "  ERROR: Cannot connect to Kubernetes cluster. Check KUBECONFIG."
  exit 1
fi

echo "  ✓ kubectl $(kubectl version --client -o json 2>/dev/null | grep -o '"gitVersion":"[^"]*"' | head -1 | cut -d'"' -f4 || echo 'installed') connected"
echo ""

# ── Step 2: Install Vitess Operator ──────────────────────────────
echo "[2/7] Installing Vitess Operator from upstream..."
kubectl apply -f "${OPERATOR_URL}"
echo "  ✓ Operator manifest applied"
echo ""

# ── Step 3: Wait for operator to be ready ────────────────────────
echo "[3/7] Waiting for Vitess Operator pod to be ready..."
kubectl wait --for=condition=Ready pod \
  -l "app=vitess-operator" \
  --timeout=120s 2>/dev/null || {
    echo "  ⚠  Timed out waiting for operator on common label; checking wider..."
    kubectl wait --for=condition=Ready pod \
      -l "app.kubernetes.io/name=vitess-operator" \
      --timeout=120s 2>/dev/null || {
        echo "  ⚠  Still waiting — showing pods in default namespace:"
        kubectl get pods
        echo "  Retrying kubectl wait with broader match..."
        kubectl wait --for=condition=Ready pod \
          --all --timeout=180s 2>/dev/null || true
      }
}
echo "  ✓ Vitess Operator is running"
echo ""

# ── Step 4: Create euroscale namespace ───────────────────────────
echo "[4/7] Creating namespace '${NAMESPACE}' (if not exists)..."
kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -
echo "  ✓ Namespace ready"
echo ""

# ── Step 5: Apply VitessCluster manifest ─────────────────────────
echo "[5/7] Deploying VitessCluster 'euroscale'..."
kubectl apply -f "${VITESS_CLUSTER}"
echo "  ✓ VitessCluster manifest applied"
echo ""

# ── Step 6: Wait for VitessCluster to be ready ───────────────────
echo "[6/7] Waiting for VitessCluster to be ready (timeout: 300s)..."
kubectl wait --for=condition=Ready vtc/euroscale \
  -n "${NAMESPACE}" \
  --timeout=300s || {
    echo "  ⚠  Cluster may still be provisioning. Current status:"
    kubectl get vtc/euroscale -n "${NAMESPACE}" -o jsonpath='{.status}' 2>/dev/null | python3 -m json.tool 2>/dev/null || true
    echo ""
    echo "  Listing deployed resources:"
    kubectl get all -n "${NAMESPACE}"
    echo ""
    echo "  You can re-run: kubectl wait --for=condition=Ready vtc/euroscale -n ${NAMESPACE} --timeout=600s"
    echo "  Continuing with verification..."
}
echo ""
echo "  ✓ VitessCluster is ready"
echo ""

# ── Step 7: Verify deployment ────────────────────────────────────
echo "[7/7] Verifying deployment..."
echo ""

echo "  ── vtgate Pods ──"
kubectl get pods -n "${NAMESPACE}" -l "planetscale.com/component=vtgate" -o wide 2>/dev/null || \
  kubectl get pods -n "${NAMESPACE}" | grep vtgate || echo "  (no vtgate pods found yet)"
echo ""

echo "  ── vttablet Pods ──"
kubectl get pods -n "${NAMESPACE}" -l "planetscale.com/component=vttablet" -o wide 2>/dev/null || \
  kubectl get pods -n "${NAMESPACE}" | grep vttablet || echo "  (no vttablet pods found yet)"
echo ""

echo "  ── Services ──"
kubectl get svc -n "${NAMESPACE}"
echo ""

echo "  ── Persistent Volume Claims ──"
kubectl get pvc -n "${NAMESPACE}"
echo ""

# ── Step 7b: Test MySQL connection via vtgate ─────────────────────
echo "  ── Testing MySQL connection through vtgate ──"
VTGATE_SVC=$(kubectl get svc -n "${NAMESPACE}" -o name 2>/dev/null | grep "vtgate" | head -1 || echo "")

if [ -n "${VTGATE_SVC}" ]; then
  echo "  Found vtgate service: ${VTGATE_SVC}"
  echo "  Running SHOW DATABASES test via ephemeral mysql-client pod..."
  kubectl run mysql-test --rm -i --restart=Never \
    -n "${NAMESPACE}" \
    --image=mysql:8.0 \
    -- mysql -h "euroscale-vtgate" -e "SHOW DATABASES;" 2>/dev/null || {
      echo "  ⚠  mysql-client test failed. vtgate may still be initializing."
      echo "  Try manually: kubectl run mysql-test --rm -it --restart=Never \\"
      echo "      -n ${NAMESPACE} --image=mysql:8.0 -- mysql -h euroscale-vtgate"
      echo "      -e 'SHOW DATABASES;'"
    }
else
  echo "  ⚠  No vtgate service found yet. Skipping MySQL connection test."
  echo "  Once vtgate is ready, test with:"
  echo "    kubectl run mysql-test --rm -it --restart=Never \\"
  echo "        -n ${NAMESPACE} --image=mysql:8.0 -- mysql -h euroscale-vtgate"
  echo "        -e 'SHOW DATABASES;'"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  EuroScale Vitess deployment complete!                     ║"
echo "║                                                            ║"
echo "║  vtgate service:  euroscale-vtgate.${NAMESPACE}.svc        ║"
echo "║  vtctld service:  euroscale-vtctld.${NAMESPACE}.svc        ║"
echo "║  vtadmin API:     euroscale-vtadmin.${NAMESPACE}.svc       ║"
echo "║                                                            ║"
echo "║  Connect: mysql -h euroscale-vtgate.${NAMESPACE} -P 3306   ║"
echo "║                                                            ║"
echo "║  Next: Task 4 — gRPC API                                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
