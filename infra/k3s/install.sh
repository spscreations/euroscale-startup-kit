#!/usr/bin/env bash
# EuroScale — K3s Cluster Install Script
# Installs a 3-node K3s cluster (1 control plane + 2 workers) on Hetzner CAX21 nodes.
#
# Required environment variables:
#   CP_IP          — IP of the control-plane node (euroscale-cp-1, Nuremberg)
#   WK1_IP         — IP of worker node 1 (euroscale-wk-1, Nuremberg)
#   WK2_IP         — IP of worker node 2 (euroscale-wk-2, Helsinki)
#
# Optional environment variables:
#   SSH_USER       — SSH user for all nodes (default: root)
#   K3S_VERSION    — K3s version to install (default: v1.34.5+k3s1)

set -euo pipefail

SSH_USER="${SSH_USER:-root}"
K3S_VERSION="${K3S_VERSION:-v1.34.5+k3s1}"

echo "=== EuroScale K3s Cluster Install ==="
echo "Control Plane: ${CP_IP}"
echo "Worker 1:      ${WK1_IP}"
echo "Worker 2:      ${WK2_IP}"
echo "SSH User:      ${SSH_USER}"
echo "K3s Version:   ${K3S_VERSION}"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KUBECONFIG_FILE="${SCRIPT_DIR}/kubeconfig"

# ── Control Plane ────────────────────────────────────────────────────────────
echo "=== Step 1: Installing K3s control plane on ${CP_IP} ==="

ssh "${SSH_USER}@${CP_IP}" "bash -s" <<SSH_EOF
set -euo pipefail

export INSTALL_K3S_VERSION='${K3S_VERSION}'

curl -sfL https://get.k3s.io | sh -s - server \
  --write-kubeconfig-mode 644 \
  --node-name euroscale-cp-1 \
  --cluster-cidr 10.42.0.0/16 \
  --service-cidr 10.43.0.0/16 \
  --disable traefik \
  --disable local-storage \
  --etcd-snapshot-schedule-cron '0 */6 * * *' \
  --etcd-snapshot-retention 7 \
  --etcd-s3 \
  --etcd-s3-bucket euroscale-etcd-backups \
  --etcd-s3-region nbg1 \
  --etcd-s3-endpoint s3.nbg1.cloud.fsn.hetzner.com

echo "K3s server installed successfully."
SSH_EOF

# ── Retrieve Node Token ──────────────────────────────────────────────────────
echo ""
echo "=== Step 2: Retrieving node token ==="

NODE_TOKEN="$(ssh "${SSH_USER}@${CP_IP}" "cat /var/lib/rancher/k3s/server/node-token")"
echo "Node token retrieved."

# ── Export Kubeconfig ────────────────────────────────────────────────────────
echo ""
echo "=== Step 3: Exporting kubeconfig ==="

ssh "${SSH_USER}@${CP_IP}" "cat /etc/rancher/k3s/k3s.yaml" \
  | sed "s/127\.0\.0\.1/${CP_IP}/g" \
  > "${KUBECONFIG_FILE}"

chmod 600 "${KUBECONFIG_FILE}"
echo "Kubeconfig written to ${KUBECONFIG_FILE}"

# ── Worker 1 ─────────────────────────────────────────────────────────────────
echo ""
echo "=== Step 4: Joining worker euroscale-wk-1 (${WK1_IP}) ==="

ssh "${SSH_USER}@${WK1_IP}" "bash -s" <<SSH_EOF
set -euo pipefail

export INSTALL_K3S_VERSION='${K3S_VERSION}'

curl -sfL https://get.k3s.io | K3S_URL=https://${CP_IP}:6443 K3S_TOKEN=${NODE_TOKEN} sh -s - agent \
  --node-name euroscale-wk-1

echo "K3s agent installed on wk-1."
SSH_EOF

# ── Worker 2 ─────────────────────────────────────────────────────────────────
echo ""
echo "=== Step 5: Joining worker euroscale-wk-2 (${WK2_IP}) ==="

ssh "${SSH_USER}@${WK2_IP}" "bash -s" <<SSH_EOF
set -euo pipefail

export INSTALL_K3S_VERSION='${K3S_VERSION}'

curl -sfL https://get.k3s.io | K3S_URL=https://${CP_IP}:6443 K3S_TOKEN=${NODE_TOKEN} sh -s - agent \
  --node-name euroscale-wk-2

echo "K3s agent installed on wk-2."
SSH_EOF

# ── Verify Cluster ───────────────────────────────────────────────────────────
echo ""
echo "=== Step 6: Verifying cluster ==="

KUBECONFIG="${KUBECONFIG_FILE}" kubectl get nodes -o wide

echo ""
echo "=== K3s cluster installation complete! ==="
echo "Kubeconfig: ${KUBECONFIG_FILE}"
echo "Set: export KUBECONFIG=${KUBECONFIG_FILE}"
