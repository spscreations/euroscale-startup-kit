#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# EuroScale — DNS & External Access Deployment Script
# Installs Hetzner CCM, provisions LoadBalancer, sets up ExternalDNS
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAMESPACE="euroscale"
LB_SVC="${SCRIPT_DIR}/vtgate-lb.yaml"
EXTERNAL_DNS="${SCRIPT_DIR}/external-dns.yaml"

# ── Colors ────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m' # No Color

banner() {
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║     EuroScale — DNS & External Access Deployment            ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
}

check()   { echo -e "  ${GREEN}✓${NC} ${*}"; }
warn()    { echo -e "  ${YELLOW}⚠${NC} ${*}"; }
error()   { echo -e "  ${RED}✗${NC} ${*}"; }
section() { echo ""; echo -e "${BOLD}── $1 ──${NC}"; echo ""; }

banner

# ──────────────────────────────────────────────────────────────────
# Step 1: Prerequisites
# ──────────────────────────────────────────────────────────────────
section "Step 1/7: Checking prerequisites"

if ! command -v kubectl &>/dev/null; then
  error "kubectl not found. Please install kubectl first."
  exit 1
fi

if ! kubectl cluster-info &>/dev/null; then
  error "Cannot connect to Kubernetes cluster. Check KUBECONFIG."
  exit 1
fi

# Check for required env vars (HCLOUD_TOKEN for CCM, HETZNER_DNS_TOKEN for ExternalDNS)
HCLOUD_TOKEN="${HCLOUD_TOKEN:-}"
HETZNER_DNS_TOKEN="${HETZNER_DNS_TOKEN:-}"

check "kubectl connected to cluster"
check "cluster nodes:"
kubectl get nodes --no-headers 2>/dev/null | head -3 || warn "  (could not list nodes)"

# ──────────────────────────────────────────────────────────────────
# Step 2: Create the euroscale namespace (if not exists)
# ──────────────────────────────────────────────────────────────────
section "Step 2/7: Ensuring namespace '${NAMESPACE}' exists"

kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -
check "Namespace '${NAMESPACE}' ready"

# ──────────────────────────────────────────────────────────────────
# Step 3: Install Hetzner Cloud Controller Manager (CCM)
# ──────────────────────────────────────────────────────────────────
section "Step 3/7: Installing Hetzner Cloud Controller Manager"

CCM_DEPLOYED=false

# Check if CCM is already installed
if kubectl get pods -n kube-system -l app.kubernetes.io/name=hcloud-cloud-controller-manager 2>/dev/null | grep -q Running; then
  check "Hetzner CCM already installed and running"
  CCM_DEPLOYED=true
else
  echo "Hetzner CCM not detected. Installing..."

  # Ensure hcloud secret exists
  if [ -z "${HCLOUD_TOKEN}" ]; then
    warn "HCLOUD_TOKEN environment variable not set."
    echo ""
    echo "  The Hetzner Cloud Controller Manager requires a valid Hetzner Cloud API token."
    echo "  You can provide it now or skip this step and install manually later."
    echo ""
    read -r -p "  Enter Hetzner Cloud API token (or press Enter to skip): " TOKEN_INPUT
    if [ -n "${TOKEN_INPUT}" ]; then
      HCLOUD_TOKEN="${TOKEN_INPUT}"
    fi
  fi

  if [ -n "${HCLOUD_TOKEN}" ]; then
    # Create secret
    kubectl create secret generic hcloud \
      -n kube-system \
      --from-literal="token=${HCLOUD_TOKEN}" \
      --dry-run=client -o yaml | kubectl apply -f -

    # Apply CCM from upstream release
    CCM_URL="https://github.com/hetznercloud/hcloud-cloud-controller-manager/releases/latest/download/ccm-networks.yaml"

    if kubectl apply -f "${CCM_URL}" 2>/dev/null; then
      check "Hetzner CCM manifest applied"
    else
      warn "Failed to apply CCM from upstream URL. Trying Helm-based install..."

      if command -v helm &>/dev/null; then
        helm repo add hcloud https://charts.hetzner.cloud --force-update 2>/dev/null || true
        helm repo update hcloud
        helm upgrade --install hcloud-ccm hcloud/hcloud-cloud-controller-manager \
          --namespace kube-system \
          --set env.HCLOUD_TOKEN.valueFrom.secretKeyRef.name=hcloud \
          --set env.HCLOUD_TOKEN.valueFrom.secretKeyRef.key=token \
          --wait \
          --timeout 5m
        check "Hetzner CCM installed via Helm"
      else
        warn "Helm not available. Skipping CCM install."
        warn "Please install CCM manually before continuing."
      fi
    fi

    # Wait for CCM to be ready
    echo "  Waiting for CCM pods to be ready (timeout: 120s)..."
    kubectl wait --for=condition=Ready pod \
      -l app.kubernetes.io/name=hcloud-cloud-controller-manager \
      -n kube-system \
      --timeout=120s 2>/dev/null && {
        check "Hetzner CCM pods are ready"
        CCM_DEPLOYED=true
      } || {
        warn "CCM pods not yet ready. Current state:"
        kubectl get pods -n kube-system -l app.kubernetes.io/name=hcloud-cloud-controller-manager 2>/dev/null || true
      }
  else
    warn "No Hetzner Cloud token provided. Skipping CCM installation."
    warn "You must install CCM manually before the LoadBalancer will work."
  fi
