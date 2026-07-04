#!/usr/bin/env bash
# Volume Auto-Scaler for EuroScale
# Monitors PVC utilization in the euroscale namespace and auto-resizes
# when thresholds are reached.
#
# Thresholds:
#   >80% (0.8) → resize PVC +20%
#   >90% (0.9) → resize PVC +50%, emit warning
#   10TB cap   → if at max Hetzner volume size, emit reshard alert
#
# Designed to run as a K8s CronJob or standalone script.
set -euo pipefail

NAMESPACE="${NAMESPACE:-europe}"
MAX_VOLUME_GB="${MAX_VOLUME_GB:-10240}"  # 10TB Hetzner limit in GB
PCT_RESIZE_NORMAL="${PCT_RESIZE_NORMAL:-0.80}"
PCT_RESIZE_AGGRESSIVE="${PCT_RESIZE_AGGRESSIVE:-0.90}"
RESIZE_FACTOR_NORMAL="${RESIZE_FACTOR_NORMAL:-1.2}"     # +20%
RESIZE_FACTOR_AGGRESSIVE="${RESIZE_FACTOR_AGGRESSIVE:-1.5}"  # +50%

ALERTS=""

# Get all PVCs in the namespace
pvc_list=$(kubectl get pvc -n "$NAMESPACE" -o name 2>/dev/null) || {
  echo "ERROR: cannot list PVCs in namespace $NAMESPACE"
  exit 1
}

for pvc_ref in $pvc_list; do
  pvc_name="${pvc_ref#persistentvolumeclaim/}"

  # Get capacity and used bytes
  capacity_str=$(kubectl get "$pvc_ref" -n "$NAMESPACE" -o jsonpath='{.status.capacity.storage}' 2>/dev/null || echo "")
  [ -z "$capacity_str" ] && continue

  # Parse capacity to bytes
  capacity_bytes=$(numfmt --from=iec "$capacity_str" 2>/dev/null || echo "0")
  [ "$capacity_bytes" -eq 0 ] && continue

  # Get usage (annotated by volume usage exporter, or fallback to pod metrics)
  # For now, estimate usage from the PVC's status — actual usage requires
  # the csi-resizer or a node-level check
  # We use the PVC's allocated size as a proxy; real implementation would
  # use a node agent or the csi-resizer metrics
  capacity_gb=$((capacity_bytes / 1073741824))
  usage_pct=$(kubectl get "$pvc_ref" -n "$NAMESPACE" -o jsonpath='{.metadata.annotations.usage-pct}' 2>/dev/null || echo "")

  # If no usage annotation, skip (no data available)
  [ -z "$usage_pct" ] && continue

  echo "[$pvc_name] ${capacity_gb}Gi allocated, ${usage_pct}% used"

  # Compare thresholds
  if (( $(echo "$usage_pct > $PCT_RESIZE_AGGRESSIVE * 100" | bc -l) )); then
    # Resize aggressively (+50%)
    if [ "$capacity_gb" -ge "$MAX_VOLUME_GB" ]; then
      ALERTS+="⚠️  [$pvc_name] At 10TB max and ${usage_pct}% full - needs Vitess reshard!\n"
      continue
    fi
    new_size_gb=$(echo "scale=0; $capacity_gb * $RESIZE_FACTOR_AGGRESSIVE / 1" | bc)
    [ "$new_size_gb" -gt "$MAX_VOLUME_GB" ] && new_size_gb=$MAX_VOLUME_GB
    new_size="${new_size_gb}Gi"
    echo "  → AGGRESSIVE: resizing to ${new_size} (+50%)"
    kubectl patch "$pvc_ref" -n "$NAMESPACE" \
      -p "{\"spec\":{\"resources\":{\"requests\":{\"storage\":\"$new_size\"}}}}"

  elif (( $(echo "$usage_pct > $PCT_RESIZE_NORMAL * 100" | bc -l) )); then
    # Normal resize (+20%)
    if [ "$capacity_gb" -ge "$MAX_VOLUME_GB" ]; then
      ALERTS+="⚠️  [$pvc_name] At 10TB max and ${usage_pct}% full - needs Vitess reshard!\n"
      continue
    fi
    new_size_gb=$(echo "scale=0; $capacity_gb * $RESIZE_FACTOR_NORMAL / 1" | bc)
    [ "$new_size_gb" -gt "$MAX_VOLUME_GB" ] && new_size_gb=$MAX_VOLUME_GB
    new_size="${new_size_gb}Gi"
    echo "  → NORMAL: resizing to ${new_size} (+20%)"
    kubectl patch "$pvc_ref" -n "$NAMESPACE" \
      -p "{\"spec\":{\"resources\":{\"requests\":{\"storage\":\"$new_size\"}}}}"
  fi
done

if [ -n "$ALERTS" ]; then
  echo -e "\n=== ALERTS ==="
  echo -e "$ALERTS"
fi

echo "Volume auto-scaler run complete."
