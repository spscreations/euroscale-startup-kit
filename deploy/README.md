# EuroScale Deployment

<!-- ci: path-filter trigger 2026-07-17 — amd64-only GHCR for Talos/Hetzner -->

## CI/CD Pipeline

A GitHub Actions workflow (`.github/workflows/deploy-api.yml`) handles automated builds and deployments.

### How It Works

1. **Trigger**: Pushes to `main` that touch `api/**` or `deploy/**`.
2. **Build**: A multi-stage Docker build (see `api/Dockerfile`) produces a statically linked Go binary in an Alpine container.
3. **Push**: The image is pushed to GitHub Container Registry as:
   - `ghcr.io/spscreations/euroscale-api:<git-sha>` — immutable per-commit tag
   - `ghcr.io/spscreations/euroscale-api:latest` — rolling latest
4. **Deploy**: `kubectl set image` updates the `euroscale-api` Deployment in the `euroscale` namespace.
5. **Verify**: `kubectl rollout status` waits for the rollout to complete (5-minute timeout).

Build caching is handled via GitHub Actions cache (`type=gha`), so subsequent builds reuse layers.

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `KUBECONFIG` | Base64-encoded kubeconfig file for the target cluster |

Set `KUBECONFIG` from your machine:

```bash
cat ~/.kube/config | base64 -w0 | gh secret set KUBECONFIG
```

(Use `base64` without `-w0` on macOS.)

No Docker Hub or GHCR credentials are needed — the workflow authenticates with the built-in `GITHUB_TOKEN`.

### Multi-Architecture Builds

The workflow builds and pushes images for **both `linux/amd64` and `linux/arm64`** platforms. On an ARM-based cluster (K3s on Raspberry Pi / Hetzner CAX), the correct variant is pulled automatically.

### Manual / Workflow Dispatch

