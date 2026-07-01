# EuroScale Backup System — 5-Layer Defense in Depth

Complete off-site backup, restore testing, retention, and monitoring for the
EuroScale Vitess-on-K3s platform.

## Architecture

```
                            ┌──────────────────────────┐
                            │    Layer 5: MONITORING    │
                            │  PrometheusRule alerts    │
                            │  → NoRecentBackup         │
                            │  → RestoreTestFailed      │
                            │  → OffSiteSyncStale       │
                            └──────────┬───────────────┘
                                       │ alerts fire on
              ┌────────────────────────┼──────────────────────────┐
              │                        │                          │
              ▼                        ▼                          ▼
 ┌───────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
 │ Layer 4: etcd State   │  │ Layer 2: Local MinIO  │  │ Layer 3: Off-Site     │
 │                       │  │                       │  │                       │
 │ K3s etcd snapshots    │  │ Vitess native S3      │  │ rclone sync           │
 │ every 6h → MinIO S3   │  │ full daily + incr 15m │  │ MinIO → Storage Box   │
 │                       │  │ PITR binlogs every 5m │  │ every 6h via SFTP      │
 └───────────┬───────────┘  └──────────┬────────────┘  └───────────┬───────────┘
             │                         │                           │
             │                         │       ┌───────────────────┘
             │                         │       │
             ▼                         ▼       ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │                         Layer 1: Live Replication                        │
 │                                                                         │
 │  ┌──────────┐     semi-sync      ┌──────────┐    async     ┌──────────┐ │
 │  │ Nürnberg │ ◄───────────────► │ Nürnberg │ ──────────► │ Helsinki │ │
 │  │ PRIMARY  │                    │ REPLICA  │              │ REPLICA  │ │
 │  └──────────┘                    └──────────┘              └──────────┘ │
 │                                                                         │
 │  Vitess cross-cell replication · RPO ~1s · RTO ~30s                     │
 └─────────────────────────────────────────────────────────────────────────┘
```

## Layers

| Layer | Name | RPO | RTO | Schedule | Retention | File |
|-------|------|-----|-----|----------|-----------|------|
| 1 | Live Cross-Cell Replication | ~1s | ~30s | Continuous | N/A | (Vitess built-in) |
| 2 | Local MinIO Backups | ~15min | ~10min | Daily full + 15min incr | 7 days | `vitess-cluster.yaml` |
| 3 | Off-Site Storage Box | ~6h | ~30min | Every 6h | 30 days | `rclone-sync-cronjob.yaml` |
| 4 | etcd Cluster State | ~6h | ~15min | Every 6h (K3s) | 30 days | `etcd-s3-config.yaml` |
| 5 | Restore Testing | N/A | N/A | Weekly Sun 03:00 | 3+5 jobs | `weekly-restore-cronjob.yaml` |

### Global SLA

- **RTO (Recovery Time Objective)**: 30 minutes
- **RPO (Recovery Point Objective)**: 15 minutes

## Files

```
infra/
├── backups/
│   ├── README.md                          ← You are here
│   ├── rclone-sync-cronjob.yaml           ← Layer 3: MinIO → Hetzner Storage Box
│   ├── etcd-s3-config.yaml                ← Layer 4: etcd snapshots → MinIO S3
│   ├── restore-test.sh                    ← Layer 5: Automated restore test script
│   ├── weekly-restore-cronjob.yaml        ← Layer 5: CronJob + RBAC
│   └── retention-policy.yaml              ← Layer 4: Retention policy (doc)
├── monitoring/
│   ├── backup-alerts.yaml                 ← Layer 5: Prometheus alert rules
│   ├── README.md
│   ├── deploy.sh
│   └── vitess-dashboard.json
├── vitess/
│   ├── vitess-cluster.yaml                ← Contains Layer 2 schedules
│   ├── backup-config.yaml
│   └── vitess-backup-creds.yaml
└── ...
```

## Setup Instructions

### 1. Prerequisites

