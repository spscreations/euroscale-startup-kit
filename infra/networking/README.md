# EuroScale — DNS, Ingress & External Access

Exposes Vitess vtgate publicly via a Hetzner Cloud Load Balancer so customers
can connect to their databases at `vtgate.euroscale.app` (and wildcard
`*.euroscale.app` in the future).

## Architecture

```
                           Internet
                              │
                              ▼
              ┌─────────────────────────────┐
              │  Hetzner Cloud LB (nbg1)    │
              │  ─────────────────────      │
              │  Port 3306  → MySQL         │
              │  Port 3307  → MySQL + SSL   │
              │  Port 50051 → gRPC API      │
              └────────────┬────────────────┘
                           │
                           ▼
              ┌─────────────────────────────┐
              │  vtgate Pods (euroscale ns) │
              │  ─ – ─ – ─ – ─ – ─ – ─ –  │
              │  nuremberg ×1 + hel ×1      │
              └─────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
        ┌──────────┐             ┌──────────┐
        │ vttablet │             │ vttablet │
        │  nbg1    │             │  hel1    │
        └──────────┘             └──────────┘

 DNS: *.euroscale.app  ──A──▶  Hetzner LB IP
      (managed by ExternalDNS)
```

## Files

| File | Description |
|------|-------------|
| `vtgate-lb.yaml` | Service of type LoadBalancer — provisions Hetzner Cloud LB for vtgate |
| `external-dns.yaml` | K3s `HelmChart` CRD — deploys ExternalDNS to auto-manage DNS records |
| `apply.sh` | One-shot script to install CCM, LB, DNS, and verify everything |
| `README.md` | This file |

## Quick Start

```bash
cd infra/networking

# One-shot deploy (installs CCM + LB + ExternalDNS)
bash apply.sh
```

## Step-by-Step

### 1. Install Hetzner Cloud Controller Manager (CCM)

Required so Services of type `LoadBalancer` provision real Hetzner Cloud LBs.

```bash
# Option A: From upstream release (recommended for K3s)
kubectl apply -f https://github.com/hetznercloud/hcloud-cloud-controller-manager/releases/latest/download/ccm-networks.yaml

# Option B: Minimal deployment using the official Helm chart
helm repo add hcloud https://charts.hetzner.cloud
helm repo update hcloud
helm upgrade --install hcloud-ccm hcloud/hcloud-cloud-controller-manager \
  --namespace kube-system \
  --set env.HCLOUD_TOKEN.valueFrom.secretKeyRef.name=hcloud \
  --set env.HCLOUD_TOKEN.valueFrom.secretKeyRef.key=token
```

> ⚠️ **Before applying:** Create the `hcloud` secret with your Hetzner API token:
> ```bash
> kubectl create secret generic hcloud -n kube-system \
>   --from-literal=token="<YOUR_HCLOUD_API_TOKEN>"
> ```

Verify the CCM is running:
```bash
kubectl get pods -n kube-system -l app.kubernetes.io/name=hcloud-cloud-controller-manager
```

### 2. Apply the LoadBalancer Service

```bash
kubectl apply -f vtgate-lb.yaml
```

Wait for the external IP to be assigned:
```bash
kubectl get svc euroscale-vtgate-lb -n euroscale --watch
# Look for EXTERNAL-IP: <Hetzner LB public IP>
```

### 3. Set Up DNS A Record (Manual)

If **not** using ExternalDNS, create DNS records manually:

```
Name                  Type    Value
─────────────────────────────────────────────────
vtgate.euroscale.app  A       <LoadBalancer IP>
*.euroscale.app       A       <LoadBalancer IP>
```

This can be done in the Hetzner DNS console or via hcloud CLI:
```bash
hcloud dns add-record <zone-id> \
  --name vtgate \
  --type A \
  --value "<LB_IP>"
```

### 4. (Optional) Deploy ExternalDNS for Automated DNS

ExternalDNS watches Service annotations and auto-manages DNS records in Hetzner DNS.

```bash
# Create the Hetzner DNS API token secret
kubectl create namespace external-dns --dry-run=client -o yaml | kubectl apply -f -
kubectl create secret generic hetzner-token \
  -n external-dns \
  --from-literal=token="<YOUR_HETZNER_DNS_API_TOKEN>"

# Deploy ExternalDNS (K3s HelmChart — K3s auto-applies HelmChart CRs)
kubectl apply -f external-dns.yaml
```

