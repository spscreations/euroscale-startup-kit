# EuroScale — Product Roadmap

---

## Phase 1: Months 1–3 — MVP & Initial Launch

**Theme: Branching MySQL on Hetzner — prove the core concept**

### 🔷 Month 1: Foundation
| Milestone | Details |
|-----------|---------|
| K8s Operator Skeleton | Vitess operator with Hetzner Cloud Provider integration |
| Hetzner Cluster Automation | Terraform module to provision Hetzner K8s cluster (k3s) |
| Database Provisioning API | gRPC API to create/destroy Vitess keyspaces |
| CI/CD Pipeline | GitLab CI, staging/QA environment on Hetzner |

### 🔷 Month 2: Branching
| Milestone | Details |
|-----------|---------|
| Database Branching v1 | Clone Vitess keyspace from snapshot — branch per dev |
| Schema Diff Engine | Visual diff of schema changes between branches |
| Branch Merge Workflow | Deploy-on-merge: merge branch → promote to prod |
| CLI Tool (euroctl) | `euroctl branch create`, `euroctl branch list` |

### 🔷 Month 3: Alpha Launch
| Milestone | Details |
|-----------|---------|
| Private Alpha | 50 beta users (invite-only, free) |
| Dashboard v1 | Next.js dashboard: DB list, branches, query stats |
| Free Tier Deployed | 1 DB, 1GB, 100k read units/mo |
| User Feedback Loop | Weekly user calls, prioritized feature requests |

> **✅ Gate: 50 alpha users, <5 min time-to-first-DB, positive NPS**

---

## Phase 2: Months 4–6 — Feedback Loop & Growth

**Theme: Ship the missing pieces, onboard early adopters**

### 🔷 Month 4: PostgreSQL Support
| Milestone | Details |
|-----------|---------|
| Citus Operator | Distributed Postgres via Citus, managed by EuroScale operator |
| PgBouncer Integration | Connection pooling for Postgres workloads |
| Postgres Branching | Snapshot-based branching (WAL-G) |
| Multi-Engine Dashboard | Single dashboard for MySQL (Vitess) + Postgres (Citus) |

### 🔷 Month 5: OVHcloud + Multi-Cloud
| Milestone | Details |
|-----------|---------|
| OVH Managed K8s Integration | EuroScale operator deploys to OVH K8s |
| Cross-Provider Orchestration | Single control plane manages Hetzner + OVH clusters |
| Automatic Failover | Active-passive across providers |
| Data Residency Controls | Choose DB location: Germany (Hetzner), France (OVH), Switzerland (Exoscale) |

### 🔷 Month 6: Public Beta
| Milestone | Details |
|-----------|---------|
| **Public Beta Launch** | Self-serve signup on euroscale.dev |
| Scale Tier (€29/mo) | 3 DBs, 10GB, branching, auto-backup |
| Team Tier (€99/mo) | 10 DBs, HA cluster, SSO |
| Documentation Site | Full docs, quickstart guides, API reference |
| Terraform Provider | `euroscale_database`, `euroscale_branch` resources |

> **✅ Gate: 200 paying users, <3% monthly churn, gross margin >50%**

---

## Phase 3: Months 7–12 — Scaling & Monetization

**Theme: Enterprise readiness, ecosystem growth, prepare for Series A**

### 🔷 Months 7–8: Enterprise Features
| Milestone | Details |
|-----------|---------|
| Backup & PITR | Point-in-time recovery, WAL-G backups to EU S3 (Ceph/MinIO) |
| Audit Logging | Full audit trail for SOC 2 / GDPR compliance |
| VPC Peering | Direct private network access to databases |
| IP Whitelisting + TLS | Security controls for enterprise deployment |

### 🔷 Months 9–10: Advanced Scaling
| Milestone | Details |
|-----------|---------|
| Multi-Region Replication | Active-active across EU regions |
| Auto-Sharding Intelligence | Automatic shard rebalancing at 80% capacity threshold |
| Read Replicas on Spot | Lower-cost read replicas on Hetzner spot instances |
| Query Performance Insights | Slow query analysis, index recommendations |

### 🔷 Months 11–12: Ecosystem & Growth
| Milestone | Details |
|-----------|---------|
| Business Tier (€399/mo) | Unlimited DBs, sharded, multi-cloud HA |
| GitHub Actions + GitLab Plugin | Branch-per-PR CI integration |
| VSCode Extension | Browse branches, run queries from IDE |
| **Gaia-X Certification** | Formal sovereign cloud certification |
| Community Program | Open-source Vitess/Citus operators, contributor program |
| **Series A Fundraising Target** | €2M ARR, 500+ paying customers, 70%+ gross margin |

---

## Year 2 Vision

| Quarter | Focus |
|---------|-------|
| Q1–Q2 | Enterprise sales team, SOC 2 Type II, AWS European Sovereign Cloud migration targets |
| Q3–Q4 | Exoscale + IONOS integration, EU-government procurement, 10,000+ databases under management |

## Year 3 Vision

- **€10M+ ARR**
- 500+ enterprise customers
- 7+ EU cloud providers integrated
- Edge database (Turso-style SQLite) on EuroScale control plane
- Fully Gaia-X certified sovereign database platform
