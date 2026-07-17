# EuroScale Talos Rebuild — Implementation Plan

> **For Hermes:** Execute bottom-up; track on kanban board `euroscale-talos-rebuild`.

**Goal:** Wipe the Ubuntu/K3s cluster and rebuild EuroScale as a production MySQL PaaS on **Talos Linux + upstream Kubernetes** on Hetzner Cloud.

**Architecture:** Immutable Talos nodes (no SSH), private Hetzner network, Cilium CNI, hcloud CCM (LB/routes) + hcloud CSI (volumes), Traefik/Ingress for HTTPS, mysql-proxy for 3306 with app-level IP whitelist. Application stack (API, dashboard, Vitess) redeployed from existing GHCR images/manifests.

**Tech Stack:** Talos v1.13.x · Kubernetes 1.33/1.34 · Cilium · Hetzner CX23 (amd64) · Terraform module `hcloud-talos/talos/hcloud` v3.4.x · imager provider for Talos snapshots · Vitess operator v2.17 · existing EuroScale API/dashboard.

**Monthly infra cost (target, parity):** 3× CX23 ≈ €16.5/mo + volumes + optional floating IP / LB.

---

## ADRs

| Decision | Choice | Why |
|---|---|---|
| OS | **Talos** (not Rocky, not Ubuntu, not RancherOS) | Immutable, API-only, minimal attack surface for a multi-tenant DB PaaS |
| K8s distro | **Upstream K8s via Talos** (not K3s) | Talos is not a K3s host; K3s install model dies with Ubuntu |
| Bootstrap | **hcloud-talos Terraform module** | Production patterns: private net, firewall, Cilium, CCM, floating IP |
| Images | **imager provider + Image Factory** (platform=`hcloud`) | Avoid metal-mode ISO bug that breaks CCM providerIDs |
| Topology | **1 CP + 2 workers, CX23, fsn1** | Cost parity with current; CP can allow scheduling if needed |
| Arch | **amd64 only** (`disable_arm=true`) | User: no QEMU; Hetzner CX23 x86 |
| Storage | **hcloud CSI** for Vitess/auth-db | Not local-path; survives node replace |
| Public edge | **80/443/3306 public**; **6443/50000 admin IPs only** | PaaS must be reachable; control plane locked |
| Wipe | **Authorized** — no customer data retained on cluster | User confirmed empty / erase OK |

---

## Current inventory (pre-wipe)

| Resource | Value |
|---|---|
| Servers | `euroscale-cp-1` 91.99.187.108, `wk-1` 168.119.152.224, `wk-2` 116.202.105.201 (CX23) |
| FW | ID **11234156** `euroscale-internal` |
| DNS | `euroscale.app` / `api.euroscale.app` multi-A → all 3 public IPs |
| Admin IPs | `194.154.34.123/32`, `2.84.193.24/32` (Pi egress) |
| Old stack | K3s v1.34.5, Ubuntu 24.04, Traefik LB, Vitess, GHCR images |

---

## Task order

### 1. Tooling
- [x] `talosctl` v1.13.6, `hcloud` 1.66, `helm`, Terraform ≥1.10
- [ ] Export S3/GHCR/Mollie notes (credentials already in `credentials/`)

### 2. Terraform scaffold
Path: `infra/terraform/talos/`

- Image: `imager_image` from Talos factory schematic (platform hcloud, amd64)
- Module: `hcloud-talos/talos/hcloud` ~> 3.4.12
- Inputs: cluster_name=`euroscale`, location=`fsn1`, 1 CP + 2 workers CX23
- `disable_arm = true`
- `firewall_kube_api_source` / `firewall_talos_api_source` = admin IPs
- `enable_floating_ip = true` for stable API VIP if possible
- Outputs: kubeconfig, talosconfig → `infra/talos/`

### 3. Destroy old cluster
- Detach/delete old TF volumes (50GB)
- Delete 3 Ubuntu servers (or terraform destroy old state)
- Keep SSH key `euroscale-admin`, FW can be replaced by module

### 4. Apply Talos
- `terraform init && apply`
- Verify: `kubectl get nodes`, Cilium, CCM, CSI StorageClass

### 5. Platform + EuroScale
- cert-manager, Traefik (or CCM LoadBalancer), namespace `euroscale`
- Vitess operator + cluster, auth-db PVC on CSI
- API/dashboard/mysql-proxy from GHCR / local-reg
- Backups → Hetzner S3 only
- DNS update if IPs changed
- Smoke: login, create DB, MySQL path

### 6. Autoscaler rewrite
- Talos worker join via module patterns / machine config — not K3s cloud-init

---

## Risks

| Risk | Mitigation |
|---|---|
| Imager snapshot upload slow/large | Run on good bandwidth; one amd64 image only |
| Terraform 1.9 too old | Upgrade to 1.11.x before apply |
| DNS multi-A stale after new IPs | Update DNS immediately after apply |
| Auth users lost | Expected on wipe; re-seed test user |
| Module FW replaces old FW | Re-add public 80/443/3306 rules post-apply |
| No SSH debugging | Rely on `talosctl` + console; keep admin IP open on 50000 |

---

## Verify

```bash
export TALOSCONFIG=infra/talos/talosconfig
export KUBECONFIG=infra/talos/kubeconfig
talosctl health
kubectl get nodes -o wide
kubectl -n kube-system get pods
kubectl get sc
curl -skI https://euroscale.app/
```

---

## Out of scope this phase
- Multi-region Vitess cells
- 3-CP HA control plane
- Full GitOps (Argo) handoff
- Customer data migration (none retained)
