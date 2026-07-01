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
| `vitess-cluster.yaml` | VitessCluster CRD manifest — defines cells, keyspaces, tablets, vtgate, vtctld, vtadmin, backups |
| `vitess-backup-creds.yaml` | K8s Secret — MinIO access key + secret key in AWS credentials format for Vitess S3 backup driver |
| `backup-test.sh` | Backup verification script — lists backups, triggers manual backup, confirms |
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
| **Task 5** | Backups — configure S3-compatible backup location (MinIO) in VitessCluster ✅ |
| Post-MVP | Add TLS, authentication, monitoring (Prometheus/Grafana), connection pooling |

---

## Backups (PITR)

EuroScale uses Vitess native backups stored in MinIO (S3-compatible object storage) with Point-In-Time Recovery support.

### Architecture

```
┌──────────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│   Vitess Cluster │────▶│   MinIO (S3 API)    │     │  euroscale-backups│
│   (vtctldclient) │     │   minio:9000        │────▶│  bucket            │
│                  │     │                     │     │                    │
│  full-backup     │     │  Path-style access  │     │  main/0/           │
│  (daily 2am)     │     │  forcePathStyle=true│     │    full/           │
│                  │     │                     │     │    incremental/    │
│  incremental     │     │                     │     │                    │
│  (every 15min)   │     │                     │     │                    │
└──────────────────┘     └─────────────────────┘     └──────────────────┘
```

### Backup Schedule

| Schedule | Name | Cron | Retention | Method |
|----------|------|------|-----------|--------|
| Full backup | `full-backup` | `0 2 * * *` (daily 2am UTC) | 7 backups | vtctldclient |
| Incremental backup | `incremental-backup` | `*/15 * * * *` (every 15 min) | 96 backups (24h) | vtctldclient |

### Credentials

MinIO credentials are stored in K8s Secret `vitess-backup-creds` (namespace: `euroscale`) in AWS credentials file format:

```yaml
# vitess-backup-creds.yaml
apiVersion: v1
kind: Secret
metadata:
  name: vitess-backup-creds
  namespace: euroscale
stringData:
  credentials: |
    [default]
    aws_access_key_id = minioadmin
    aws_secret_access_key = minioadmin
```

Apply credentials before deploying the cluster:

```bash
kubectl apply -f infra/vitess/vitess-backup-creds.yaml
```

### Backup Operations

```bash
# Test backups
bash infra/vitess/backup-test.sh

# List backups for keyspace
vtctlclient -server euroscale-vtctld:15999 ListBackups main

# Trigger manual backup
vtctlclient -server euroscale-vtctld:15999 BackupShard main/0

# Check backup schedule objects
kubectl get vitessbackupschedules -n euroscale

# Check backup storage objects
kubectl get vitessbackupstorages -n euroscale

# Check individual backup records
kubectl get vitessbackups -n euroscale

# Check MinIO bucket contents
kubectl port-forward -n minio svc/minio-console 9001:9001
# → Open http://localhost:9001 → bucket: euroscale-backups
```

### Restore from Backup

```bash
# Restore a shard from backup (specify backup name or use latest)
vtctlclient -server euroscale-vtctld:15999 RestoreFromBackup main/0 <backup-name>

# Or let Vitess auto-pick the latest backup
vtctlclient -server euroscale-vtctld:15999 RestoreFromBackup main/0
```

### Key Decisions

- **S3 location with MinIO endpoint** — uses the Vitess operator's `s3` backup location type with a custom `endpoint` pointing to MinIO, `forcePathStyle: true` for path-based bucket access
- **`engine: builtin`** — uses Vitess built-in backup (mysqldump-based); switch to `xtrabackup` for larger datasets
- **`backupMethod: vtctldclient`** — sends `BackupShard` command to vtctld, which tells a running serving replica to take the backup directly; no extra PVC needed
- **`successfulJobsHistoryLimit`** — controls backup retention at the K8s Job level (7 full, 96 incremental = 24h of 15-min backups)
- **PITR via incremental backups** — 15-minute granularity allows point-in-time recovery within the retention window
