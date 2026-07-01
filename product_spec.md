# EuroScale — Product Specification

## Problem Statement

European startups and enterprises face an impossible choice:
- Use US hyperscaler DBaaS (AWS RDS, PlanetScale, Neon) and sacrifice **GDPR compliance, data sovereignty, and cost control**
- Use bare European infrastructure (Hetzner, OVH) and spend **10–20 hours/month on database ops** they shouldn't need to do
- There is **no European PlanetScale** — no serverless, horizontally-scalable, branchable database platform running on European clouds

## Solution

**EuroScale** — a serverless, horizontally-scalable database platform (MySQL + PostgreSQL) running on European cloud infrastructure, delivered as a fully-managed PaaS. European data, European company, European pricing.

---

## Core MVP Features (5 maximum)

### Feature 1: Database Branching for Development
**The PlanetScale killer feature, European-hosted.**
- Instant database branches from production snapshots (writeable clones)
- Branch-per-developer, branch-per-PR, branch-per-CI-run
- Schema change management with diff preview and deploy-on-merge
- Automatic branch cleanup after merge

### Feature 2: Horizontal Auto-Scaling (Vitess + Citus)
**Scale beyond single-node without operational complexity.**
- MySQL via **Vitess** (proven at YouTube/GitHub scale)
- PostgreSQL via **Citus** (distributed Postgres, proven at Microsoft)
- Automatic read-replica scaling based on query load
- No-sharding-required for 90% of workloads — only shards when you cross 100GB+
- Connection pooling and query routing built in

### Feature 3: Multi-Cloud EU Infrastructure
**Runs on the best European clouds, not US hyperscalers.**
- Deploy on **Hetzner Cloud** (Germany/Finland), **OVHcloud** (France/Poland/UK), **Exoscale** (Switzerland/Germany)
- Single control plane across all providers
- Automatic failover across availability zones and providers
- Data never leaves EU borders — GDPR-compliant by architecture

### Feature 4: Serverless Pricing Model
**Pay for what you use, not for allocated capacity.**
- Free tier: 1 database, 1GB storage, 100k read units/month
- Usage-based compute (per-second billing of compute credits)
- Zero-scale to zero cost when idle (like Neon's cold-start)
- Predictable pricing: ~€19/mo for production single-node, ~€99/mo for sharded cluster
- No surprise bills — usage caps and alerts built in

### Feature 5: Kubernetes-Native Control Plane
**Built for modern DevOps, GitOps, and platform teams.**
- EuroScale Kubernetes Operator (CRD-based)
- `kubectl`-native database provisioning
- GitOps integration with ArgoCD/Flux
- REST API + Terraform Provider + Pulumi provider
- Prometheus metrics, Grafana dashboards, OpenTelemetry tracing

---

## Tech Stack Recommendation

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Control Plane** | Go + Kubernetes Operator SDK | K8s-native, performant, cloud-agnostic |
| **Database Engine - MySQL** | Vitess (v20+) | Proven at planet scale, branch support |
| **Database Engine - Postgres** | Citus + PgBouncer | Distributed Postgres, connection pooling |
| **Orchestration** | Kubernetes (k3s/kubeadm) | Multi-cloud, self-healing, operator pattern |
| **Infrastructure Layer** | Terraform / Crossplane | Provision Hetzner/OVH resources programmatically |
| **Storage** | Rook/Ceph (on-block-storage) vs provider-native volumes | Cost-performance trade-off per provider |
| **API Layer** | gRPC + Connect | Type-safe, performant API contracts |
| **Dashboard** | Next.js + Tailwind + React Query | Modern, fast, delightful developer UX |
| **Auth** | OAuth 2.0 / OIDC (Keycloak) | EU-made IAM, SSO-ready |
| **Monitoring** | VictoriaMetrics + Grafana | EU-made (Russian-origin but independent), Prometheus-compatible |
| **CI/CD** | GitLab CI / GitHub Actions | Developer familiarity |
| **Backups** | WAL-G + S3-compatible (Ceph/MinIO on EU infra) | Point-in-time recovery, encrypted |

## Core Differentiator

> **"The best of PlanetScale and Neon — fully European. Same database branching. Same horizontal scaling. Running on Hetzner and OVH for a fraction of AWS cost. Your data never leaves the EU."**

---

## Architecture Diagram (Conceptual)

```
┌─────────────────────────────────────────────────────────┐
│                    EuroScale Control Plane               │
│  ┌─────────┐  ┌──────────┐  ┌────────┐  ┌───────────┐  │
│  │ API     │  │ Dashboard│  │ Auth   │  │ Billing   │  │
│  │ Gateway │  │ (Next.js)│  │ (KC)   │  │ (Stripe)  │  │
│  └────┬────┘  └──────────┘  └────────┘  └───────────┘  │
│       │                                                  │
│  ┌────▼──────────────────────────────────────────────┐   │
│  │          EuroScale K8s Operator (Go)               │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │   │
│  │  │ Vitess   │ │ Citus    │ │ Backup/Snapshot  │   │   │
│  │  │ Operator │ │ Operator │ │ Controller       │   │   │
│  │  └──────────┘ └──────────┘ └──────────────────┘   │   │
│  └──────────────┬─────────────────────────────────────┘   │
└─────────────────┼─────────────────────────────────────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
┌───▼────┐  ┌────▼───┐  ┌─────▼───┐
│Hetzner  │  │OVHcloud │  │Exoscale │
│K8s      │  │K8s      │  │K8s      │
│Cluster  │  │Cluster  │  │Cluster  │
│ ┌────┐  │  │ ┌────┐  │  │ ┌────┐  │
│ │VT  │  │  │ │VT  │  │  │ │VT  │  │
│ │Keysp│  │  │ │Keysp│  │  │ │Keysp│  │
│ └────┘  │  │ └────┘  │  │ └────┘  │
│ ┌────┐  │  │ ┌────┐  │  │ ┌────┐  │
│ │Citus│  │  │ │Citus│  │  │ │Citus│  │
│ └────┘  │  │ └────┘  │  │ └────┘  │
└────────┘  └─────────┘  └──────────┘
```
