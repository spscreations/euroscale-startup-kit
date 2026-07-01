# 🇪🇺 EuroScale

**European PlanetScale Alternative — Serverless, Horizontally-Scalable Database Platform**

EuroScale is a fully-managed PaaS for MySQL (via Vitess) running on European cloud infrastructure. European data, European company, European pricing — no US hyperscaler dependency.

> **"The best of PlanetScale — fully European. Same database branching. Same horizontal scaling. Running on our own HA Kubernetes cluster across Hetzner. You get a connection string — nothing else to manage. Your data never leaves the EU."**

---

## Phase 1 MVP — Completion Status

| # | Task | Component | Status |
|---|---|---|---|
| 1 | Terraform | 3× Hetzner CAX21 nodes (2 Nbg + 1 Hel) with volumes | ✅ Complete |
| 2 | K3s Cluster | cert-manager + MinIO S3-compatible storage | ✅ Complete |
| 3 | Vitess | Vitess Operator + multi-region cluster (main keyspace, 2 cells) | ✅ Complete |
| 4 | API | gRPC provisioning API in Go (CreateDatabase, DeleteDatabase, ListDatabases, RotateCredentials) | ✅ Complete |
| 5 | Backups | Vitess native S3 backups to MinIO (daily full + 15-min PITR incremental) | ✅ Complete |
| 6 | Networking | vtgate LoadBalancer + ExternalDNS for public access | ✅ Complete |
| 7 | Monitoring | Prometheus + Grafana (kube-prometheus-stack) with Vitess dashboards | ✅ Complete |
| 8 | Off-Site | rclone sync CronJob + restore-test CronJob with retention policy | ✅ Complete |
| 9 | CI/CD | GitHub Actions — Docker build, push to GHCR, kubectl deploy | ✅ Complete |
| 10 | Verification | Smoke test script + documentation | ✅ Complete |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         CUSTOMER                                     │
│                                                                      │
│  mysql://user:***@db.euroscale.app:3306/dbname                       │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    EuroScale Control Plane (K3s)                        │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────────────────┐ │
│  │ gRPC    │  │ Vitess   │  │ MinIO    │  │ Prometheus + Grafana    │ │
│  │ API     │  │ Operator │  │ (S3)     │  │ (Monitoring)            │ │
│  └─────────┘  └──────────┘  └──────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│            Hetzner Cloud Infrastructure (3× CAX21 ARM)                   │
│                                                                         │
│  ┌────── Nuremberg ──────┐  ┌────── Helsinki ──────┐                   │
│  │  euroscale-cp-1 (CP)  │  │  euroscale-wk-2      │                   │
│  │  euroscale-wk-1       │  │  (Read Replica)      │                   │
│  │  (Primary + Replica)  │  │                       │                   │
│  └───────────────────────┘  └───────────────────────┘                   │
│                                                                         │
│  3 nodes × CAX21 (4 vCPU ARM, 8 GB RAM) — €10.49/mo each              │
│  50 GB SSD per node × 3 — €3.00/mo each                                │
│  Total: ~€40.47/mo                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
euroscale_startup_kit/
├── api/                          # gRPC provisioning API (Go)
│   ├── cmd/server/main.go       # Server entrypoint + gRPC handlers
│   ├── internal/
│   │   ├── auth/auth.go         # API key auth interceptor
│   │   ├── models/models.go     # Domain models
│   │   ├── secrets/secrets.go   # K8s Secret credential store
│   │   └── vitess/vitess.go     # Vitess vtgate client
│   ├── proto/euroscale/v1/      # Protobuf service definitions
│   ├── deploy/tls-certs.yaml    # TLS certs for Vitess connections
│   ├── Dockerfile               # Multi-stage build (Go → Alpine)
│   └── go.mod
├── deploy/                       # Kubernetes manifests
│   ├── api-deployment.yaml      # EuroScale API Deployment (2 replicas)
│   ├── api-service.yaml         # ClusterIP Service
│   ├── api-rbac.yaml            # ServiceAccount + Role + RoleBinding
│   ├── api-pdb.yaml             # PodDisruptionBudget (maxUnavailable: 1)
│   ├── euroscale-config.yaml    # ConfigMap (host, SSL certs, etc.)
│   └── create-api-key.sh        # API key secret creation/rotation
├── infra/
│   ├── terraform/hetzner/       # Terraform: Hetzner CAX21 nodes
│   │   ├── main.tf              # Server + volume resources
│   │   ├── firewall.tf          # Network firewall rules
│   │   ├── variables.tf         # Input variables
│   │   ├── outputs.tf           # Output values
│   │   └── cost-analysis.md     # Monthly cost breakdown
│   ├── k3s/                     # K3s cluster bootstrap
│   │   ├── install.sh           # 3-node cluster installer
│   │   ├── deploy-addons.sh     # cert-manager + MinIO
│   │   └── etcd-encryption-config.yaml
│   ├── vitess/                  # Vitess Operator configuration
│   │   ├── vitess-cluster.yaml  # VitessCluster CR (multi-region)
│   │   ├── backup-config.yaml   # Backup schedules
│   │   ├── vitess-backup-creds.yaml  # MinIO backup credentials
│   │   ├── deploy.sh            # Vitess Operator install
│   │   └── backup-test.sh       # Manual backup trigger + verify
│   ├── networking/              # LoadBalancer + ExternalDNS
│   │   ├── vtgate-lb.yaml       # vtgate LoadBalancer service
│   │   ├── external-dns.yaml    # ExternalDNS Deployment
│   │   └── apply.sh
│   ├── backups/                 # Off-site backup cronjobs
│   │   ├── rclone-sync-cronjob.yaml
│   │   ├── restore-test-cronjob.yaml
│   │   └── etcd-snapshot-config.md
│   └── monitoring/              # Prometheus + Grafana
│       ├── deploy.sh            # kube-prometheus-stack with persistence
│       └── vitess-dashboard.json
├── scripts/                     # Verification & tooling
│   ├── smoke-test.sh            # Full end-to-end smoke test
│   └── README.md                # Smoke test documentation
├── .github/workflows/
│   └── deploy-api.yml           # CI/CD: build → push → deploy
├── product_spec.md              # Full product specification
├── business_model.md            # Business model canvas
├── product_roadmap.md           # Post-MVP roadmap
├── market_analysis.md           # Competitive landscape
├── competitor_map.md            # Competitor comparison matrix
├── investor_pitch.md            # Investor pitch deck content
└── pitch_deck.md                # Pitch deck outline
```

---

## Quick Start

### 1. Provision Infrastructure

```bash
cd infra/terraform/hetzner
export HCLOUD_TOKEN="your-hetzner-api-token"
terraform init
terraform plan
terraform apply
```

### 2. Install K3s Cluster

```bash
cd infra/k3s
export CP_IP=<control-plane-ip>
export WK1_IP=<worker-1-ip>
export WK2_IP=<worker-2-ip>
./install.sh
export KUBECONFIG=$(pwd)/kubeconfig
```

### 3. Deploy Addons + Vitess

```bash
./deploy-addons.sh
cd ../vitess && ./deploy.sh
```

### 4. Deploy the API

```bash
cd ../../deploy
./create-api-key.sh
kubectl apply -f api-rbac.yaml
kubectl apply -f euroscale-config.yaml
kubectl apply -f api/service.yaml
kubectl apply -f api/deployment.yaml
```

### 5. Deploy Monitoring

```bash
cd ../infra/monitoring
./deploy.sh
```

### 6. Run Smoke Tests

```bash
cd ../..
export EUROSCALE_API_KEY=$(kubectl get secret euroscale-api-key -n euroscale -o jsonpath='{.data.api_key}' | base64 -d)
./scripts/smoke-test.sh
```

---

## Component Versions

| Component | Version |
|---|---|
| Vitess | v20.0.0 |
| Vitess Operator | planetscale/vitess-operator |
| K3s | v1.30.2+k3s2 |
| Go (API) | 1.22+ |
| Prometheus Stack | kube-prometheus-stack (Helm) |
| cert-manager | latest |
| MinIO | latest (via Helm) |
| Etcd | v3.5 (built into K3s) |

---

## Pricing (Hetzner Cloud, June 2026)

| Resource | Count | Monthly |
|---|---|---|
| CAX21 (4 vCPU, 8 GB) | 3 | €31.47 |
| 50 GB SSD Volume | 3 | €9.00 |
| **Total** | | **~€40.47/mo** |

See `infra/terraform/hetzner/cost-analysis.md` for full breakdown.

---

## License

Proprietary — all rights reserved.
