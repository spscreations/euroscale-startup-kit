# EuroScale Infrastructure & Deployment Security Audit

**Date:** 2026-07-06  
**Scope:** K8s manifests, Terraform, CI/CD pipeline, credential management, TLS, SSH/access  
**Risk Level:** **HIGH** (multiple critical network exposure and pod security issues)

---

## Summary

The EuroScale deployment has solid foundations — scoped RBAC, TLS for Vitess, proper gitignore hygiene — but contains **five CRITICAL findings** around network security (permissive policies + wide-open firewall), **lack of container security hardening** in the dashboard, and plain-text credentials on disk. The network architecture treats internal cluster traffic and internet-facing exposure identically, which is the single biggest risk. The CI/CD pipeline builds images with provenance/SBOM but never actually deploys (separation of build/deploy is a net positive, but the README misrepresents this).

---

## Findings

### CRITICAL

| ID | File | Line(s) | Description |
|----|------|---------|-------------|
| **C1** | `deploy/allow-all-network-policy.yaml` | 1–62 | **NetworkPolicy is permissive in all namespaces.** Four identical `allow-all` policies with `ingress: [{}]` and `egress: [{}]` (wildcard) across `kube-system`, `euroscale`, `default`, and `local-path-storage`. This provides **zero network isolation** — any pod can communicate with any other pod in these namespaces. The comment on line 1-2 acknowledges this was a workaround for kube-router default-deny. **This should be replaced with scoped policies that allow only required traffic.** |
| **C2** | `deploy/dashboard-deployment.yaml` | 20–43 | **Dashboard deployment has NO securityContext at all.** No `runAsNonRoot`, no `runAsUser`, no `readOnlyRootFilesystem`, no `allowPrivilegeEscalation: false`, no `capabilities drop`. The container runs as whatever user the image defines (likely root if the Dockerfile doesn't specify). An RCE in the dashboard would give full node access by default. |
| **C3** | `infra/terraform/hetzner/firewall.tf` | 1–66 | **Hetzner firewall exposes critical ports to `0.0.0.0/0`.** SSH (22), K8s API (6443), Vitess MySQL (3306), vtgate admin (15991), HTTP (80), HTTPS (443), and the entire NodePort range (30080-30238) are all open to the world. At minimum: SSH should be restricted to trusted IPs, K8s API should be locked down, and NodePort range should not be exposed. |
| **C4** | `deploy/api-service.yaml` | 10, 24 | **API service exposed via NodePort on static port 30081.** Combined with C3 (firewall opens 30080-30238 to 0.0.0.0/0), this means the gRPC-web API endpoint is reachable from the public internet on `http://<any-node-ip>:30081`. |
| **C5** | `infra/k3s/install.sh` | 59–60 | **K3s node token retrieved over SSH and echoed in plaintext.** The node token grants cluster-join privileges. While it's in a script that's presumably run interactively, the token is stored in shell variable `NODE_TOKEN` and passed as a command-line argument to `curl` (visible in `/proc`). If this script is logged, the token is captured. Consider using `K3S_TOKEN_FILE` instead. |

### HIGH

| ID | File | Line(s) | Description |
|----|------|---------|-------------|
| **H1** | `deploy/api-rbac.yaml` | 22–25 | **Secrets Role grants `delete` verb.** While the API legitimately needs to manage database credential secrets, granting `delete` on all secrets in the namespace is overly broad. An API bug or compromise could delete arbitrary secrets (including `euroscale-mollie`, `euroscale-api-key`, `vitess-backup-creds`, TLS certs). Remove `delete` and require a manual intervention or separate tool for secret deletion. |
| **H2** | `deploy/api-deployment.yaml` | 30–43, 34–43 | **No container-level securityContext.** While pod-level `runAsNonRoot: true` + `runAsUser: 1000` is present, there is no `allowPrivilegeEscalation: false`, no `readOnlyRootFilesystem: true`, no `capabilities: drop: [ALL]`. The container can still write to its filesystem and retains default Linux capabilities. |
| **H3** | All deploy YAMLs | — | **`:latest` image tags used everywhere.** `api-deployment.yaml:36`, `dashboard-deployment.yaml:25` both use `:latest`. This defeats image immutability — if someone pushes a compromised `:latest` tag, it gets pulled on next pod restart with no audit trail. Pin to SHA digests or at minimum specific version tags. |
| **H4** | `infra/monitoring/deploy.sh` | 11, 94–97 | **Grafana admin password auto-generated and printed in full to stdout.** The 16-byte base64 password is echoed in the summary banner. If this script output is captured in CI logs or terminal history, the Grafana admin password is compromised. |
| **H5** | `credentials/hetzner/cloud.env` | 2 | **Real Hetzner Cloud API token present on disk.** While gitignored (✓), the token exists in plaintext. File permissions 600 are correct, but the parent directory `credentials/` is 755 — any local user can list the directory and discover the files exist. |
| **H6** | `credentials/hetzner/s3.env` | 2–3 | **Real S3 access key + secret key present on disk.** Same issue as H5 — plaintext credentials at rest. |
| **H7** | `infra/terraform/hetzner/` | all | **No Terraform remote state backend configured.** Without an explicit `backend` block, state is stored locally. If the state file contains sensitive outputs (node IPs, resource IDs), it must be stored securely. Add an S3/GCS backend or at minimum ensure `.gitignore` covers `*.tfstate*`. (The gitignore does cover it, but no backend is declared.) |

### MEDIUM

| ID | File | Line(s) | Description |
|----|------|---------|-------------|
| **M1** | `.github/workflows/deploy-api.yml` | 26–102 | **CI/CD pipeline builds and pushes, but never deploys.** The job is named `build-and-deploy` but contains no `kubectl` steps. The README (`deploy/README.md`) describes auto-deployment but the workflow only pushes images. This is a **functional gap**, not a security vulnerability — it may be intentional separation, but the naming is misleading and could lead to manual deploy mistakes. |
| **M2** | `.github/workflows/deploy-api.yml` | 80 | **Only `linux/amd64` platform is built.** The `deploy/README.md:37` states multi-arch (`linux/amd64` + `linux/arm64`) but the workflow builds only `linux/amd64`. On ARM nodes (Hetzner CAX), images would fail to run. |
| **M3** | `infra/k3s/deploy-addons.sh` | 99–105 | **MinIO backup credentials use `euroscale` as both the access key and root user.** The `aws-access-key-id` is hardcoded to `euroscale` (line 101), matching the root user. If used for actual S3-compatible access, consider generating separate IAM-style credentials. |
| **M4** | `infra/networking/apply.sh` | 52, 88 | **HCLOUD_TOKEN accepted interactively via `read`.** While better than hardcoding, interactive token input means the token passes through terminal input which may be logged. The script also creates the secret from the env var value rather than from a file. |
| **M5** | `deploy/create-api-key.sh` | 35–39 | **API key printed to stdout with recovery instructions.** The key is printed once (by design), but the recovery command (`kubectl get secret ... | base64 -d`) is also printed — anyone with kubectl access to the cluster can retrieve the key. This isn't a vulnerability per se, but the script's warning that "this is the only time the key is shown" is misleading since anyone with `get secrets` RBAC can retrieve it. |

### LOW

| ID | File | Line(s) | Description |
|----|------|---------|-------------|
| **L1** | `deploy/euroscale-config.yaml` | 19 | **MinIO endpoint uses `http://` in ConfigMap.** While this is internal cluster traffic, it's worth noting that MinIO communication is unencrypted within the cluster. |
| **L2** | `infra/vitess/deploy.sh` | 11 | **Vitess operator manifest fetched from `raw.githubusercontent.com` main branch.** No version pinning — changes to the upstream manifest could break or compromise the deployment. Pin to a specific release tag. |
| **L3** | `infra/vitess/tls/generate-certs.sh` | 10, 16 | **CA certificate validity: 10 years (3650 days).** Server cert is 1 year (365 days) which is reasonable, but the CA cert should ideally not outlive the project by a decade. Consider 3-5 years for the CA. |
| **L4** | `deploy/dashboard-deployment.yaml` | 35 | **`NEXT_PUBLIC_*` env vars set at build time via `build-args` in CI.** These are baked into the Docker image rather than injected at runtime. If the API host changes, a rebuild is required. |

### INFO

| ID | File | Line(s) | Description |
|----|------|---------|-------------|
| **I1** | `deploy/api-rbac.yaml` | 32–46 | **PVC Role is appropriately scoped.** Only `get, list, watch, patch` on PVCs — no `delete` or `create`. Good least-privilege example. |
| **I2** | `.github/workflows/deploy-api.yml` | 83–84 | **SLSA provenance and SBOM generation enabled.** `provenance: true` and `sbom: true` provide supply-chain attestation. Good practice. |
| **I3** | `.gitignore` | 1–2 | **`credentials/` directory is gitignored.** Confirmed no credential files are tracked in git. |
| **I4** | `infra/vitess/tls/.gitignore` | 2–4 | **Private keys (`*.key`, `*.csr`, `*.srl`) are gitignored.** Only the public CA certificate (`euroscale-vtgate-ca.crt`) is committed. Good. |
| **I5** | `infra/k3s/.gitignore` | 2 | **Kubeconfig is gitignored.** Prevents cluster credentials from being committed. |
| **I6** | `deploy/api-deployment.yaml` | 30–33 | **Pod-level securityContext with `runAsNonRoot: true`.** Correct baseline for the API pod. |
| **I7** | `deploy/api-pdb.yaml` | 1–17 | **PodDisruptionBudget ensures HA.** `minAvailable: 1` for a 2-replica deployment is correct. |

---

## Fix Recommendations (Priority Order)

### 1. Replace permissive NetworkPolicy (CRITICAL — C1)

Replace the `allow-all` policies with scoped rules. Example for the `euroscale` namespace:

```yaml
# Only allow required traffic
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: euroscale-default-deny
  namespace: euroscale
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]
  # No ingress/egress rules = default deny all
---
# Allow API ↔ vtgate
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api-vtgate
  namespace: euroscale
spec:
  podSelector:
    matchLabels:
      planetscale.com/component: vtgate
  ingress:
    - from:
        - podSelector:
            matchLabels:
              component: api
      ports:
        - port: 3306
        - port: 15991
---
# Allow DNS from all pods
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns
  namespace: euroscale
spec:
  podSelector: {}
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - port: 53
          protocol: UDP
```

### 2. Harden dashboard pod security (CRITICAL — C2)

Add to `deploy/dashboard-deployment.yaml`:

```yaml
spec:
  template:
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
      containers:
        - name: dashboard
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: [ALL]
```

### 3. Tighten Hetzner firewall (CRITICAL — C3)

```hcl
# SSH — restrict to your IP/management VPN
rule {
  direction  = "in"
  protocol   = "tcp"
  source_ips = ["YOUR_TRUSTED_IP/32"]  # ← CHANGE THIS
  port       = "22"
}

# K8s API — restrict to your IP/management VPN
rule {
  direction  = "in"
  protocol   = "tcp"
  source_ips = ["YOUR_TRUSTED_IP/32"]  # ← CHANGE THIS
  port       = "6443"
}

# Vitess MySQL — only if external access is intended
# Consider using a VPN or SSH tunnel instead
rule {
  direction  = "in"
  protocol   = "tcp"
  source_ips = ["YOUR_TRUSTED_IP/32"]  # ← CHANGE THIS
  port       = "3306"
}

# NodePort range — do NOT expose to 0.0.0.0/0
# Remove entirely or restrict to load balancer IPs
# rule { ... port = "30080-30238" ... }  ← REMOVE
```

### 4. Remove NodePort exposure for API (CRITICAL — C4)

Change `deploy/api-service.yaml` from `type: NodePort` to `type: ClusterIP` (internal-only), then use an Ingress controller or the Hetzner LoadBalancer for external access with proper TLS termination:

```yaml
spec:
  type: ClusterIP  # was: NodePort
  # Remove nodePort: 30081
```

### 5. Pin container images (HIGH — H3)

Replace `:latest` with SHA256 digests:

```yaml
# deploy/api-deployment.yaml
image: ghcr.io/spscreations/euroscale-api@sha256:abc123...
# deploy/dashboard-deployment.yaml  
image: ghcr.io/spscreations/euroscale-dashboard@sha256:def456...
```

### 6. Remove `delete` from secrets Role (HIGH — H1)

In `deploy/api-rbac.yaml:25`, remove `delete` from the secrets role verbs:

```yaml
verbs: ["get", "list", "create", "update", "patch"]  # removed "delete"
```

### 7. Add container-level securityContext to API (HIGH — H2)

```yaml
containers:
  - name: api
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      capabilities:
        drop: [ALL]
    # If the app needs to write temp files, add an emptyDir volume:
    volumeMounts:
      - name: tmp
        mountPath: /tmp
  volumes:
    - name: tmp
      emptyDir: {}
```

### 8. Add Terraform remote state backend (HIGH — H7)

```hcl
terraform {
  backend "s3" {
    bucket = "euroscale-tfstate"
    key    = "hetzner/terraform.tfstate"
    region = "nbg1"
    endpoint = "https://s3.nbg1.cloud.fsn.hetzner.com"
    # Use Hetzner Object Storage as S3-compatible backend
  }
}
```

### 9. Avoid printing secrets to stdout (HIGH — H4)

In `infra/monitoring/deploy.sh`, change lines 94-97 to:

```bash
echo "  ┌──────────────────────────────────────────────────────────┐"
echo "  │  Grafana URL:      http://${GRAFANA_IP}                    "
echo "  │  Admin User:       ${GRAFANA_ADMIN_USER}                  "
echo "  │  Admin Password:   (set — retrieve with kubectl command below)"
```

### 10. Restrict credentials directory permissions (HIGH — H5/H6)

```bash
chmod 700 credentials/
```

---

## Good Practices Observed

| Practice | Detail |
|----------|--------|
| **Scoped RBAC** | Namespace-level Roles, not ClusterRoles. ServiceAccount properly bound. |
| **Non-root API pod** | `runAsNonRoot: true`, `runAsUser: 1000` on the API deployment. |
| **TLS for Vitess** | CA-signed certificates for vtgate MySQL connections. Private keys gitignored. |
| **Git hygiene** | `credentials/`, `kubeconfig`, `*.tfstate*`, `*.key`, `*.csr` all gitignored. |
| **SLSA provenance** | CI generates SLSA provenance and SBOM for supply-chain attestation. |
| **PDB for HA** | PodDisruptionBudget ensures availability during node maintenance. |
| **RollingUpdate** | `maxUnavailable: 1, maxSurge: 1` with 2 replicas. |
| **Readiness/Liveness probes** | HTTP health checks at `/healthz` and `/ready` with appropriate timeouts. |
| **ImagePullSecrets** | Private GHCR images pulled with dedicated secret. |
| **API key generation** | Uses `openssl rand -base64 32` (cryptographically secure, 256-bit). |
| **No secrets in ConfigMap** | Correct separation — `euroscale-config.yaml` contains only non-sensitive config. |
| **MinIO password auto-generated** | Random 32-byte password, not hardcoded. |
| **Terraform sensitive variables** | `hcloud_token` marked as `sensitive = true`. |

---

## Risk Matrix

| Area | Current Risk | Target Risk | Gap |
|------|-------------|-------------|-----|
| Network segmentation | **CRITICAL** | MEDIUM | No network policies, wide-open firewall |
| Pod security | **HIGH** | LOW | Dashboard lacks securityContext entirely |
| Secret management | **HIGH** | LOW | Plaintext creds on disk, secrets echo'd to stdout |
| RBAC | MEDIUM | LOW | Secrets `delete` verb is overly broad |
| Supply chain | MEDIUM | LOW | `:latest` tags, unpinned operator manifests |
| TLS/encryption | LOW | LOW | Good — TLS for Vitess, CA properly managed |
| CI/CD | MEDIUM | MEDIUM | Pipeline doesn't deploy (separation is fine, but misleading name) |
| SSH/access | **HIGH** | MEDIUM | SSH open to 0.0.0.0/0, node token handling |
| Terraform state | MEDIUM | LOW | No remote backend configured |

---

*Audit performed by automated security agent. Findings should be validated by a human operator before remediation.*
