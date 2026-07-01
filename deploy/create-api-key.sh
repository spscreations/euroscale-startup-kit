#!/usr/bin/env bash
# ── create-api-key.sh ─────────────────────────────────────────────────────────
# Generate a random API key and store it as a K8s Secret in the euroscale
# namespace.  Requires kubectl and a working kubeconfig.
#
# Usage:
#   ./deploy/create-api-key.sh
#
# The key is printed to stdout *only* during creation so you can save it.
# Subsequent runs rotate the key (replace) — run rollout restart afterward.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

NAMESPACE="${NAMESPACE:-euroscale}"
SECRET_NAME="${SECRET_NAME:-euroscale-api-key}"

# Generate a 256-bit base64 key (44 bytes base64-encoded).
API_KEY="$(openssl rand -base64 32)"

# Create or replace the secret.
if kubectl get secret -n "$NAMESPACE" "$SECRET_NAME" &>/dev/null; then
  kubectl create secret generic "$SECRET_NAME" \
    --namespace "$NAMESPACE" \
    --from-literal=api_key="$API_KEY" \
    --dry-run=client -o yaml | kubectl replace -f -
  echo "INFO: rotated secret '$SECRET_NAME' in namespace '$NAMESPACE'"
else
  kubectl create secret generic "$SECRET_NAME" \
    --namespace "$NAMESPACE" \
    --from-literal=api_key="$API_KEY"
  echo "INFO: created secret '$SECRET_NAME' in namespace '$NAMESPACE'"
fi

# Print the key once — save it somewhere safe (e.g. password manager).
echo "────────────────────────────────────────────────────────────"
echo "API Key: $API_KEY"
echo "────────────────────────────────────────────────────────────"
echo "WARNING: this is the only time the key is shown.  Lost it?"
echo "  kubectl get secret -n $NAMESPACE $SECRET_NAME -o jsonpath='{.data.api_key}' | base64 -d"
echo ""
echo "After rotation, restart the deployment:"
echo "  kubectl rollout restart deployment/euroscale-api -n $NAMESPACE"