All 5 layers assume:
- **K3s cluster** running (3 nodes)
- **Vitess Operator** installed with `VitessCluster` deployed
- **MinIO** running at `euroscale-backups.minio:9000` with bucket `euroscale-backups`
- **Hetzner Storage Box** provisioned with SSH access
- **kube-prometheus-stack** deployed (for alerting)

### 2. Layer 1 — Live Replication (Already Active)

No setup needed. Vitess cross-cell replication is configured in `vitess-cluster.yaml`:
- Nürnberg: 2 tablets (1 primary + 1 replica)
- Helsinki: 1 read replica
- `durabilityPolicy: cross_cell`

### 3. Layer 2 — Local MinIO Backups (Already Active)

Backup schedules are defined in `vitess-cluster.yaml` under `spec.backup.schedules`:
- Full backup: daily at 02:00 UTC
- Incremental backup: every 15 minutes
- PITR binlog: every 5 minutes

Verify:
```bash
kubectl get vitessbackups -n euroscale
kubectl logs -l planetscale.com/component=vtbackup -n euroscale --tail=20
```

### 4. Layer 3 — Off-Site Sync (rclone → Storage Box)

```bash
# 1. Create the SSH key Secret
kubectl create secret generic storagebox-ssh-key \
  --from-file=id_rsa=/path/to/storagebox-ssh-key \
  --from-file=known_hosts=/path/to/known_hosts \
  --from-literal=host=uXXXXX.your-storagebox.de \
  --from-literal=user=uXXXXX \
  -n euroscale

# 2. Create the Storage Box ConfigMap (edit values first)
kubectl apply -f infra/backups/rclone-sync-cronjob.yaml

# 3. Trigger a manual sync to verify
kubectl create job --from=cronjob/euroscale-rclone-sync manual-sync -n euroscale
kubectl logs -l app=euroscale-rclone-sync -n euroscale -f
```

### 5. Layer 4 — etcd Snapshots

On each K3s control-plane node, merge the etcd-s3 config into `/etc/rancher/k3s/config.yaml`:

```bash
# Verify current config
cat /etc/rancher/k3s/config.yaml

# Add etcd-s3 section from etcd-s3-config.yaml
# Then restart K3s
systemctl restart k3s

# Verify snapshots are flowing to MinIO
kubectl run mc-check --rm -it --image=minio/mc --restart=Never -n euroscale -- \
  /bin/sh -c "mc alias set m http://euroscale-backups.minio:9000 \$MINIO_ACCESS_KEY \$MINIO_SECRET_KEY && mc ls m/euroscale-backups/etcd-snapshots/"
```

### 6. Layer 5 — Restore Testing + Alerts

```bash
# 1. Apply the restore test CronJob + RBAC
kubectl apply -f infra/backups/weekly-restore-cronjob.yaml

# 2. Apply Prometheus alert rules
kubectl apply -f infra/monitoring/backup-alerts.yaml

# 3. Trigger a manual restore test to validate
kubectl create job --from=cronjob/euroscale-restore-test manual-restore -n euroscale
kubectl logs -l app=euroscale-restore-test -n euroscale -f

# 4. Verify alerts are loaded
kubectl get prometheusrule -n monitoring euroscale-backup-alerts
```

## Testing Recovery

### Quick Test: Verify Backups Exist

```bash
# List available Vitess backups
kubectl exec -n euroscale deploy/euroscale-vtctld -- vtctldclient GetBackups main/-

# List etcd snapshots in MinIO
kubectl run mc-ls --rm -it --image=minio/mc --restart=Never -n euroscale -- \
  /bin/sh -c "mc alias set m http://euroscale-backups.minio:9000 \$ACCESS_KEY \$SECRET_KEY && mc ls m/euroscale-backups/etcd-snapshots/ --recursive"
```

### Full Restore Drill (Scenario D)

1. **Provision new K3s cluster** (`terraform apply` from `infra/terraform/hetzner/`)

2. **Deploy MinIO** and sync from Storage Box:
   ```bash
   rclone sync storagebox:euroscale-backups minio:euroscale-backups
   ```

