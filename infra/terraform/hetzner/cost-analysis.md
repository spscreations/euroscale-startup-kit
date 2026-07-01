# EuroScale — VPS vs Dedicated Server Cost Analysis

> **Analysis date:** July 2026
> **Context:** Hetzner price adjustment effective June 15, 2026 (up to 2.73× on CCX instances, ~1.3× on CAX)
> **EuroScale MVP:** 3-node multi-region HA K8s cluster (2× Nuremberg + 1× Helsinki) for Vitess DBaaS

---

## Current MVP Plan: 3 × CAX21 (Cloud VPS)

| Node | Role | Location | Spec | Monthly |
|------|------|----------|------|---------|
| euroscale-cp-1 | Control plane | Nuremberg (nbg1) | 4 vCPU, 8GB RAM, 50GB | €10.49 |
| euroscale-wk-1 | Worker | Nuremberg (nbg1) | 4 vCPU, 8GB RAM, 50GB | €10.49 |
| euroscale-wk-2 | Worker | Helsinki (hel1) | 4 vCPU, 8GB RAM, 50GB | €10.49 |
| **Subtotal** | | | **12 vCPU, 24GB RAM, 150GB** | **€31.47** |
| Storage Box SX11 | Off-site backup | Nuremberg | 1TB | €4.90 |
| **Total** | | | | **€36.37/mo** |

### Pros
- ✅ Multi-region HA out of the box (Nuremberg + Helsinki)
- ✅ Terraform-native provisioning (code-driven, repeatable)
- ✅ Horizontal scaling — add more CAX nodes trivially
- ✅ No setup fees
- ✅ Can be provisioned + destroyed in minutes via API

### Cons
- ❌ Shared CPU (Ampere ARM cores shared with neighbors)
- ❌ Noisy-neighbor risk under sustained load
- ❌ RAM ceiling per node (8GB — fine for MVP, tight for production)
- ❌ 20TB traffic included, then €1/TB

---

## Option A: Single Dedicated Server (all-in-one)

### AX42-1-LTD — €77.30/mo (€39 setup)

| Spec | Value |
|------|-------|
| CPU | AMD EPYC (24+ cores, dedicated) |
| RAM | 64GB+ ECC |
| Storage | 2× NVMe (RAID1 capable) |
| Traffic | 30TB included |

**Architecture:** Run all 3 K8s nodes as VMs on the dedicated server (via KVM/libvirt), or run single-node K3s with Vitess within.

| Item | Monthly |
|------|---------|
| AX42-1-LTD | €77.30 |
| Storage Box | €4.90 |
| **Total** | **€82.20/mo** |

**Risks:** Single point of hardware failure. No multi-region. Puts all eggs in one Nuremberg basket.

---

## Option B: Two Dedicated Servers (HA pair)

### 2 × AX41-1-LTD — €114.60/mo (€0 setup)

| Per node | Spec |
|----------|------|
| CPU | AMD EPYC (16+ cores, dedicated) |
| RAM | 64GB ECC |
| Storage | 2× NVMe |
| Traffic | 30TB each |

**Architecture:** 2 dedicated servers, one in Nuremberg, one in Helsinki. Each runs a K3s node. Vitess distributes across both.

| Item | Monthly |
|------|---------|
| 2 × AX41-1-LTD | €114.60 |
| Storage Box | €4.90 |
| **Total** | **€119.50/mo** |

**Pros:** True HA across 2 regions. Massive headroom. **Cons:** 3.3× the MVP cloud cost. 2 nodes instead of 3 (lose the tie-breaker for etcd quorum — need an extra tiny witness node).

---

## Option C: Hybrid — Cloud + Dedicated

### 1 × AX41-1-LTD (primary, Nuremberg) + 2 × CAX21 (witness/replica)

| Item | Role | Monthly |
|------|------|---------|
| AX41-1-LTD | Primary Vitess + API | €57.30 |
| CAX21 (wk-1) | Nuremberg replica | €10.49 |
| CAX21 (wk-2) | Helsinki replica | €10.49 |
| Storage Box | Backups | €4.90 |
| **Total** | | **€83.18/mo** |

