# EuroScale — Pitch Deck

---

## Slide 1: Problem

**European developers face an impossible choice.**

| Use US DBaaS (PlanetScale, Neon, RDS) | Use EU infrastructure alone |
|----------------------------------------|------------------------------|
| ❌ Data exits EU jurisdiction | ✅ GDPR compliant |
| ❌ 3–5× more expensive | ✅ 60–80% cost savings |
| ❌ FX risk, US pricing | ✅ Euro pricing |
| ❌ Subject to CLOUD Act | ✅ EU-controlled |
| ✅ Fully managed, serverless | ❌ 10–20 hrs/mo on DB ops |
| ✅ Branching, auto-scale | ❌ No branching, manual scaling |
| ✅ Developer delight | ❌ Operational burden |

> **There is no European PlanetScale. We built it.**

---

## Slide 2: Solution

**EuroScale — Serverless, scalable DBaaS on European clouds.**

| Capability | What it means |
|------------|---------------|
| 🪄 **Database Branching** | Instant prod clones for dev/CI |
| 📈 **Horizontal Auto-Scale** | Vitess (MySQL) + Citus (Postgres) |
| 🇪🇺 **Multi-Cloud HA Cluster** | Single K8s cluster across Hetzner + OVH + Exoscale — self-healing |
| 🛡️ **GDPR by Architecture** | Data never leaves the EU |
| 💶 **European Pricing** | 3–5× cheaper than US equivalents |
| 🔌 **Just a Connection String** | `mysql://user:pass@db.euroscale.app` — nothing else to manage |

> **PlanetScale's features × European HA infrastructure ÷ zero ops = EuroScale**

---

## Slide 3: Market

**A generational tailwind for European cloud.**

| Market | Size (2025) | Growth | Source |
|--------|-------------|--------|--------|
| 🇪🇺 EU Cloud Computing | $173.6B | 17.4% CAGR | GM Insights |
| 🛡️ Sovereign Cloud | $154.7B | 27% CAGR | Fortune BI |
| 🗄️ DBaaS (European share) | ~$21–26B | 25%+ CAGR | Derived |
| 🎯 EuroScale SOM (Y3) | **$120M+** | — | Internal model |

**Key tailwinds:**
- EU Data Act + GDPR enforcement intensifying
- AWS European Sovereign Cloud validates the demand — but it's still AWS
- PlanetScale removed free tier, creating a developer exodus
- European startups want EU suppliers (VCs, governments pushing)

---

## Slide 4: Business Model

**Developer-led PLG on a European cost base.**

```
Free Tier → Scale (€29/mo) → Team (€99/mo) → Business (€399/mo) → Enterprise (Custom)
```

| Metric | Value |
|--------|-------|
| **ARPU** | €75/mo blended |
| **Gross Margin** | 63–84% |
| **LTV:CAC** | 4×–19× |
| **Payback** | 5–11 months |

**Why margins are exceptional:**
- Hetzner/OVH infrastructure costs **60–80% less** than AWS
- Same open-source DB engines (Vitess, Citus, Postgres)
- No cloud repatriation costs — built EU-native

> **$500K seed → €2M ARR in 18 months with 70%+ gross margins.**

---

## Slide 5: The Ask

**We are raising €2.5M seed to capture the European DBaaS gap.**

### Use of Funds

| Allocation | % | Amount |
|------------|---|--------|
| Engineering (control plane, operators, dashboard) | 50% | €1.25M |
| Cloud infrastructure (Hetzner/OVH credits + initial ops) | 20% | €500K |
| Go-to-market (developer relations, content, community) | 15% | €375K |
| Compliance & legal (GDPR, Gaia-X certification) | 10% | €250K |
| Operations (tooling, monitoring, hiring) | 5% | €125K |

### Key Milestones

| Month | Milestone |
|-------|----------|
| M3 | Private alpha — branching MySQL on Hetzner |
| M6 | Public beta — self-serve signup, free tier live |
| M9 | Postgres (Citus) GA, multi-cloud (Hetzner + OVH) |
| M12 | 500 paying customers, €500K ARR, Team tier live |
| M18 | €2M ARR, Enterprise tier, Series A ready |

### Target Investors
- European deep-tech VCs (LocalGlobe, Northzone, Index Ventures, Creandum)
- Infrastructure-focused funds (Felix Capital, Atomico)
- Strategic angels from PlanetScale, Neon, Aiven, Grafana Labs

---

> **"The database layer of European sovereignty."**
