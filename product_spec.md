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

### Feature 3: Multi-Cloud HA Infrastructure — Our Cluster
**EuroScale runs on its own highly available Kubernetes cluster spanning multiple European cloud providers — you don't deploy anything.**
- **Single EuroScale-managed K8s cluster** connected to **Hetzner Cloud** (Germany/Finland), **OVHcloud** (France/Poland/UK), and **Exoscale** (Switzerland/Germany) simultaneously
- Cluster is **fully HA** — if a node, zone, or entire provider goes down, the cluster self-heals and workloads redistribute automatically
- All database instances run inside this cluster; customers never provision, manage, or touch Kubernetes
- Data never leaves EU borders — GDPR-compliant by architecture
- Credentials (connection strings, usernames, passwords) stored securely in **Kubernetes Secrets**, encrypted at rest

### Feature 4: Serverless Pricing Model
**Pay for what you use, not for allocated capacity.**
- Free tier: 1 database, 1GB storage, 100k read units/month
- Usage-based compute (per-second billing of compute credits)
- Zero-scale to zero cost when idle (like Neon's cold-start)
- Predictable pricing: ~€19/mo for production single-node, ~€99/mo for sharded cluster
- No surprise bills — usage caps and alerts built in

### Feature 5: PaaS Delivery — You Get a Connection String
**Customers never see Kubernetes. You sign up, get a database, and receive your credentials.**
- Simple API / CLI to provision databases: `euroscale db create <name>`
- **What you receive**: `mysql://<user>:<password>@<db>.euroscale.app:3306/<name>` (or Postgres equivalent)
- Credentials stored internally in **Kubernetes Secrets**, encrypted at rest
- Internal Grafana dashboard for **EuroScale's own observability** — cluster health, node status, query performance across all providers
- Auto-scaling, backups, failover — all handled by EuroScale's control plane, invisible to customers
- REST API for programmatic database management

---

## Tech Stack Recommendation

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Control Plane** | Go + Kubernetes Operator SDK | K8s-native, performant, cloud-agnostic (internal only) |
| **Database Engine - MySQL** | Vitess (v20+) | Proven at planet scale, branch support |
| **Database Engine - Postgres** | Citus + PgBouncer | Distributed Postgres, connection pooling |
| **Orchestration** | Kubernetes (k3s/kubeadm) — **EuroScale-managed** | Single multi-cloud HA cluster across Hetzner, OVH, Exoscale |
| **Infrastructure Layer** | Terraform / Crossplane (internal) | Programmatic provisioning of Hetzner/OVH/Exoscale resources |
| **Storage** | Rook/Ceph + provider-native volumes | Cost-performance trade-off per provider |
| **API Layer** | gRPC + Connect | Type-safe, performant API contracts |
| **Dashboard** | Next.js + Tailwind + React Query (customer-facing) + Grafana (internal observability) | Modern, fast, delightful developer UX + internal ops visibility |
| **Credential Store** | Kubernetes Secrets + encryption at rest | Secure storage of customer database credentials |
| **Auth** | OAuth 2.0 / OIDC (Keycloak) | EU-made IAM, SSO-ready |
| **Monitoring** | VictoriaMetrics + Grafana (internal) | EU-made (Russian-origin but independent), Prometheus-compatible |
| **Backups** | WAL-G + S3-compatible (Ceph/MinIO on EU infra) | Point-in-time recovery, encrypted |

## Core Differentiator

> **"The best of PlanetScale and Neon — fully European. Same database branching. Same horizontal scaling. Running on EuroScale's own HA Kubernetes cluster across Hetzner, OVH, and Exoscale. You get a connection string — nothing else to manage. Your data never leaves the EU."**

---

## Architecture Diagram (Conceptual)

```
┌──────────────────────────────────────────────────────────────────────┐
│                         CUSTOMER                                      │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │         You receive via API / CLI:                            │    │
│  │  mysql://<user>:<password>@ecommerce.euroscale.app:3306/db    │    │
│  │  postgres://<user>:<password>@analytics.euroscale.app:5432/db │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    EuroScale Control Plane (Managed)                     │
│  ┌─────────┐  ┌──────────┐  ┌────────┐  ┌───────────┐  ┌────────────┐ │
│  │ API     │  │ Dashboard│  │ Auth   │  │ Billing   │  │  Grafana   │ │
│  │ Gateway │  │ (Next.js)│  │ (KC)   │  │ (Stripe)  │  │ (Internal) │ │
│  └────┬────┘  └──────────┘  └────────┘  └───────────┘  └────────────┘ │
│       │                                                               │
│  ┌────▼──────────────────────────────────────────────────────────┐    │
│  │          EuroScale K8s Operator (Go) — Internal                │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌─────────────┐  │    │
│  │  │ Vitess   │ │ Citus    │ │ Backup/WAL-G │ │ Credential   │  │    │
│  │  │ Operator │ │ Operator │ │ Controller   │ │ Controller   │  │    │
│  │  └──────────┘ └──────────┘ └──────────────┘ └─────────────┘  │    │
│  └───────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│            EuroScale HA Kubernetes Cluster (Multi-Cloud)                 │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    Control Plane Nodes (HA × 3)                   │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │   │
│  │  │ etcd     │  │ API Svr  │  │ Scheduler│  │ Controller Mgr │  │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌──────────── Hetzner (DE) ────────┐ ┌────── OVHcloud (FR) ──────────┐ │
│  │  ┌──────┐ ┌──────┐ ┌──────┐     │ │  ┌──────┐ ┌──────┐ ┌──────┐   │ │
│  │  │Worker│ │Worker│ │Worker│     │ │  │Worker│ │Worker│ │Worker│   │ │
│  │  │Node 1│ │Node 2│ │Node 3│ ... │ │  │Node 1│ │Node 2│ │Node 3│...│ │
│  │  └──────┘ └──────┘ └──────┘     │ │  └──────┘ └──────┘ └──────┘   │ │
│  └──────────────────────────────────┘ └───────────────────────────────┘ │
│  ┌──────────────── Exoscale (CH) ────────────────────┐                  │
│  │  ┌──────┐ ┌──────┐ ┌──────┐                       │                  │
│  │  │Worker│ │Worker│ │Worker│  ...                   │                  │
│  │  │Node 1│ │Node 2│ │Node 3│                       │                  │
│  │  └──────┘ └──────┘ └──────┘                       │                  │
│  └────────────────────────────────────────────────────┘                  │
│                                                                         │
│  ┌──────────────── K8s Secrets ─────────────────┐                       │
│  │  Customer DB credentials (encrypted at rest) │                       │
│  └──────────────────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────────┘
```