**Best of both worlds:** Dedicated CPU for the primary database, cloud for HA replicas. Scales gracefully — upgrade the dedicated server when needed.

---

## Cost Comparison Over 12 Months

| Scenario | Monthly | 12 Months | 24 Months | Setup Cost |
|----------|---------|-----------|-----------|------------|
| **MVP: 3× CAX21 (current plan)** | €36.37 | **€436** | €873 | €0 |
| Option A: Single AX42-1-LTD | €82.20 | €986 | €1,972 | €39 |
| Option B: 2× AX41-1-LTD HA | €119.50 | €1,434 | €2,868 | €0 |
| Option C: Hybrid AX41 + 2× CAX | €83.18 | **€998** | €1,996 | €39 |

---

## Break-Even Analysis — When Dedicated Makes Sense

### Scenario: Cloud VPS needs to scale up (higher load)

If EuroScale grows and CAX21 nodes need upgrading to **CCX23** (dedicated vCPU, 4 vCPU, 16GB):

| Config | Monthly |
|--------|---------|
| 3 × CCX23 | €257.97/mo |
| 1 × AX42-1-LTD | €82.20/mo |

**At CCX level, dedicated is 3.1× cheaper.** The cloud premium for "dedicated vCPU" is enormous post-June 2026 (CCX went up 2.7×).

### Break-even point

| vCPU Count | Cloud (CAX) | Cloud (CCX) | Dedicated (AX) | Winner |
|-----------|-------------|-------------|-----------------|--------|
| 4 vCPU, 8GB | €10.49 | €42.99 | €57.30 (AX41) | **Cloud (CAX)** |
| 12 vCPU, 24GB | **€31.47** | €257.97 | €82.20 (AX42) | **Cloud CAX** |
| 24 vCPU, 48GB | €62.97 | €515.94 | €119.50 (2×AX41) | **Dedicated** |

**Rule of thumb:** Stay on CAX cloud VPS until you need more than ~16 vCPUs or sustained full CPU load. Then switch to dedicated.

---

## Recommendation for EuroScale MVP

| Phase | Recommended | Rationale |
|-------|------------|-----------|
| **MVP (now)** | **3× CAX21** (€36/mo) | Lowest cost, multi-region HA, fast iteration |
| **Growth (50+ customers)** | **Hybrid** — AX41-LTD + 2× CAX21 (€83/mo) | Dedicated primary, cloud HA replicas |
| **Scale (200+ customers)** | **2× AX41-LTD** + Storage Box (€120/mo) | Full dedicated HA across 2 regions |

### Why CAX for MVP?

1. **€36/mo for multi-region HA** — no other setup gives you 2 regions at this price
2. **Vitess handles the shared-CPU noise** — replication smooths out latency spikes
3. **Zero lock-in** — Terraform makes it trivial to migrate
4. **ARM CAX is surprisingly fast** — Ampere Altra at €10.49 beats AWS Graviton on price/performance
5. **The dedicated setup fees are real** — €39-€129 per server vs €0 for cloud

---

## Post-June 2026 Price Impact Summary

| Family | Old Price (CAX21) | New Price | Increase |
|--------|------------------|-----------|----------|
| CAX21 (Arm, shared) | €7.99 | €10.49 | **+31%** |
| CCX13 (AMD, dedicated) | €15.99 | €42.99 | **+169%** |
| CPX22 (AMD, shared) | €7.99 | €19.49 | **+144%** |
| AX42-1-LTD (dedicated) | — | €77.30 | New offering |

The CAX (Arm) line saw the **smallest increase** at 31%, making it the clear value champion. The CCX/CPX lines were decimated (2.4×-2.7× increases).

**Conclusion:** Stay on CAX for MVP. The dedicated server option becomes compelling at ~€80/mo+ but only when you've outgrown 4 vCPU/8GB per node.