3. **Restore etcd state**:
   ```bash
   k3s server --cluster-reset --etcd-s3 \
     --etcd-s3-bucket=euroscale-backups \
     --etcd-s3-endpoint=euroscale-backups.minio:9000 \
     --etcd-s3-insecure \
     --cluster-reset-restore-path=etcd-snapshots/<latest-snapshot>
   ```

4. **Deploy Vitess Operator** + apply `vitess-cluster.yaml`

5. **Restore keyspace data**:
   ```bash
   kubectl exec -n euroscale deploy/euroscale-vtctld -- \
     vtctldclient RestoreFromBackup main/-
   ```

6. **Validate**: Check tables, run VDiff, verify application health.

## Retention Policy Summary

| Data | Location | Retention | Cleanup |
|------|----------|-----------|---------|
| Full backups | MinIO + Storage Box | 7d (MinIO), 30d (Storage Box) | MinIO lifecycle rule |
| Incremental backups | MinIO + Storage Box | 24h (96 snapshots) | Auto-rotated by Vitess |
| PITR binlogs | MinIO + Storage Box | 24h (288 segments) | Auto-rotated by Vitess |
| etcd snapshots | Disk + MinIO + Storage Box | 48 local, 30d remote | K3s snapshot retention |
| rclone archives | Storage Box | 30d (daily --backup-dir) | Manual/scripted cleanup |
| Restore test logs | K8s CronJob history | 3 success + 5 failed | CronJob history limit |

## Alerts

| Alert | Severity | What It Means | Action |
|-------|----------|---------------|--------|
| **NoRecentVitessBackup** | Critical | No Vitess backup in 36h | Check CronJob, MinIO, vttablet logs |
| **RestoreTestFailed** | Critical | Weekly restore test failed | Check test logs, manually retry |
| **OffSiteSyncStale** | Critical | rclone hasn't synced in 12h | Check CronJob logs, Storage Box connectivity |
| **MinIOBackupStorageLow** | Warning | Backup storage > 85% | Increase PVC, adjust retention |
| **EtcdSnapshotStale** | Warning | No etcd snapshot in 12h | Check K3s journalctl, MinIO reachability |
| **RestoreTestStale** | Warning | No restore test in 8 days | Check CronJob schedule |

Alert rules are defined in `infra/monitoring/backup-alerts.yaml`.

## Maintenance

### Weekly
- [ ] Review backup alert history (Grafana → Alerting)
- [ ] Check automated restore test results
- [ ] Verify Storage Box has free space

### Monthly
- [ ] Manual DR drill (Scenario D from `retention-policy.yaml`)
- [ ] Rotate MinIO access keys
- [ ] Rotate Storage Box SSH key
- [ ] Review and adjust retention windows

### Quarterly
- [ ] Full end-to-end DR simulation (timed)
- [ ] Compare measured RTO/RPO against SLA
- [ ] Update retention-policy.yaml with lessons learned

## Troubleshooting

### Backups not appearing in MinIO
```bash
kubectl logs -n euroscale -l planetscale.com/component=vttablet --tail=50 | grep -i backup
kubectl describe vitessbackup -n euroscale
kubectl get events -n euroscale --sort-by='.lastTimestamp' | tail -20
```

### rclone sync failing
```bash
kubectl logs -l app=euroscale-rclone-sync -n euroscale --tail=100
# Common issues:
# - SSH key permissions: must be 0600
# - Storage Box quota exceeded
# - Network timeout: increase --timeout in rclone command
```

### Restore test failing
```bash
# Get full test logs
kubectl logs -l app=euroscale-restore-test -n euroscale --tail=500

# Check if the test namespace wasn't cleaned up
kubectl get ns | grep restore-test
# Force cleanup if stuck:
kubectl delete ns euroscale-restore-test-* --force --grace-period=0
```

### Alert not firing
```bash
# Check PrometheusRule is loaded
kubectl get prometheusrule -n monitoring euroscale-backup-alerts

# Port-forward Prometheus and check /alerts
kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090
# Open http://localhost:9090/alerts
```
