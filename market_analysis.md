# EuroScale — Market Analysis

## Executive Summary

**EuroScale** is a European PlanetScale-style PaaS: a serverless, scalable database platform (MySQL via Vitess + PostgreSQL) deployed on European cloud infrastructure (Hetzner, OVHcloud) with multi-cloud Kubernetes orchestration. It addresses the growing demand for EU-sovereign, GDPR-compliant alternatives to US hyperscaler database services.

---

## Total Addressable Market (TAM)

| Metric | Value | Source |
|--------|-------|--------|
| Europe Cloud Computing Market (2025) | **$173.6B** | GM Insights |
| Projected (2035) | **$550B+** | CAGR 17.4% |
| Sovereign Cloud Market (2025) | **$154.7B** | Fortune Business Insights |
| Projected Sovereign Cloud (2032) | **$824B** | 27% CAGR |
| DBaaS market as % of Cloud | ~12–15% | Industry estimate |
| European DBaaS TAM (2025) | **~$21–26B** | Derived estimate |

### SAM (Serviceable Addressable Market)
EU-based startups, SMBs, and mid-market companies that:
- Need GDPR-compliant database hosting
- Want serverless/auto-scaling database capabilities
- Are currently overpaying for AWS RDS/Aurora or Azure SQL
- Prefer European providers for data sovereignty
- Use MySQL or PostgreSQL as their primary database

**SAM estimate: ~$4.5B** (European businesses actively seeking sovereign alternatives to US DBaaS)

### SOM (Serviceable Obtainable Market)
Realistic 3-year capture targeting:
- European SaaS startups (2,000+ companies)
- EU government-adjacent digital services
- Privacy-conscious e-commerce and fintech
- Currently ~$120M (0.5% of DBaaS TAM Year 1, scaling to 2% by Year 3)

---

## Market Trends

### 1. The Sovereign Cloud Megatrend
- **$154.7B sovereign cloud market in 2025**, growing at 27% CAGR to $824B by 2032
- AWS investing **€7.8B** in its European Sovereign Cloud (Germany region launching late 2025)
- Gaia-X framework driving EU-wide interoperability standards for sovereign infrastructure
- EU Cloud Sovereignty Framework published, defining specific compliance requirements

### 2. European Cloud Share Bottoming Out
- European providers held steady at **15% local market share** in 2024 (Synergy Research)
- **US hyperscalers (AWS 32%, Azure, GCP) dominate 85%+** of European cloud spend
- Regulatory tailwind: EU Data Act, GDPR enforcement, data residency requirements
- Growing political will to reduce US tech dependency

### 3. Serverless Database Proliferation
- PlanetScale: $105M raised, $3.9M ARR (2024), 250% YoY revenue growth, 700%+ user growth
- Neon: Serverless Postgres, pivoted from branching-only to full DBaaS, ~$1B valuation (Databricks acquisition 2025)
- Supabase: $116M raised, open-source Firebase alternative, strong European user base
- Turso: Edge database (SQLite-based), serverless, excellent for read-heavy workloads

### 4. The Hetzner/OVH Cost Advantage
- Hetzner: 28 years in infrastructure, 400K+ customers, 3–5× cheaper than AWS for equivalent compute
- Hetzner Cloud growing fast but **no native managed databases or managed Kubernetes yet**
- OVHcloud: French provider with managed Kubernetes (OVH Managed Kubernetes Service), managed databases (MySQL, PostgreSQL, Redis)
- **Gap**: Cheap European infrastructure exists — but no one has built the PlanetScale-class managed DB layer on top

### 5. The "Why Now" Factors
- **Regulatory pressure**: GDPR fines reaching €1.2B+ annually; Schrems III ruling pending
- **Cost crisis**: AWS/Azure bills are crushing European startups (Hetzner is 60–80% cheaper)
- **Talent shortage**: European companies want managed DB services to reduce ops headcount
- **PlanetScale's strategic exit**: After removing free tier and pivoting upmarket, a European gap opened

---

## Market Gaps & Key Opportunities

| Gap | Opportunity | EuroScale Response |
|-----|-------------|-------------------|
| No European serverless DB with database branching | Branching for dev/CI — clone prod in seconds | Built-in database branching (inspired by PlanetScale + Neon) |
| Hetzner/OVH have cheap compute but no managed DBaaS | Layer a PlanetScale-class service on top | EuroScale runs on customer's Hetzner/OVH K8s clusters |
| US DBaaS choices violate GDPR by default | EU-sovereign by design — data never leaves EU | All data in EU data centers; DPF-compliant |
| Small European DBaaS players lack Vitess-scale sharding | Horizontal MySQL/Postgres sharding for scale | Use Vitess + Citus for true horizontal scaling |
| Multi-cloud is complex and expensive | Single control plane across Hetzner, OVH, Exoscale | Kubernetes-native operator + unified dashboard |

---

## Key Risks

| Risk | Mitigation |
|------|------------|
| AWS European Sovereign Cloud competes head-on | AWS solution is still AWS — vendor lock-in, US parent control. EuroScale is truly independent |
| PlanetScale/Neon expand to EU regions | First-mover advantage for true EU-sovereign positioning |
| OVH/Hetzner build their own managed DB | Partnership model — we run ON them, not against them. We bring the software layer |
| Slow enterprise adoption | Start with developer-friendly free tier + self-service, upsell to enterprise |
| K8s operational complexity | Fully managed K8s control plane with auto-scaling, auto-healing, zero-ops promise |
