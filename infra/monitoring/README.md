# EuroScale Monitoring Stack

Prometheus + Grafana observability for the EuroScale K3s/Vitess platform.

## What's Deployed

| Component | Purpose | Access |
|-----------|---------|--------|
| **Prometheus** | Metrics collection, alerting rule evaluation | Port-forward or cluster-internal |
| **Grafana** | Dashboards, visualization, alerting UI | LoadBalancer IP (HTTP) |
| **Alertmanager** | Alert routing, deduplication, silencing | Cluster-internal |
| **kube-state-metrics** | Kubernetes object metrics (deployments, pods, nodes) | Scraped by Prometheus |
| **node-exporter** | Host-level metrics (CPU, memory, disk, network) | Scraped by Prometheus |
| **Vitess ServiceMonitors** | vtgate, vttablet, vtctld, vtbackup metrics | Applied via metrics.yaml |

All components run in the `monitoring` namespace.

## Deployment

```bash
./infra/monitoring/deploy.sh
```

Requirements:
- `kubectl` configured for the K3s cluster
- `helm` v3 installed
- Cluster has sufficient storage (see persistence settings below)

## Accessing Grafana

After deployment, Grafana is exposed via a LoadBalancer service:

```bash
# Get the Grafana URL
kubectl get svc -n monitoring kube-prometheus-stack-grafana

# Or port-forward if LoadBalancer isn't available
kubectl port-forward -n monitoring svc/kube-prometheus-stack-grafana 3000:80
```

**Credentials** are printed at the end of `deploy.sh`. To retrieve later:

```bash
kubectl get secret -n monitoring kube-prometheus-stack-grafana \
  -o jsonpath='{.data.admin-password}' | base64 -d && echo
```

## Checking Prometheus Targets

```bash
# Port-forward Prometheus
kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090

# Open http://localhost:9090/targets
# All Vitess targets should show State: UP
```

Targets to expect:
- `serviceMonitor/monitoring/kube-prometheus-stack-kubelet/*`
- `serviceMonitor/monitoring/kube-prometheus-stack-node-exporter`
- `serviceMonitor/monitoring/kube-prometheus-stack-kube-state-metrics`
- `serviceMonitor/monitoring/vitess-metrics-vtgate`
- `serviceMonitor/monitoring/vitess-metrics-vttablet`
- `serviceMonitor/monitoring/vitess-metrics-vtctld`

## Key Alerts Configured

The kube-prometheus-stack ships with these alert groups out of the box:

| Alert Group | Example Alerts |
|-------------|---------------|
| **KubeNodeNotReady** | Node has been unready for > 15 min |
| **KubePodCrashLooping** | Pod in CrashLoopBackOff for > 15 min |
| **KubeCPUOvercommit** | Cluster CPU overcommit > 150% |
| **KubeMemoryOvercommit** | Cluster memory overcommit > 150% |
| **KubePersistentVolumeFillingUp** | PV > 85% full, predicted to fill within 4 days |
| **NodeFilesystemAlmostOutOfSpace** | Node filesystem > 90% |
| **PrometheusNotConnectedToAlertmanager** | Prometheus can't reach Alertmanager |

To view all alerts:
```bash
kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090
# Open http://localhost:9090/alerts
```

To add Vitess-specific alerts, edit the PrometheusRule CRDs or add custom rules
to the `monitoring` namespace.

## Dashboard Import

See [vitess-dashboard.json](./vitess-dashboard.json) for instructions on importing
the official Vitess Grafana dashboards (Cluster Overview, VTTables, Query metrics).

## Persistence

| Component | Size | Notes |
|-----------|------|-------|
| Grafana | 10 Gi | Dashboards, users, orgs |
| Prometheus | 20 Gi | 15-day retention |
| Alertmanager | 5 Gi | Silences, notification logs |

Adjust sizes in `deploy.sh` before running.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Grafana shows no data | Verify Prometheus targets are UP |
| LoadBalancer IP pending | Use port-forward instead; check MetalLB/Cilium LB |
| Vitess targets missing | Verify vtgate/vttablet pods are running; re-run `kubectl apply -f metrics.yaml` |
| Helm install fails | `helm list -n monitoring`; `helm uninstall` then retry |
| Password lost | See "Accessing Grafana" section above |

## Uninstall

```bash
helm uninstall kube-prometheus-stack -n monitoring
kubectl delete namespace monitoring
```
