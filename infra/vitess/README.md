# EuroScale — Vitess Operator Deployment

Multi-region Vitess cluster on K3s, deployed via the [Planetscale Vitess Operator](https://github.com/planetscale/vitess-operator).

## Architecture

```
                          ┌─────────────────────┐
                          │     vtgate          │
                          │  (MySQL protocol)   │
                          │  nuremberg + hel     │
                          └──────┬───┬──────────┘
                                 │   │
               ┌─────────────────┘   └─────────────────┐
               ▼                                       ▼
  ┌────────────────────────┐            ┌────────────────────────┐
  │   Cell: nuremberg      │            │   Cell: helsinki       │
  │   (Hetzner nbg1)       │            │   (Hetzner hel1)       │
  │                        │            │                        │
  │  ┌──────────────────┐  │            │  ┌──────────────────┐  │
  │  │  PRIMARY (auto)  │  │            │  │    REPLICA       │  │
  │  │  vttablet-0      │──┼────MySQL───▶│  │  vttablet-0      │  │
  │  │  mysqld:512Mi    │  │  replication│  │  mysqld:512Mi    │  │
  │  └──────────────────┘  │            │  └──────────────────┘  │
  │  ┌──────────────────┐  │            │                        │
  │  │    REPLICA       │  │            │                        │
  │  │  vttablet-1      │  │            │                        │
  │  │  mysqld:512Mi    │  │            │                        │
  │  └──────────────────┘  │            │                        │
  │                        │            │                        │
  │  vtgate ×1             │            │  vtgate ×1             │
  │  vtctld ×1             │            │                        │
  │  vtadmin-api ×1        │            │                        │
  └────────────────────────┘            └────────────────────────┘

Keyspace: main
Durability: cross_cell
Shards: 1 (unsharded)
Total tablets: 3 (2 nuremberg + 1 helsinki)
```

## Quick Start

```bash
# 1. Point to your K3s cluster
export KUBECONFIG=/path/to/k3s.yaml

# 2. Deploy everything
cd infra/vitess
bash deploy.sh
```

## Files

| File | Description |
|------|-------------|
| `vitess-cluster.yaml` | VitessCluster CRD manifest — defines cells, keyspaces, tablets, vtgate, vtctld, vtadmin |
| `deploy.sh` | One-shot deployment script — installs operator, creates namespace, applies cluster, verifies |
| `README.md` | This file |

## Verification Commands

```bash
# Check cluster status
kubectl get vtc/euroscale -n euroscale

# Watch pods come up
kubectl get pods -n euroscale -w

# List services
kubectl get svc -n euroscale

# Test MySQL connection (once vtgate is ready)
kubectl run mysql-test --rm -it --restart=Never \
  -n euroscale --image=mysql:8.0 -- \
  mysql -h euroscale-vtgate -e "SHOW DATABASES;"

# Port-forward vtgate for local access
kubectl port-forward -n euroscale svc/euroscale-vtgate 3306:3306

# Port-forward vtctld (Vitess dashboard)
kubectl port-forward -n euroscale svc/euroscale-vtctld 15000:15000
# Then open: http://localhost:15000

# Port-forward vtadmin API
kubectl port-forward -n euroscale svc/euroscale-vtadmin 15001:15001
```

## Resource Overview (MVP)

| Component | Count | CPU Request | Memory Request |
|-----------|-------|-------------|----------------|
| vtgate | 2 (1/cell) | 100m each | 128Mi each |
| vttablet | 3 | 100m each | 128Mi each |
| mysqld | 3 | 250m each | 512Mi each |
| vtctld | 1 | 100m | 128Mi |
| vtadmin-api | 1 | 100m | 64Mi |
| etcd (lockserver) | 3 | 100m each | 256Mi each |
| **Total** | **~750m CPU** | **~2.7 Gi memory** |

Per tablet storage: 10 Gi PVC (30 Gi total for 3 tablets).

## Key Decisions

- **`vitess/lite:v20.0.0`** — single image for all Vitess components + MySQL 8.0
- **`durabilityPolicy: cross_cell`** — enables cross-cell primary failover
- **`updateStrategy: Immediate`** — auto-apply changes (good for MVP; switch to `External` for production GitOps)
- **vtadmin API-only** — no web UI deployed (`webResources` omitted)
- **2 replicas in Nuremberg** — one becomes primary (auto-elected by Vitess), second provides local read failover
- **1 replica in Helsinki** — cross-region read replica for latency/DR

## Next Steps

| Task | Description |
|------|-------------|
| **Task 4** | gRPC API — build the EuroScale control plane API to provision/manage databases |
| **Task 5** | Backups — configure S3-compatible backup location (MinIO) in VitessCluster |
| Post-MVP | Add TLS, authentication, monitoring (Prometheus/Grafana), connection pooling |
