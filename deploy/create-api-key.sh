#!/usr/bin/env bash
# ── create-api-key.sh ─────────────────────────────────────────────────────────
# Generate a random API key and store it as a K8s Secret in the euroscale
# namespace.  Requires kubectl and a working kubeconfig.
#
# Usage:
#   ./deploy/create-api-key.sh
#
# SECURITY: the full key is written once to a mode-0600 file under /tmp and is
# NEVER echoed to stdout (avoids shell history / CI log leakage).
# Subsequent runs rotate the key — run rollout restart afterward.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

NAMESPACE="${NAMESPACE:-euroscale}"
SECRET_NAME="${SECRET_NAME:-euroscale-api-key}"
OUT_FILE="${OUT_FILE:-/tmp/euroscale-api-key.$$.txt}"

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

# Write key to a private file — do not print the full value.
umask 077
printf '%s\n' "$API_KEY" > "$OUT_FILE"
chmod 600 "$OUT_FILE"

# Fingerprint only (first 4 + last 4 chars) for operator confirmation.
FP_PREFIX="${API_KEY:0:4}"
FP_SUFFIX="${API_KEY: -4}"
echo "────────────────────────────────────────────────────────────"
echo "API key written to: $OUT_FILE (mode 0600)"
echo "Fingerprint: ${FP_PREFIX}…${FP_SUFFIX}"
echo "────────────────────────────────────────────────────────────"
echo "Load into password manager, then shred the file:"
echo "  shred -u '$OUT_FILE'   # or: rm -f '$OUT_FILE'"
echo ""
echo "Retrieve from cluster later (still sensitive):"
echo "  kubectl get secret -n $NAMESPACE $SECRET_NAME -o jsonpath='{.data.api_key}' | base64 -d; echo"
echo ""
echo "After rotation, restart the deployment:"
echo "  kubectl rollout restart deployment/euroscale-api -n $NAMESPACE"
