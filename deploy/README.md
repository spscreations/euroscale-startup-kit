# EuroScale Deployment

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

# 6. Service + Deployment
kubectl apply -f deploy/api-service.yaml
kubectl apply -f deploy/api-deployment.yaml
```

---

## API Key Secret

The API uses a shared secret for authentication. Create it with:

```bash
kubectl create secret generic euroscale-api-key \
  --namespace euroscale \
  --from-literal=api_key=$(openssl rand -base64 32)
```

Or save it to a file first:

```bash
openssl rand -base64 32 > /tmp/api-key.txt
kubectl create secret generic euroscale-api-key \
  --namespace euroscale \
  --from-file=api_key=/tmp/api-key.txt
rm /tmp/api-key.txt
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
