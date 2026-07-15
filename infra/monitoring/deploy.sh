#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# EuroScale Monitoring Stack Deploy Script
# Deploys Prometheus + Grafana (kube-prometheus-stack) with Vitess dashboards
# =============================================================================

MONITORING_NAMESPACE="monitoring"
GRAFANA_ADMIN_USER="admin"
GRAFANA_ADMIN_PASS=$(openssl rand -base64 16)
GRAFANA_HELM_RELEASE="kube-prometheus-stack"
HELM_REPO="prometheus-community"
HELM_REPO_URL="https://prometheus-community.github.io/helm-charts"
VITESS_METRICS_URL="https://raw.githubusercontent.com/vitessio/vitess/main/examples/operator/metrics.yaml"

echo ""
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║       EuroScale Monitoring Stack Deployment              ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo ""

# -----------------------------------------------------------------------------
# 1. Create namespace
# -----------------------------------------------------------------------------
echo "[1/6] Creating monitoring namespace..."
kubectl create namespace "${MONITORING_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -
echo "      ✓ Namespace '${MONITORING_NAMESPACE}' ready"

# -----------------------------------------------------------------------------
# 2. Add Helm repo
# -----------------------------------------------------------------------------
echo "[2/6] Adding Helm repo '${HELM_REPO}'..."
helm repo add "${HELM_REPO}" "${HELM_REPO_URL}" 2>/dev/null || true
helm repo update
echo "      ✓ Helm repo ready"

# -----------------------------------------------------------------------------
# 3. Install kube-prometheus-stack
# -----------------------------------------------------------------------------
echo "[3/6] Installing kube-prometheus-stack..."
helm upgrade --install "${GRAFANA_HELM_RELEASE}" "${HELM_REPO}/kube-prometheus-stack" \
  --namespace "${MONITORING_NAMESPACE}" \
  --set grafana.adminPassword="${GRAFANA_ADMIN_PASS}" \
  --set grafana.persistence.enabled=true \
  --set grafana.persistence.size=10Gi \
  --set alertmanager.persistentVolume.enabled=true \
  --set alertmanager.alertmanagerSpec.storage.volumeClaimTemplate.spec.resources.requests.storage=5Gi \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=20Gi \
  --set prometheus.prometheusSpec.retention=15d \
  --wait \
  --timeout 10m

echo "      ✓ kube-prometheus-stack installed"

# -----------------------------------------------------------------------------
# 4. Expose Grafana via LoadBalancer
# -----------------------------------------------------------------------------
echo "[4/6] Patching Grafana service to LoadBalancer type..."
kubectl patch svc "${GRAFANA_HELM_RELEASE}"-grafana \
  -n "${MONITORING_NAMESPACE}" \
  -p '{"spec":{"type":"LoadBalancer"}}' || true

echo "      ✓ Grafana service patched"
echo ""
echo "      ⏳ Waiting for LoadBalancer IP (max 120s)..."
for i in $(seq 1 24); do
  GRAFANA_IP=$(kubectl get svc "${GRAFANA_HELM_RELEASE}"-grafana \
    -n "${MONITORING_NAMESPACE}" \
    -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
  if [ -n "${GRAFANA_IP}" ]; then
    break
  fi
  sleep 5
done

if [ -z "${GRAFANA_IP}" ]; then
  GRAFANA_IP="<pending — check 'kubectl get svc -n monitoring'>"
fi
echo "      ✓ Grafana LoadBalancer IP: ${GRAFANA_IP}"

# -----------------------------------------------------------------------------
# 5. Apply Vitess metrics config (ServiceMonitors)
# -----------------------------------------------------------------------------
echo "[5/6] Applying Vitess metrics ServiceMonitors..."
kubectl apply -f "${VITESS_METRICS_URL}"
echo "      ✓ Vitess metrics config applied"

# -----------------------------------------------------------------------------
# 6. Print summary
# -----------------------------------------------------------------------------
echo "[6/6] Done!"
echo ""
echo "  ┌──────────────────────────────────────────────────────────┐"
echo "  │  Grafana URL:      http://${GRAFANA_IP}                    "
echo "  │  Admin User:       ${GRAFANA_ADMIN_USER}                  "
echo "  │  Admin Password:   (not printed — retrieve from Secret)   "
echo "  │  Namespace:        ${MONITORING_NAMESPACE}               "
echo "  └──────────────────────────────────────────────────────────┘"
echo ""
# SECURITY: never echo GRAFANA_ADMIN_PASS to stdout/logs/CI history.
echo "  ▸ Retrieve Grafana admin password (do not paste into tickets/CI logs):"
echo "    kubectl get secret -n ${MONITORING_NAMESPACE} ${GRAFANA_HELM_RELEASE}-grafana \\"
echo "      -o jsonpath='{.data.admin-password}' | base64 -d && echo"
echo ""
echo "  ▸ Port-forward (if LoadBalancer isn't available):"
echo "    kubectl port-forward -n ${MONITORING_NAMESPACE} svc/${GRAFANA_HELM_RELEASE}-grafana 3000:80"
echo ""
echo "  ▸ Check Prometheus targets:"
echo "    kubectl port-forward -n ${MONITORING_NAMESPACE} svc/${GRAFANA_HELM_RELEASE}-prometheus 9090:9090"
echo "    # Then open http://localhost:9090/targets"
echo ""
echo "  ▸ Import Vitess dashboard:"
echo "    Grafana → Dashboards → Import → ID 11111"
echo "    See vitess-dashboard.json for details."
echo ""