fi

# ──────────────────────────────────────────────────────────────────
# Step 4: Apply LoadBalancer Service
# ──────────────────────────────────────────────────────────────────
section "Step 4/7: Deploying vtgate LoadBalancer Service"

kubectl apply -f "${LB_SVC}"
check "LoadBalancer Service 'euroscale-vtgate-lb' created/applied"

echo ""
echo "  Waiting for LoadBalancer external IP to be assigned..."
echo "  (This may take 1-3 minutes if CCM is provisioning a new LB)"

LB_IP=""
ATTEMPTS=0
MAX_ATTEMPTS=30

while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
  LB_IP=$(kubectl get svc euroscale-vtgate-lb -n "${NAMESPACE}" \
    -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")

  if [ -n "${LB_IP}" ]; then
    check "LoadBalancer external IP: ${LB_IP}"
    break
  fi

  ATTEMPTS=$((ATTEMPTS + 1))
  sleep 10
  echo -n "."
done

if [ -z "${LB_IP}" ]; then
  warn "LoadBalancer IP not assigned after ${MAX_ATTEMPTS}0 seconds."
  warn "This is expected if CCM is not yet installed or the token is invalid."
  warn ""
  warn "Current service status:"
  kubectl get svc euroscale-vtgate-lb -n "${NAMESPACE}"
  echo ""
  echo "  You can watch progress with:"
  echo "    kubectl get svc euroscale-vtgate-lb -n ${NAMESPACE} --watch"
fi

# ──────────────────────────────────────────────────────────────────
# Step 5: Create Hetzner DNS token secret for ExternalDNS
# ──────────────────────────────────────────────────────────────────
section "Step 5/7: Setting up ExternalDNS prerequisites"

EXTERNAL_DNS_READY=false

if kubectl get namespace external-dns &>/dev/null; then
  check "Namespace 'external-dns' already exists"
else
  kubectl create namespace external-dns --dry-run=client -o yaml | kubectl apply -f -
  check "Namespace 'external-dns' created"
fi

# Check for existing hetzner-token secret
if kubectl get secret hetzner-token -n external-dns &>/dev/null; then
  check "Secret 'hetzner-token' already exists in external-dns namespace"
  EXTERNAL_DNS_READY=true
else
  if [ -z "${HETZNER_DNS_TOKEN}" ]; then
    warn "HETZNER_DNS_TOKEN environment variable not set."
    echo ""
    echo "  ExternalDNS requires a Hetzner DNS API token to manage DNS records."
    echo "  Create one at: https://dns.hetzner.com/ → API Tokens"
    echo ""
    read -r -p "  Enter Hetzner DNS API token (or press Enter to skip): " DNS_TOKEN_INPUT
    if [ -n "${DNS_TOKEN_INPUT}" ]; then
      HETZNER_DNS_TOKEN="${DNS_TOKEN_INPUT}"
    fi
  fi

  if [ -n "${HETZNER_DNS_TOKEN}" ]; then
    kubectl create secret generic hetzner-token \
      -n external-dns \
      --from-literal="token=${HETZNER_DNS_TOKEN}" \
      --dry-run=client -o yaml | kubectl apply -f -
    check "Secret 'hetzner-token' created in external-dns namespace"
    EXTERNAL_DNS_READY=true
  else
    warn "No Hetzner DNS token provided. Skipping ExternalDNS deployment."
    warn "You can deploy it later with: kubectl apply -f external-dns.yaml"
    warn "But first create the secret:"
    warn "  kubectl create secret generic hetzner-token -n external-dns --from-literal=token=<YOUR_DNS_TOKEN>"
  fi
fi

# ──────────────────────────────────────────────────────────────────
# Step 6: Deploy ExternalDNS (K3s HelmChart)
# ──────────────────────────────────────────────────────────────────
section "Step 6/7: Deploying ExternalDNS"

if [ "${EXTERNAL_DNS_READY}" = true ]; then
  kubectl apply -f "${EXTERNAL_DNS}"
  check "ExternalDNS HelmChart applied (K3s will auto-install)"

  # Wait for ExternalDNS pod
  echo ""
  echo "  Waiting for ExternalDNS pod to be ready (timeout: 120s)..."
  kubectl wait --for=condition=Ready pod \
    -l app.kubernetes.io/name=external-dns \
    -n external-dns \
    --timeout=120s 2>/dev/null && {
      check "ExternalDNS pod is ready"
    } || {
      warn "ExternalDNS pod not yet ready. It may still be pulling the image."
      echo "  Check status with:"
      echo "    kubectl get pods -n external-dns"
      echo "    kubectl logs -n external-dns deploy/external-dns --tail=20"
    }
else
  echo "  Skipping (secret not configured). Deploy later with:"
  echo "    kubectl apply -f ${EXTERNAL_DNS}"
fi

# ──────────────────────────────────────────────────────────────────
# Step 7: Verification
# ──────────────────────────────────────────────────────────────────
section "Step 7/7: Verification"

echo "  ── LoadBalancer Service ──"
kubectl get svc euroscale-vtgate-lb -n "${NAMESPACE}" 2>/dev/null || \
  warn "euroscale-vtgate-lb service not found"

echo ""
echo "  ── vtgate Pods (backend for LB) ──"
kubectl get pods -n "${NAMESPACE}" -l planetscale.com/component=vtgate -o wide 2>/dev/null || \
  warn "No vtgate pods found. Deploy Vitess first: cd ../vitess && bash deploy.sh"

echo ""
echo "  ── ExternalDNS Pods ──"
kubectl get pods -n external-dns -l app.kubernetes.io/name=external-dns 2>/dev/null || \
  echo "  (ExternalDNS not deployed or namespace doesn't exist)"

echo ""
echo "  ── CCM Pods ──"
kubectl get pods -n kube-system -l app.kubernetes.io/name=hcloud-cloud-controller-manager 2>/dev/null || \
  echo "  (CCM not detected; install it to enable LoadBalancer provisioning)"

# ── DNS verification (if LB IP is available) ──
if [ -n "${LB_IP}" ]; then
  echo ""
  echo "  ── DNS Resolution Check ──"
  if command -v dig &>/dev/null; then
    echo "  Checking A record for vtgate.euroscale.app..."
    dig +short vtgate.euroscale.app || warn "  DNS record not yet resolving (may need propagation)"
  else
    warn "dig not available. Check DNS manually: nslookup vtgate.euroscale.app"
  fi
fi

# ── Summary ───────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  EuroScale DNS & External Access deployment complete!       ║"
echo "╠══════════════════════════════════════════════════════════════╣"

if [ -n "${LB_IP}" ]; then
  echo "║                                                            ║"
  echo "║  LoadBalancer IP: ${LB_IP}"
  printf "║  %-56s ║\n" "  (pad to same width as above)"
  # Actually just:
  echo "║                                                            ║"
  echo "║  Create DNS A records:                                     ║"
  echo "║    vtgate.euroscale.app  →  ${LB_IP}"
  echo "║    *.euroscale.app       →  ${LB_IP}"
  echo "║                                                            ║"
else
  echo "║  LoadBalancer IP: pending (check CCM status)               ║"
fi

echo "║                                                            ║"
echo "║  Connect: mysql -h vtgate.euroscale.app -P 3306            ║"
echo "║  gRPC:    grpcurl vtgate.euroscale.app:50051 list          ║"
echo "║                                                            ║"
echo "║  Next: Task 7 — gRPC API service                           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
