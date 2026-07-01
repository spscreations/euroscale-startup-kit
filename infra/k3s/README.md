# EuroScale — K3s Cluster

Lightweight Kubernetes cluster running on 3 Hetzner CAX21 nodes (2× Nuremberg, 1× Helsinki).
Serves as the control plane for EuroScale, a European PlanetScale alternative (serverless MySQL
DBaaS built on Vitess).

## Overview

| Component       | Details                                                        |
|-----------------|----------------------------------------------------------------|
| **Cluster**     | K3s v1.30.2+k3s2, 3 nodes (1 CP + 2 workers)                  |
| **Nodes**       | `euroscale-cp-1` (Nuremberg), `euroscale-wk-1` (Nuremberg), `euroscale-wk-2` (Helsinki) |
| **CNI**         | Flannel (K3s default), CIDR 10.42.0.0/16                       |
| **Service CIDR**| 10.43.0.0/16                                                   |
| **Ingress**     | Traefik *disabled* (replaced later by Cilium/Envoy)            |
| **Storage**     | local-path (default); local-storage *disabled*                 |
| **ETCD**        | Embedded etcd with encryption at rest (AES-GCM)                |
| **Addons**      | cert-manager (TLS automation), MinIO (S3-compatible object store) |

## Prerequisites

- **Terraform infra applied** — nodes exist and are reachable via SSH (see `../terraform/`)
- **SSH key** — the private key used in the Terraform Hetzner config
- **kubectl** installed on your workstation
- **Helm 3** installed on your workstation

## Quick Start

```bash
# 1. Export the node IPs (get these from Terraform output or Hetzner Cloud Console)
export CP_IP=<euroscale-cp-1 public IP>     # Nuremberg
export WK1_IP=<euroscale-wk-1 public IP>    # Nuremberg
export WK2_IP=<euroscale-wk-2 public IP>    # Helsinki
export SSH_USER=root                         # or your SSH user

# 2. Install K3s
bash install.sh

# 3. Deploy addons
bash deploy-addons.sh
```

After `install.sh` finishes, a `kubeconfig` file is written to this directory. Use it with:

```bash
export KUBECONFIG=./infra/k3s/kubeconfig
kubectl get nodes
```

## Files

| File                          | Purpose                                                   |
|-------------------------------|-----------------------------------------------------------|
| `install.sh`                  | Idempotent K3s cluster bootstrap (CP + workers)           |
| `deploy-addons.sh`            | Helm-based addon deployment (cert-manager, MinIO)         |
| `etcd-encryption-config.yaml` | EncryptionConfiguration for etcd at rest (AES-GCM Secrets)|
| `.gitignore`                  | Excludes `kubeconfig` from version control                |
| `README.md`                   | This file                                                 |
| `kubeconfig`                  | *Generated*, not committed — cluster credentials          |

## Environment Variables

### `install.sh`

| Variable      | Default        | Description                          |
|---------------|----------------|--------------------------------------|
| `CP_IP`       | *(required)*   | Control plane node public IP         |
| `WK1_IP`      | *(required)*   | Worker 1 node public IP              |
| `WK2_IP`      | *(required)*   | Worker 2 node public IP              |
| `SSH_USER`    | `root`         | SSH user for all nodes               |
| `K3S_VERSION` | `v1.30.2+k3s2` | K3s version to install               |

### `deploy-addons.sh`

| Variable              | Default                  | Description              |
|-----------------------|--------------------------|--------------------------|
| `MINIO_ROOT_PASSWORD` | *(auto-generated, 32B)*  | MinIO root password      |

## Verification

```bash
# All nodes Ready
kubectl get nodes -o wide

# cert-manager running
kubectl get pods -n cert-manager

# MinIO running
kubectl get pods -n minio

# Backup credentials Secret exists
kubectl get secret vitess-backup-creds -n euroscale

# Check MinIO reachable (port-forward)
kubectl port-forward -n minio svc/minio 9000:9000 &
curl http://localhost:9000/minio/health/live
```

## Next Steps

1. **Apply etcd encryption** — edit `etcd-encryption-config.yaml` with a real key, copy to the
   control-plane node, and configure K3s to use it (see comments in the file).
2. **Deploy Vitess** — see `../vitess/` for operator and topology configuration.
3. **Replace CNI** — swap Flannel for Cilium to get network policies and eBPF support.
4. **Set up monitoring** — deploy Prometheus + Grafana for cluster observability.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Hetzner Cloud (FSN1 / HEL1)                            │
│                                                         │
│  ┌───────────────────┐   ┌───────────────────────────┐  │
│  │ K3s Control Plane │   │ K3s Workers               │  │
│  │                   │   │                           │  │
│  │ euroscale-cp-1    │   │ euroscale-wk-1 (Nbg)      │  │
│  │ (Nuremberg)       │   │ euroscale-wk-2 (Hki)      │  │
│  │                   │   │                           │  │
│  │ ┌───────────────┐ │   │ ┌───────────────────────┐ │  │
│  │ │ etcd (enc)    │ │   │ │ cert-manager          │ │  │
│  │ └───────────────┘ │   │ │ MinIO (100Gi)         │ │  │
│  └───────────────────┘   │ │ Vitess (soon)         │ │  │
│                          │ └───────────────────────┘ │  │
│                          └───────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```
