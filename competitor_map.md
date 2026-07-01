# EuroScale — Competitor Map

## Overview

We are positioned at the intersection of **serverless database platforms** (PlanetScale, Neon, Supabase) and **European infrastructure** (Hetzner, OVH). No existing player truly occupies both spaces simultaneously.

---

## Direct Competitors

### 1. PlanetScale
| Field | Detail |
|-------|--------|
| **URL** | https://planetscale.com |
| **Type** | Serverless MySQL (Vitess) + Postgres |
| **Pricing** | Free tier up to 1GB; Scaler Pro $39/mo; Enterprise custom |
| **Funding** | $105M raised, est. $3.9M ARR (2024) |
| **Strengths** | Database branching, schema diff engine, Vitess at scale, developer UX |
| **Weaknesses** | US-based (not GDPR-native), removed free hobby tier, MySQL-only as primary, expensive at scale |
| **Gap for EuroScale** | **No EU data residency. European teams pay $FX premium. Removed free tier alienated dev community** |

### 2. Neon
| Field | Detail |
|-------|--------|
| **URL** | https://neon.com |
| **Type** | Serverless PostgreSQL |
| **Pricing** | Free (10GB); Launch $19/mo; Scale $69/mo + usage |
| **Funding** | Acquired by Databricks ~$1B (2025) |
| **Strengths** | Branching (merged from original Neón), cold-start near-zero, excellent Postgres compatibility, serverless compute |
| **Weaknesses** | US-based (California), Databricks-owned (enterprise roadmap may shift), single-region, no MySQL support |
| **Gap for EuroScale** | **No EU sovereignty. Postgres-only. Databricks ownership creates enterprise-bias risk** |

### 3. Supabase
| Field | Detail |
|-------|--------|
| **URL** | https://supabase.com |
| **Type** | Open-source Firebase alternative (Postgres-based) |
| **Pricing** | Free (500MB); Pro $25/mo; Team $599/mo; Enterprise custom |
| **Funding** | $116M raised |
| **Strengths** | Open-source, strong community, real-time subscriptions, storage, auth in one product |
| **Weaknesses** | Not horizontally scalable, US-based, broad platform (not pure DBaaS), fewer enterprise features |
| **Gap for EuroScale** | **Horizontal scaling (Vitess/Citus). EU data residency. Specialized DBaaS focus** |

### 4. Turso (by ChiselStrike)
| Field | Detail |
|-------|--------|
| **URL** | https://turso.tech |
| **Type** | Edge SQLite database (libsql) |
| **Pricing** | Free (9GB); Pro $39/mo; Enterprise custom |
| **Funding** | Undisclosed seed, built on Fly.io edge |
| **Strengths** | Insanely fast edge reads, multi-region replication, embedded SQLite compatibility |
| **Weaknesses** | SQLite (no MySQL/Postgres), outlier for traditional DB workloads, US-based (Fly.io infra) |
| **Gap for EuroScale** | **Full MySQL + Postgres compatibility. European infra. Traditional RDBMS workloads** |

### 5. Clever Cloud
| Field | Detail |
|-------|--------|
| **URL** | https://clever-cloud.com |
| **Type** | European PaaS with managed databases (French company) |
| **Pricing** | Pay-as-you-go, ~€15–200/mo per app + DB |
| **Funding** | Bootstrapped/Series A |
| **Strengths** | French/European sovereign hosting, multi-language support, GDPR-native |
| **Weaknesses** | Limited scalability, no Vitess/Citus-level sharding, less developer-friendly UX vs PlanetScale, smaller ecosystem |
| **Gap for EuroScale** | **No serverless branching. No horizontal scaling. API/UX not on PlanetScale level** |

---

## Indirect Competitors

| Competitor | Type | Why Not a Direct Threat |
|------------|------|------------------------|
| **AWS RDS/Aurora** | Managed DB on AWS | US-based, expensive, vendor lock-in, not GDPR-sovereign |
| **Aiven** | Managed OSS DB on any cloud | US-based (Finland roots, now US entity), BYOC model competes but no serverless |
| **DigitalOcean Managed DB** | Simple managed DB | US-based, limited to single-node, no branching, no European data centers |
| **ScaleGrid** | Managed DB hosting | US-based, older UX, no serverless |
| **Exoscale DBaaS** | European managed DB | Swiss-based, very limited DB options, no serverless branching |

---

## EuroScale Competitive Positioning Map

```
                    High Scalability
                         │
                    PlanetScale ●
                         │
              Turso ●    │
                         │
           Neon ●        │
                         │
    Supabase ●           │
                         │
  Clever Cloud ●         │
                         │
                     ★ EuroScale
                         │
  ───────────────────────┼─────────────────────
                         │     EU Sovereignty
   US Sovereignty        │
                         │
           AWS RDS ●     │
                         │
   DigitalOcean ●        │
                         │
         Aiven ●         │
                         │
                    Low Scalability
```

## EuroScale's Unfair Advantage

1. **True EU sovereignty** — not an AWS subsidiary labeled "sovereign." Independent European company, all data in EU data centers, Gaia-X aligned.
2. **Multi-cloud on cheap European infra** — runs on Hetzner AND OVH AND Exoscale simultaneously via K8s. 3–5× cheaper than AWS RDS.
3. **Vitess + Citus at serverless pricing** — horizontal MySQL AND Postgres scaling, not just single-node.
4. **Database branching** — dev/CI environments from production data in seconds, matching PlanetScale's killer feature.
5. **Kubernetes-native** — operators, CRDs, GitOps-flavored. Works with existing European K8s investments.