The workflow supports [`workflow_dispatch`](https://docs.github.com/en/actions/using-manual-workflow) for manual runs. You can optionally pass an `image_tag` input to tag the image with a custom name.

---

## Kubernetes Manifests

Apply in order for a first-time deploy:

```bash
# 1. Create namespace
kubectl create namespace euroscale

# 2. RBAC (ServiceAccount + Role + RoleBinding)
kubectl apply -f deploy/api-rbac.yaml

# 3. API key secret (see below)
./deploy/create-api-key.sh

# 4. App config
kubectl apply -f deploy/euroscale-config.yaml

# 5. TLS certs for Vitess
kubectl apply -f api/deploy/tls-certs.yaml

# 6. PodDisruptionBudget (ensure HA during node maintenance)
kubectl apply -f deploy/api-pdb.yaml

# 7. Service + Deployment
kubectl apply -f deploy/api-service.yaml
kubectl apply -f deploy/api-deployment.yaml
```

---

## Mollie Secret (webhook signature verification)

**Live status (re-audit 2026-07-15):** `euroscale-mollie` has **only** `api_key`.
API logs: `WARNING: MOLLIE_WEBHOOK_SECRET not set — webhook signature verification disabled`.

Payment status is still confirmed via Mollie API after webhook receipt, but signature
verification is the first line of defense against forged webhook POSTs.

### Required keys (do NOT commit real values)

| Key | Purpose |
|-----|---------|
| `api_key` | Mollie API bearer token (`live_…` / `test_…`) |
| `webhook_secret` | Signing secret from Mollie dashboard (webhook settings) |

Template (placeholders only): `infra/secrets/mollie-secret.yaml`

### Operator runbook (cluster only — never git)

```bash
# 1) Add webhook_secret WITHOUT printing it
#    Obtain value from Mollie Dashboard → Developers → Webhooks / signing secret
read -s MOLLIE_WEBHOOK_SECRET && echo
kubectl create secret generic euroscale-mollie \
  --namespace euroscale \
  --from-literal=api_key="$(kubectl get secret euroscale-mollie -n euroscale -o jsonpath='{.data.api_key}' | base64 -d)" \
  --from-literal=webhook_secret="$MOLLIE_WEBHOOK_SECRET" \
  --dry-run=client -o yaml | kubectl apply -f -
unset MOLLIE_WEBHOOK_SECRET

# 2) Ensure Deployment mounts MOLLIE_WEBHOOK_SECRET (see api-deployment.yaml)
#    Then restart API (does not change image tag):
kubectl rollout restart deployment/euroscale-api -n euroscale
kubectl rollout status deployment/euroscale-api -n euroscale --timeout=180s

# 3) Confirm warning is gone:
kubectl logs -n euroscale -l component=api --tail=50 | grep -i mollie
```

---

## Auth DB credentials (dashboard Better Auth)

The dashboard stores Better Auth users in **MariaDB** (`euroscale-auth-db`),
**not** customer Vitess databases.

| Env | Source |
|-----|--------|
| `AUTH_DB_HOST` | `euroscale-auth-db` |
| `AUTH_DB_PORT` | `3306` |
| `AUTH_DB_USER` | `root` (plain value in deploy YAML) |
| `AUTH_DB_NAME` | `euroscale_auth` |
| `AUTH_DB_PASS` | secret `euroscale-auth-db-credentials` key `password` |

Template (placeholders only): `infra/secrets/auth-db-secret.yaml`

Manifest: `infra/k3s/auth-db.yaml` (Deployment + Service + **PVC**).

### Persistence (critical)

**Never use `emptyDir` for auth-db data.** MariaDB data lives on PVC
`euroscale-auth-db-data` (`local-path`, 5Gi, RWO) mounted at `/var/lib/mysql`.

- Pod recreate / node drain with `emptyDir` wiped Better Auth users (incident
  2026-07-15: users recreated with new IDs and free tier).
- Deployment strategy is `Recreate` (required for single RWO volume).
- Do **not** scale auth-db above 1 replica while on RWO local-path.

```bash
export KUBECONFIG=infra/k3s/kubeconfig

# Apply / update auth-db (PVC + Deployment + Service)
kubectl apply -f infra/k3s/auth-db.yaml
kubectl rollout status deployment/euroscale-auth-db -n euroscale --timeout=180s

# Optional backup before any risky change
PASS=$(kubectl -n euroscale get secret euroscale-auth-db-credentials -o jsonpath='{.data.password}' | base64 -d)
kubectl -n euroscale exec deploy/euroscale-auth-db -- \
  mariadb-dump -uroot -p"$PASS" --single-transaction euroscale_auth \
  > /tmp/euroscale_auth_$(date +%Y%m%d).sql
```

### Operator runbook (cluster only — never git)

```bash
export KUBECONFIG=infra/k3s/kubeconfig

# Create/update secret (use the real MariaDB root password; default from first init was euroscale-auth)
kubectl create secret generic euroscale-auth-db-credentials \
  --namespace euroscale \
  --from-literal=username=root \
  --from-literal=password='REPLACE_ME' \
  --dry-run=client -o yaml | kubectl apply -f -

# Dashboard already references the secret via AUTH_DB_PASS secretKeyRef.
# After creating/rotating the secret:
kubectl rollout restart deployment/euroscale-dashboard -n euroscale
kubectl rollout status deployment/euroscale-dashboard -n euroscale --timeout=180s
```

**Do not** wire `AUTH_DB_*` to customer Vitess secrets (`db-*-creds`). That was a
production outage cause (login failed because dashboard hit the wrong DB credentials).

---

## Network Policies

- `allow-all-network-policy.yaml` — **system namespaces only** (kube-system, local-path-storage).
- `euroscale-network-policy.yaml` — least-privilege for euroscale (Traefik, Vitess labels, HTTPS egress).

**Live gap:** `euroscale` namespace still has a legacy `allow-all` NetworkPolicy.
Apply least-privilege policies only after a staged validation — see comments in the YAML.

---

## Image tags

Git manifests use version tags (e.g. `:v1.2`) with comments to pin digests.
CI / production should prefer **immutable git-SHA tags** (live currently runs
`ghcr.io/spscreations/euroscale-*:95e7e3e…`). Do **not** flip production to an
untested `:latest` or unbuilt tag.

---

## API Key Secret

The API uses a shared secret for authentication. Create it with:

```bash
./deploy/create-api-key.sh
# Full key is written to a mode-0600 file under /tmp (not printed to stdout).
```

Or:

```bash
kubectl create secret generic euroscale-api-key \
  --namespace euroscale \
  --from-literal=api_key=$(openssl rand -base64 32)
```

Or save it to a file first:

```bash
openssl rand -base64 32 > /tmp/api-key.txt
chmod 600 /tmp/api-key.txt
kubectl create secret generic euroscale-api-key \
  --namespace euroscale \
  --from-file=api_key=/tmp/api-key.txt
shred -u /tmp/api-key.txt
```

Rotate the key by deleting and recreating the secret, then restarting the pods:

```bash
kubectl create secret generic euroscale-api-key \
  --namespace euroscale \
  --from-literal=api_key=$(openssl rand -base64 32) \
  --dry-run=client -o yaml | kubectl replace -f -

kubectl rollout restart deployment/euroscale-api --namespace euroscale
```

---

## Manual Deploy

When CI/CD isn't available, build and push locally:

```bash
# Build the image
docker build -t ghcr.io/spscreations/euroscale-api:manual ./api

# Push (requires docker login to ghcr.io first)
docker push ghcr.io/spscreations/euroscale-api:manual

# Deploy
kubectl set image deployment/euroscale-api \
  api=ghcr.io/spscreations/euroscale-api:manual \
  --namespace euroscale

kubectl rollout status deployment/euroscale-api --namespace euroscale --timeout=300s
```

---

## Hetzner Object Storage (Vitess backups)

Vitess backups use **Hetzner Object Storage** (S3-compatible). In-cluster MinIO
is **not** used and `deploy/minio.yaml` has been removed.

| Setting | Value |
|---------|--------|
| Endpoint | `https://nbg1.your-objectstorage.com` |
| Region | `nbg1` |
| Bucket | `euroscale-etcd-backups` |
| Force path style | `true` |
| Auth secret | `vitess-backup-creds` (key: `credentials`) |
| Engine | `builtin` |
| Location name | `hetzner` |

### How backups are scheduled

Operator `VitessBackupSchedule` CRs are **not** used. Kubernetes CronJobs run
backups instead:

```bash
kubectl apply -f deploy/backup-cronjob.yaml
kubectl apply -f deploy/pitr-incremental-cronjob.yaml
# S3 endpoint env injection for backup Job pods:
kubectl apply -f deploy/webhook-s3-injector.yaml
```

VitessCluster + tablet flags live in `infra/vitess/vitess-cluster.yaml`.
Reference notes: `infra/vitess/backup-config.yaml`.

**Important:** put `backup_*` / `s3_backup_*` flags only on **vttablet**
`tabletPools` extraFlags — never on vtgate `gateway` extraFlags. Never set
`incremental_backup` (crashes Vitess v24.0.1).

### Credentials (cluster only — never commit)

Create/update `vitess-backup-creds` with Hetzner Object Storage access keys in
AWS credentials-file format under key `credentials`. Do not store real keys in git.

```bash
# Example shape only — substitute real Hetzner keys from the console
kubectl create secret generic vitess-backup-creds \
  --namespace euroscale \
  --from-literal=credentials="[default]
aws_access_key_id = <HETZNER_ACCESS_KEY>
aws_secret_access_key = <HETZNER_SECRET_KEY>" \
  --dry-run=client -o yaml | kubectl apply -f -
```

### Verify

```bash
kubectl get vitessbackupstorage -n euroscale
kubectl get vitessbackups -n euroscale
kubectl get cronjob -n euroscale | grep backup
# Operator schedules should be absent (empty):
kubectl get vitessbackupschedule -n euroscale
```

---

## VTGate MySQL TLS

VTGate has `secureTransport` enabled (mTLS) on port 3306. MySQL clients must
present a valid TLS certificate signed by the cluster CA.

### Connection from inside the cluster (API pods)

The API mounts the CA cert from Secret `euroscale-vtgate-tls` at
`/etc/euroscale/tls/ca.crt` and connects with `ssl-mode=VERIFY_IDENTITY`.
No manual setup needed — this is handled by `api-deployment.yaml`.

### Connection from external clients

External MySQL clients connecting to `db.euroscale.app:3306` must use TLS:

```bash
# 1. Extract the CA certificate from the cluster
kubectl -n euroscale get secret euroscale-vtgate-tls \
  -o jsonpath='{.data.ca\.crt}' | base64 -d > euroscale-ca.crt

# 2. Connect with the CA as trust anchor
mysql -h db.euroscale.app -P 3306 \
  -u <username> -p \
  --ssl-ca=euroscale-ca.crt \
  --ssl-mode=VERIFY_IDENTITY
```

### CA certificate source

The CA cert is stored in the `euroscale-vtgate-tls` Kubernetes Secret
(key: `ca.crt`). It is also available in the repo at
`infra/vitess/tls/euroscale-vtgate-ca.crt` for reference (public file).

### Regenerating TLS certificates

See `infra/vitess/tls/README.md` for the full certificate generation and
rotation procedure.

```bash
cd infra/vitess/tls
./generate-certs.sh .
kubectl -n euroscale create secret generic euroscale-vtgate-tls \
  --from-file=ca.crt=euroscale-vtgate-ca.crt \
  --from-file=tls.crt=euroscale-vtgate.crt \
  --from-file=tls.key=euroscale-vtgate.key \
  --dry-run=client -o yaml | kubectl apply -f -
```

### Troubleshooting TLS

**"Lost connection to MySQL server"** — The client is not sending TLS.
Use `--ssl-mode=VERIFY_IDENTITY` with the CA cert.

**"SSL certificate validation failed"** — Wrong or missing CA cert.
Extract it from the cluster or use the one in `infra/vitess/tls/`.

**Verify vtgate TLS is enabled:**
```bash
kubectl -n euroscale get secret euroscale-vtgate-tls -o jsonpath='{.data.tls\.crt}' | base64 -d | openssl x509 -text -noout | head -5
```

---

## Troubleshooting

**Rollout stuck / ImagePullBackOff**
```bash
kubectl describe pod -n euroscale -l component=api
kubectl logs -n euroscale -l component=api --tail=50
```

**Check current image**
```bash
kubectl get deployment euroscale-api -n euroscale -o jsonpath='{.spec.template.spec.containers[0].image}'
```

<!-- ci trigger 2026-07-16T23:11:09Z talos rebuild -->
<!-- 2026-07-17T02:12:18+03:00 -->
<!-- trigger 2026-07-17T02:13:12+03:00 -->
<!-- retrigger mirror 2026-07-17 -->
