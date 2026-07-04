# EuroScale — Business Model

## Revenue Streams

### 1. Database-as-a-Service (Core — 75% of revenue)
**Usage-based pricing with predictable tiers.**

| Tier | Price | Databases | Storage | Compute | Features |
|------|-------|-----------|---------|---------|----------|
| **Free** | €0 | 1 DB | 1 GB | 100k read units/mo | Single-node, community support |
| **Scale** | €29/mo | 3 DBs | 10 GB | 1M read + 500k write units | Single-node, branching, auto-backup |
| **Team** | €99/mo | 10 DBs | 50 GB | 10M read + 5M write units | 3-node HA cluster, branching, PITR, SSO |
| **Business** | €399/mo | Unlimited | 250 GB | Burstable compute | Multi-cloud HA, sharding (Vitess/Citus), audit logs |
| **Enterprise** | Custom | Unlimited | Unlimited | Unlimited | Dedicated clusters, on-prem option, SLA 99.99%, support SLAs |

### Add-ons (all tiers)
| Add-on | Price | Details |
|--------|-------|---------|
| **Additional storage** | €0.20/GB/mo | Per-GB over plan limit, billed daily. Sourced from Hetzner block storage (3–5× cheaper than AWS EBS). |
| **Autoscale compute** | €0.04/CU-hr | Burstable compute units (1–4 CU per DB). Automatically scales up under load, scales to zero when idle. Pay per second above baseline. |
| **Cross-region replication** | +30% of base plan | Active replica in another EU region (e.g. Nuremberg → Helsinki) |
| **Multi-cloud HA** | +50% of base plan | Active-active across Hetzner + OVH + Exoscale |

### 2. Multi-Cloud Add-on (10% of revenue)
- Cross-region replication: +30% of base plan
- Multi-cloud active-active: +50% of base plan (Hetzner + OVH + Exoscale)
- Custom data residency (choose specific EU countries): custom pricing

### 3. Support & Consulting (10% of revenue)
- Standard support: Included in Team+
- Premium support (30-min response): €500/mo
- Database migration service (one-time): €2,000–€10,000
- Vitess/Citus sharding consulting: €500/day

### 4. Marketplace & Extras (5% of revenue)
- Add-on extensions: monitoring packs, custom backup schedules, encryption key management
- Partner integrations: GitHub Actions, GitLab CI plugins, Terraform modules

---

## Unit Economics

| Metric | Value | Notes |
|--------|-------|-------|
| **Avg Revenue Per User (ARPU)** | €75/mo | Blended across tiers |
| **Cost to Serve (per DB)** | €12–€28/mo | Hetzner/OVH infra is 3–5× cheaper than AWS |
| **Gross Margin** | 63–84% | Depends on tier (higher margins on Enterprise) |
| **Customer Acquisition Cost (CAC)** | €400–€800 | Self-serve PLG reduces CAC |
| **LTV** | €3,000–€15,000 | Average retention 3+ years |
| **LTV:CAC Ratio** | 4×–19× | Strong unit economics |
| **Payback Period** | 5–11 months | Self-serve fast payback |

### Cost Advantage vs US Competitors

| Resource | Hetzner | AWS | Savings |
|----------|---------|-----|---------|
| 4 vCPU / 8 GB RAM | ~€13/mo | ~€50/mo (db.t3.medium) | **74%** |
| 8 vCPU / 16 GB RAM | ~€26/mo | ~€100/mo | **74%** |
| 1 TB SSD Block Storage | ~€57/mo | ~€120/mo (gp3) | **52%** |
| 1 TB S3-compatible Storage | ~€7/mo | ~€23/mo | **70%** |

> EuroScale's core infrastructure cost is **3–5× lower** than AWS-based competitors (PlanetScale, Neon), enabling better margins at lower prices. All databases run on EuroScale's own multi-cloud HA Kubernetes cluster — customers never provision infrastructure.

---

## Growth Loops

### Primary: Developer-Led PLG (Product-Led Growth)
```
Free tier → Developer tries → Loves branching → Tells team → 
Team signs up → Organically grows → Company upgrades → Enterprise sale
```

### Secondary: Open Source Community
- Open-source Vitess/Citus operators
- Terraform provider, GitHub Action, VSCode extension
- Community contributions → brand awareness → organic signups
- Meetups, conferences (KubeCon EU, FOSDEM, DevOpsDays)

### Tertiary: EU Regulation Tailwind
- GDPR compliance requirements force migration from US DBaaS
- EU data sovereignty mandates in government procurement
- Gaia-X certification as competitive moat

---

## Top 3 KPIs to Track (Year 1)

| KPI | Target | Why |
|-----|--------|-----|
| **Free → Paid Conversion** | ≥5% within 60 days | Indicates product-market fit and value demonstration |
| **Monthly Churn Rate** | <3% | Database services are sticky — high churn = product issue |
| **Gross Margin** | >60% by Month 9 | Validates the Hetzner/OVH cost advantage thesis |

### Secondary KPIs
- **NPS**: >40 (developer satisfaction)
- **Time to First Branch**: <30 seconds (core UX metric)
- **Databases per Customer**: growing (platform stickiness)
- **Regions Active**: 3+ by Month 6 (multi-cloud promise)

---

## Pricing Philosophy

> **"European pricing for European companies."**

- Prices in EUR — no FX uncertainty
- No hidden data egress fees (unlike AWS)
- Transparent usage dashboard with cost forecasting
- Free tier designed to be genuinely useful (not crippled)
- Annual commitment discount: 20% off
- Educational/non-profit discount: 40% off
