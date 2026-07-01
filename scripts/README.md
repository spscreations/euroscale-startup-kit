# EuroScale Smoke Tests

End-to-end smoke test suite for the EuroScale Phase 1 MVP. Validates every component of the pipeline: infrastructure, Kubernetes cluster, Vitess, API, backups, networking, monitoring, off-site backups, and CI/CD.

## Quick Start

```bash
# Prerequisites
export KUBECONFIG=/path/to/your/kubeconfig
export EUROSCALE_API_KEY="your-api-key"

# Run the smoke test
./scripts/smoke-test.sh
```

## Prerequisites

| Requirement | Purpose |
|---|---|
| `kubectl` | Kubernetes cluster interaction |
| `KUBECONFIG` env var | Points to the EuroScale K3s cluster |
| `jq` | JSON parsing for Terraform state / K8s output |
| `grpcurl` | gRPC API testing (optional; skipped if absent) |
| `terraform` | Terraform state validation (optional; skipped if absent) |
| `EUROSCALE_API_KEY` env var | API key for authenticated gRPC calls (optional) |

### Local Setup

```bash
# macOS
brew install kubectl jq grpcurl terraform

# Linux (Debian/Ubuntu)
sudo apt install -y jq
# kubectl, grpcurl, terraform — install from upstream binaries
```

### Retrieving the API Key

If the cluster is already provisioned and the API key secret exists:

```bash
kubectl get secret euroscale-api-key -n euroscale \
  -o jsonpath='{.data.api_key}' | base64 -d
```

## What Each Step Tests

### 1. Terraform Infrastructure (Task 1)
- Terraform CLI and state file availability  
- `main.tf`, `variables.tf`, `outputs.tf`, `firewall.tf` exist  
- Counts provisioned `hcloud_server` resources (expected: 3 nodes)

### 2. K3s Cluster + Addons (Task 2)
- Cluster connectivity via `kubectl cluster-info`  
- Node count (expected: ≥ 3)  
- All nodes in `Ready` state  
- `cert-manager` deployment  
- MinIO deployment (S3-compatible object storage)

### 3. Vitess Operator + Multi-Region Cluster (Task 3)
- Vitess Operator running in `vitess` namespace  
- `euroscale` namespace exists  
- `vtgate`, `vtctld` deployments  
- vttablet pods running (across Nuremberg + Helsinki cells)  
- `VitessCluster` CR `euroscale`  
- Keyspace `main` registered in vtctld

### 4. gRPC Provisioning API (Task 4)
- `euroscale-api` Deployment and Service  
- API pod readiness (expected: 2/2 replicas)  
- gRPC `ListDatabases` call via port-forward + `grpcurl`  
- Source code: `main.go`, `database.proto`, `Dockerfile`, `go.mod`

### 5. Vitess Native S3 Backups (Task 5)
- `vitess-backup-creds` Secret (MinIO credentials)  
- `VitessBackupSchedule` for full daily backups  
- `VitessBackupSchedule` for 15-min incremental PITR backups  
- `backup-config.yaml` source file

### 6. LoadBalancer + ExternalDNS (Task 6)
- `vtgate-lb` LoadBalancer Service  
- External IP assignment (Hetzner LB)  
- ExternalDNS deployment  
- `external-dns.yaml` and `vtgate-lb.yaml` source files

### 7. Prometheus + Grafana Monitoring (Task 7)
- `monitoring` namespace  
- Prometheus StatefulSet  
- Grafana Deployment  
- Alertmanager StatefulSet  
- `vitess-dashboard.json` Grafana dashboard

### 8. Off-Site Backups + Restore (Task 8)
- `rclone-sync` CronJob  
- `restore-test` CronJob  
- `rclone-sync-cronjob.yaml` and `restore-test-cronjob.yaml` source

### 9. CI/CD Pipeline (Task 9)
- `.github/workflows/deploy-api.yml` exists  
- Workflow contains build-and-deploy job, Docker build-push-action, kubectl set image, rollout status

### 10. Additional Verification
- All pods healthy (no CrashLoopBackOff, Error, ImagePullBackOff)  
- Total pod count across all namespaces  
- Namespace listing

## Expected Output

```
╔══════════════════════════════════════════════════════════════════╗
║          EuroScale — Phase 1 End-to-End Smoke Test              ║
╚══════════════════════════════════════════════════════════════════╝

── Pre-flight Checks ──
  PASS  kubectl is installed
  PASS  KUBECONFIG is set
  PASS  jq is installed

── 1. Terraform Infrastructure (Task 1) ──
  PASS  Terraform state is available
         Nodes provisioned: 3 (expected: 3)
  PASS  main.tf exists
  PASS  variables.tf exists
  PASS  outputs.tf exists
  PASS  firewall.tf exists

── 2. K3s Cluster + Addons (Task 2) ──
  PASS  Cluster is reachable (kubectl)
  INFO  Nodes in cluster: 3
  PASS  At least 3 nodes running
  PASS  All nodes are Ready
  PASS  cert-manager deployed
  PASS  MinIO deployed

── 3. Vitess Operator + Multi-Region Cluster (Task 3) ──
  PASS  Vitess Operator running
  PASS  Namespace 'euroscale' exists
  PASS  vtgate is running
  PASS  vtctld is running
  INFO  vttablet pods: 3
  PASS  vttablet pods running
  PASS  VitessCluster CR exists
  PASS  Keyspace 'main' exists

── 4. gRPC Provisioning API (Task 4) ──
  PASS  euroscale-api Deployment exists
  INFO  API ready replicas: 2/2
  PASS  API pods are ready
  PASS  euroscale-api Service exists
  PASS  gRPC ListDatabases responds
  ...

══════════════════════════════════════════════════════════════════
  Total:   45
  Passed:  42
  Failed:  0
  Skipped: 3
══════════════════════════════════════════════════════════════════

All smoke tests passed. EuroScale Phase 1 infrastructure is healthy.
```

## Running Before Provisioning

The script is designed to be partially useful even when the cluster isn't fully deployed. Steps that require cluster access are skipped gracefully with `SKIP` markers when:
- `KUBECONFIG` is not set or cluster is unreachable
- Specific namespaces or deployments don't exist yet
- Optional tools (`terraform`, `grpcurl`) are missing

Run it after each provisioning step to track progress.

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | All non-skipped checks passed |
| `1` | One or more `FAIL` checks |

Skipped checks do not cause failure. This lets you run the smoke test incrementally as infrastructure comes online.
