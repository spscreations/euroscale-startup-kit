# EuroScale — etcd Snapshot Configuration (Layer 4)

K3s embedded etcd snapshots are configured via command-line flags on the
control plane node. These are already set in `../k3s/install.sh`.

## Current Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| Schedule | `0 */6 * * *` | Snapshot every 6 hours |
| Retention | 7 snapshots | Oldest snapshot rotated out |
| Destination | Hetzner Object Storage (S3) | S3-compatible, region nbg1 |
| Bucket | `euroscale-etcd-backups` | Must be created in Hetzner Object Storage |
| Endpoint | `s3.nbg1.cloud.fsn.hetzner.com` | Nuremberg DC, low latency |

## How It Works

K3s has built-in etcd snapshot support. When you pass the appropriate flags
to `k3s server`, it automatically:

1. Takes snapshots of the embedded etcd data store on the configured schedule
2. Stores them locally first (`/var/lib/rancher/k3s/server/db/snapshots/`)
3. Uploads each snapshot to the configured S3-compatible storage (Hetzner
   Object Storage in this case)
4. Manages retention — keeps only the most recent N snapshots in S3

These snapshots contain the full Kubernetes cluster state:
- All Secrets, ConfigMaps, Deployments, Services, CRDs
- VitessCluster definitions, ServiceMonitors, PrometheusRules
- RBAC configurations

## Verification

```bash
# Check local snapshots on control plane (SSH)
ssh root@<cp-ip> "ls -lh /var/lib/rancher/k3s/server/db/snapshots/"

# Verify S3 upload via Hetzner Object Storage console
# Or use s3cmd / mc to check the bucket:
mc alias set hetzner https://s3.nbg1.cloud.fsn.hetzner.com \
  <access-key> <secret-key>
mc ls hetzner/euroscale-etcd-backups/
```

## Restore Process

```bash
# 1. SSH to control plane node
ssh root@<cp-ip>

# 2. List available snapshots (local or S3)
ls -la /var/lib/rancher/k3s/server/db/snapshots/

# 3. Stop K3s
systemctl stop k3s

# 4. Restore from snapshot
k3s server \
  --cluster-reset \
  --cluster-reset-restore-path=/var/lib/rancher/k3s/server/db/snapshots/on-demand-euroscale-<timestamp>

# 5. Start K3s (after reset, it starts as a fresh cluster from snapshot)
systemctl start k3s

# 6. Verify cluster state
kubectl get nodes
kubectl get pods -A
```

## S3 Credentials

etcd snapshots to Hetzner Object Storage use the same credentials as the K3s
cluster's cloud provider integration. These are typically configured via
environment variables or the Hetzner Cloud Controller Manager.

If S3 upload is required, ensure:
1. Hetzner Object Storage bucket `euroscale-etcd-backups` exists in the nbg1 region
2. The control plane node has S3 credentials configured (via IAM or access keys)
3. The `--etcd-s3` flags are present in the K3s server startup command

## Disaster Recovery Note

For a complete cluster recovery from scratch:
1. Provision new Hetzner nodes via Terraform
2. Install K3s WITHOUT the `--cluster-init` flag (single-node first)
3. Wait for etcd to start, then stop K3s
4. Run `k3s server --cluster-reset --cluster-reset-restore-path=<snapshot>`
5. Start K3s — it will restore all Kubernetes objects
6. Verify Vitess, MinIO, cert-manager, and monitoring are operational
7. Re-deploy the backup infrastructure (MinIO PVCs may need re-creation)