> **Note:** The Hetzner DNS API token is **different** from the Cloud API token.
> Create it at: https://dns.hetzner.com/ → API Tokens

Verify ExternalDNS is running:
```bash
kubectl get pods -n external-dns
kubectl logs -n external-dns deploy/external-dns --tail=20
```

## Verification

### Check LB status
```bash
kubectl get svc euroscale-vtgate-lb -n euroscale
# Should show EXTERNAL-IP populated
```

### Test DNS resolution
```bash
LB_IP=$(kubectl get svc euroscale-vtgate-lb -n euroscale -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "LB IP: $LB_IP"
nslookup vtgate.euroscale.app
```

### Test MySQL connectivity (from outside the cluster)
```bash
# Must reach the LB from your local machine or a VM with public internet
mysql -h vtgate.euroscale.app -P 3306 -u root -e "SHOW DATABASES;"
```

### Test gRPC API
```bash
grpcurl -plaintext vtgate.euroscale.app:50051 list
```

## Configuration Reference

### LoadBalancer Annotations

| Annotation | Value | Description |
|------------|-------|-------------|
| `load-balancer.hetzner.cloud/name` | `euroscale-vtgate` | Display name in Hetzner Cloud |
| `load-balancer.hetzner.cloud/location` | `nbg1` | Datacenter (match worker nodes) |
| `load-balancer.hetzner.cloud/type` | `lb11` | LB size (lb11/lb21/lb31) |
| `external-dns.alpha.kubernetes.io/hostname` | `vtgate.euroscale.app,*.euroscale.app` | DNS records to create |

### LB Types

| Type | Connections | Bandwidth | Price/mo |
|------|-------------|-----------|----------|
| lb11 | 20 | 100 Mbps each | ~€5.88 |
| lb21 | 200 | 200 Mbps each | ~€11.74 |
| lb31 | 2000 | 2 Gbps each | ~€23.48 |

Start with `lb11` for MVP (~5.88/mo), upgrade as traffic grows.

### Ports Exposed

| Port | Protocol | Target | Description |
|------|----------|--------|-------------|
| 3306 | TCP | 3306 (vtgate) | Standard MySQL connection |
| 3307 | TCP | 3306 (vtgate) | MySQL with SSL (TLS termination on vtgate) |
| 50051 | TCP | 50051 (vtgate) | gRPC API for the EuroScale control plane |

## Troubleshooting

### LB stays in `<pending>` state
1. Check CCM is running: `kubectl get pods -n kube-system | grep hcloud-ccm`
2. Check CCM logs: `kubectl logs -n kube-system deploy/hcloud-cloud-controller-manager`
3. Verify the `hcloud` secret has a valid token: `kubectl get secret hcloud -n kube-system`
4. Ensure your Hetzner project has Load Balancer quota available

### ExternalDNS not creating records
1. Check ExternalDNS logs: `kubectl logs -n external-dns deploy/external-dns --tail=50`
2. Verify `hetzner-token` secret exists in the `external-dns` namespace
3. Confirm the DNS zone `euroscale.app` exists in your Hetzner DNS Console
4. Check the Service has the correct annotation: `kubectl get svc -A -o json | jq '.items[] | select(.metadata.annotations["external-dns.alpha.kubernetes.io/hostname"]) | .metadata.name'`

### "Lost connection to MySQL server" from clients
1. Verify the LB health check passes: the vtgate pods must be Ready
2. Check firewall rules on the Hetzner LB (CCM auto-creates them, but verify)
3. Ensure vtgate pods are running: `kubectl get pods -n euroscale -l planetscale.com/component=vtgate`

## Next Steps

| Task | Description |
|------|-------------|
| TLS | Provision Let's Encrypt certs via cert-manager for TLS on port 3307/50051 |
| Connection Pooling | Deploy ProxySQL or pgBouncer equivalent for connection pooling |
| Monitoring | Add Prometheus ServiceMonitor for LB metrics |
| WAF/Firewall | Lock down LB to customer IP ranges only |
