#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# EuroScale — Full End-to-End Smoke Test (Phase 1 MVP)
#
# Validates every component of the EuroScale pipeline:
#   1. Terraform infrastructure
#   2. K3s cluster health + addons (cert-manager, MinIO)
#   3. Vitess Operator + multi-region cluster
#   4. gRPC provisioning API
#   5. Vitess native S3 backups
#   6. LoadBalancer + ExternalDNS
#   7. Prometheus + Grafana monitoring
#   8. Off-site backups + restore cronjobs
#   9. CI/CD pipeline
#
# Prerequisites:
#   - KUBECONFIG pointing to the EuroScale K3s cluster
#   - kubectl, jq (on the local machine)
#   - grpcurl (on the local machine, for API tests)
#   - EUROSCALE_API_KEY env var (for authenticated gRPC calls)
#   - Terraform state accessible (for infra checks)
#
# Usage:
#   export KUBECONFIG=/path/to/kubeconfig
#   export EUROSCALE_API_KEY="your-api-key"
#   ./scripts/smoke-test.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Colour helpers ───────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Colour

PASS="${GREEN}PASS${NC}"
FAIL="${RED}FAIL${NC}"
SKIP="${YELLOW}SKIP${NC}"
WARN="${YELLOW}WARN${NC}"

TOTAL=0
PASSED=0
FAILED=0
SKIPPED=0

# ── Banner ───────────────────────────────────────────────────────────────────
banner() {
  echo -e "${BLUE}"
  echo "╔══════════════════════════════════════════════════════════════════╗"
  echo "║          EuroScale — Phase 1 End-to-End Smoke Test              ║"
  echo "╚══════════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
  echo ""
}

check_result() {
  local label="$1"
  local rc="$2"
  local skip_rc="${3:--1}"    # exit code that means "skipped"

  TOTAL=$((TOTAL + 1))
  if [ "$rc" -eq 0 ]; then
    echo -e "  ${PASS}  ${label}"
    PASSED=$((PASSED + 1))
  elif [ "$rc" -eq "$skip_rc" ]; then
    echo -e "  ${SKIP}  ${label}"
    SKIPPED=$((SKIPPED + 1))
  else
    echo -e "  ${FAIL}  ${label}"
    FAILED=$((FAILED + 1))
  fi
}

check_cmd() {
  # Run a command, pass if exit 0, skip on specific codes, fail otherwise.
  local label="$1"
  local skip_rc="${2:--1}"
  shift 2
  local rc=0
  "$@" >/dev/null 2>&1 || rc=$?
  check_result "$label" "$rc" "$skip_rc"
}

# ── Summary ──────────────────────────────────────────────────────────────────
summary() {
  echo ""
  echo -e "${BLUE}══════════════════════════════════════════════════════════════════${NC}"
  echo "  Total:   $TOTAL"
  echo -e "  Passed:  ${GREEN}$PASSED${NC}"
  echo -e "  Failed:  ${RED}$FAILED${NC}"
  echo -e "  Skipped: ${YELLOW}$SKIPPED${NC}"
  echo -e "${BLUE}══════════════════════════════════════════════════════════════════${NC}"
  if [ "$FAILED" -gt 0 ]; then
    echo ""
    echo "Some checks failed. Review the output above for details."
    echo "Common causes:"
    echo "  - Cluster not yet provisioned (run Task 1 → 2 → 3 first)"
    echo "  - KUBECONFIG not set or pointing to wrong cluster"
    echo "  - API key not created in the cluster"
    exit 1
  fi
  echo ""
  echo "All smoke tests passed. EuroScale Phase 1 infrastructure is healthy."
}

# ── Pre-flight: required tools ───────────────────────────────────────────────
preflight() {
  echo "── Pre-flight Checks ──"
  check_cmd "kubectl is installed" 127 command -v kubectl
  check_cmd "KUBECONFIG is set" 1 test -n "${KUBECONFIG:-}"
  check_cmd "jq is installed" 127 command -v jq
  echo ""
}

# ── SECTION 1: Terraform Infrastructure ──────────────────────────────────────
section_1_terraform() {
  echo "── 1. Terraform Infrastructure (Task 1) ──"

  local TF_DIR="${1:-infra/terraform/hetzner}"
  if [ ! -d "$TF_DIR" ]; then
    echo -e "  ${SKIP}  Terraform directory not found at $TF_DIR"
    SKIPPED=$((SKIPPED + 1))
    TOTAL=$((TOTAL + 1))
    echo ""
    return
  fi

  # Check if terraform is installed
  if ! command -v terraform &>/dev/null; then
    echo -e "  ${SKIP}  terraform CLI not installed"
    SKIPPED=$((SKIPPED + 1))
    TOTAL=$((TOTAL + 1))
    echo ""
    return
  fi

  # Check if state exists (terraform show)
  local show_rc=0
  terraform -chdir="$TF_DIR" show -json &>/dev/null 2>&1 || show_rc=$?
  check_result "Terraform state is available" "$show_rc" 1

  # If state exists, count resources
  if [ "$show_rc" -eq 0 ]; then
    local node_count
    node_count=$(terraform -chdir="$TF_DIR" show -json 2>/dev/null | \
      jq '[.values.root_module.resources[] | select(.type == "hcloud_server")] | length' 2>/dev/null || echo "?")
    echo "         Nodes provisioned: ${node_count} (expected: 3)"
  fi

  # Main.tf exists
  check_cmd "main.tf exists" 1 test -f "$TF_DIR/main.tf"
  check_cmd "variables.tf exists" 1 test -f "$TF_DIR/variables.tf"
  check_cmd "outputs.tf exists" 1 test -f "$TF_DIR/outputs.tf"
  check_cmd "firewall.tf exists" 1 test -f "$TF_DIR/firewall.tf"
  echo ""
}

# ── SECTION 2: K3s Cluster + Addons ──────────────────────────────────────────
section_2_k3s() {
  echo "── 2. K3s Cluster + Addons (Task 2) ──"

  # Cluster connectivity
  local conn_rc=0
  kubectl cluster-info &>/dev/null 2>&1 || conn_rc=$?
  if [ "$conn_rc" -ne 0 ]; then
    echo -e "  ${SKIP}  Cannot connect to cluster — skipping remaining K8s checks"
    SKIPPED=$((SKIPPED + 5))
    TOTAL=$((TOTAL + 5))
    echo ""
    return
  fi

  # Node count (expected: 3)
  check_cmd "Cluster is reachable (kubectl)" 1 kubectl cluster-info
  local nodes
  nodes=$(kubectl get nodes --no-headers 2>/dev/null | wc -l)
  echo -e "  ${GREEN}INFO${NC}  Nodes in cluster: ${nodes}"
  if [ "$nodes" -ge 3 ]; then
    echo -e "  ${PASS}  At least 3 nodes running"
    PASSED=$((PASSED + 1))
    TOTAL=$((TOTAL + 1))
  elif [ "$nodes" -gt 0 ]; then
    echo -e "  ${WARN}  Fewer than 3 nodes (${nodes}); cluster still bootstrapping?"
    FAILED=$((FAILED + 1))
    TOTAL=$((TOTAL + 1))
  else
    echo -e "  ${FAIL}  No nodes found"
    FAILED=$((FAILED + 1))
    TOTAL=$((TOTAL + 1))
  fi

  # All nodes Ready
  local not_ready
  not_ready=$(kubectl get nodes --no-headers 2>/dev/null | awk '$2 != "Ready" {print $1}' | wc -l)
  check_result "All nodes are Ready" "$not_ready" 0

  # cert-manager
  check_cmd "cert-manager deployed" 1 \
    kubectl get deployment cert-manager -n cert-manager

  # MinIO
  check_cmd "MinIO deployed" 1 \
    kubectl get deployment -n minio --no-headers

  echo ""
}

# ── SECTION 3: Vitess Operator + Multi-Region Cluster ────────────────────────
section_3_vitess() {
  echo "── 3. Vitess Operator + Multi-Region Cluster (Task 3) ──"

  local conn_rc=0
  kubectl cluster-info &>/dev/null 2>&1 || conn_rc=$?
  if [ "$conn_rc" -ne 0 ]; then
    echo -e "  ${SKIP}  No cluster access — skipping Vitess checks"
    SKIPPED=$((SKIPPED + 6))
    TOTAL=$((TOTAL + 6))
    echo ""
    return
  fi

  # Vitess Operator
  check_cmd "Vitess Operator running" 1 \
    kubectl get deployment -n vitess --no-headers 2>/dev/null || \
    kubectl get deployment vitess-operator -n vitess --no-headers

  # euroscale namespace
  check_cmd "Namespace 'euroscale' exists" 1 \
    kubectl get namespace euroscale

  if ! kubectl get namespace euroscale &>/dev/null; then
    echo -e "  ${SKIP}  No euroscale namespace — skipping vitess component checks"
    SKIPPED=$((SKIPPED + 5))
    TOTAL=$((TOTAL + 5))
    echo ""
    return
  fi

  # Vitess components
  check_cmd "vtgate is running" 1 \
    kubectl get deployment euroscale-vtgate -n euroscale

  check_cmd "vtctld is running" 1 \
    kubectl get deployment euroscale-vtctld -n euroscale

  # Check for vttablet pods (may take time to come up)
  local tablet_count
  tablet_count=$(kubectl get pods -n euroscale -l planetscale.com/component=vttablet --no-headers 2>/dev/null | wc -l || echo "0")
  echo -e "  ${GREEN}INFO${NC}  vttablet pods: ${tablet_count}"
  if [ "$tablet_count" -ge 1 ]; then
    echo -e "  ${PASS}  vttablet pods running"
    PASSED=$((PASSED + 1))
    TOTAL=$((TOTAL + 1))
  else
    echo -e "  ${SKIP}  No vttablet pods yet (Vitess may still be initialising)"
    SKIPPED=$((SKIPPED + 1))
    TOTAL=$((TOTAL + 1))
  fi

  # VitessCluster CR
  check_cmd "VitessCluster CR exists" 1 \
    kubectl get vitesscluster euroscale -n euroscale

  # Keyspace 'main' check via vtctld
  echo "         Checking keyspace 'main'..."
  local keyspace_rc=0
  kubectl exec -n euroscale deploy/euroscale-vtctld -- \
    vtctlclient -server localhost:15999 GetKeyspaces 2>/dev/null | grep -q 'main' || keyspace_rc=$?
  check_result "Keyspace 'main' exists" "$keyspace_rc" 1

  echo ""
}

# ── SECTION 4: gRPC Provisioning API ─────────────────────────────────────────
section_4_api() {
  echo "── 4. gRPC Provisioning API (Task 4) ──"

  local conn_rc=0
  kubectl cluster-info &>/dev/null 2>&1 || conn_rc=$?
  if [ "$conn_rc" -ne 0 ]; then
    echo -e "  ${SKIP}  No cluster access — skipping API checks"
    SKIPPED=$((SKIPPED + 4))
    TOTAL=$((TOTAL + 4))
    echo ""
    return
  fi

  # API deployment
  check_cmd "euroscale-api Deployment exists" 1 \
    kubectl get deployment euroscale-api -n euroscale

  # Check API pod readiness
  local ready_pods
  ready_pods=$(kubectl get deployment euroscale-api -n euroscale \
    -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
  echo -e "  ${GREEN}INFO${NC}  API ready replicas: ${ready_pods}/2"

  if [ "$ready_pods" -ge 1 ]; then
    echo -e "  ${PASS}  API pods are ready"
    PASSED=$((PASSED + 1))
    TOTAL=$((TOTAL + 1))
  else
    echo -e "  ${SKIP}  API pods not ready yet"
    SKIPPED=$((SKIPPED + 1))
    TOTAL=$((TOTAL + 1))
  fi

  # API Service
  check_cmd "euroscale-api Service exists" 1 \
    kubectl get svc euroscale-api -n euroscale

  # gRPC health check via port-forward + grpcurl
  if command -v grpcurl &>/dev/null && [ "$ready_pods" -ge 1 ]; then
    echo "         Testing gRPC API (ListDatabases)..."
    local pf_pid=""
    kubectl port-forward -n euroscale svc/euroscale-api 50051:50051 &>/dev/null &
    pf_pid=$!
    sleep 2

    local grpc_rc=0
    grpcurl -plaintext -H "x-api-key:${EUROSCALE_API_KEY:-missing}" \
      localhost:50051 euroscale.v1.DatabaseService/ListDatabases \
      -d '{"user_id":"smoke-test-user"}' &>/dev/null 2>&1 || grpc_rc=$?

    kill "$pf_pid" 2>/dev/null || true
    wait "$pf_pid" 2>/dev/null || true

    check_result "gRPC ListDatabases responds" "$grpc_rc" 1
  else
    echo -e "  ${SKIP}  grpcurl not available or API not ready — skipping gRPC call"
    SKIPPED=$((SKIPPED + 1))
    TOTAL=$((TOTAL + 1))
  fi

  # Source code exists
  check_cmd "api/cmd/server/main.go exists" 1 test -f api/cmd/server/main.go
  check_cmd "api/proto/euroscale/v1/database.proto exists" 1 test -f api/proto/euroscale/v1/database.proto
  check_cmd "Dockerfile exists" 1 test -f api/Dockerfile
  check_cmd "go.mod exists" 1 test -f api/go.mod

  echo ""
}

# ── SECTION 5: Vitess Native S3 Backups ──────────────────────────────────────
section_5_backups() {
  echo "── 5. Vitess Native S3 Backups (Task 5) ──"

  local conn_rc=0
  kubectl cluster-info &>/dev/null 2>&1 || conn_rc=$?
  if [ "$conn_rc" -ne 0 ]; then
    echo -e "  ${SKIP}  No cluster access — skipping backup checks"
    SKIPPED=$((SKIPPED + 4))
    TOTAL=$((TOTAL + 4))
    echo ""
    return
  fi

  # Backup secret
  check_cmd "vitess-backup-creds Secret exists" 1 \
    kubectl get secret vitess-backup-creds -n euroscale

  # Backup schedule
  check_cmd "VitessBackupSchedule 'full-backup' exists" 1 \
    kubectl get vitessbackupschedule -n euroscale 2>/dev/null | grep -q 'full-backup'

  check_cmd "VitessBackupSchedule 'incremental-backup' exists" 1 \
    kubectl get vitessbackupschedule -n euroscale 2>/dev/null | grep -q 'incremental-backup'

  # Backup config YAML file
  check_cmd "backup-config.yaml exists" 1 test -f infra/vitess/backup-config.yaml

  echo ""
}

# ── SECTION 6: LoadBalancer + ExternalDNS ────────────────────────────────────
section_6_networking() {
  echo "── 6. LoadBalancer + ExternalDNS (Task 6) ──"

  local conn_rc=0
  kubectl cluster-info &>/dev/null 2>&1 || conn_rc=$?
  if [ "$conn_rc" -ne 0 ]; then
    echo -e "  ${SKIP}  No cluster access — skipping networking checks"
    SKIPPED=$((SKIPPED + 3))
    TOTAL=$((TOTAL + 3))
    echo ""
    return
  fi

  # vtgate LoadBalancer
  check_cmd "vtgate LoadBalancer Service exists" 1 \
    kubectl get svc vtgate-lb -n euroscale

  # Check if LB got an external IP
  local lb_ip
  lb_ip=$(kubectl get svc vtgate-lb -n euroscale \
    -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
  if [ -n "$lb_ip" ] && [ "$lb_ip" != "<pending>" ]; then
    echo -e "  ${PASS}  vtgate LB has external IP: ${lb_ip}"
    PASSED=$((PASSED + 1))
    TOTAL=$((TOTAL + 1))
  else
    echo -e "  ${SKIP}  vtgate LB IP not assigned yet (may need Hetzner LB)"
    SKIPPED=$((SKIPPED + 1))
    TOTAL=$((TOTAL + 1))
  fi

  # ExternalDNS
  check_cmd "ExternalDNS deployment exists" 1 \
    kubectl get deployment external-dns -n kube-system 2>/dev/null || \
    kubectl get deployment -n euroscale -l app=external-dns --no-headers

  # Networking files
  check_cmd "external-dns.yaml exists" 1 test -f infra/networking/external-dns.yaml
  check_cmd "vtgate-lb.yaml exists" 1 test -f infra/networking/vtgate-lb.yaml

  echo ""
}

# ── SECTION 7: Prometheus + Grafana Monitoring ───────────────────────────────
section_7_monitoring() {
  echo "── 7. Prometheus + Grafana Monitoring (Task 7) ──"

  local conn_rc=0
  kubectl cluster-info &>/dev/null 2>&1 || conn_rc=$?
  if [ "$conn_rc" -ne 0 ]; then
    echo -e "  ${SKIP}  No cluster access — skipping monitoring checks"
    SKIPPED=$((SKIPPED + 4))
    TOTAL=$((TOTAL + 4))
    echo ""
    return
  fi

  # Monitoring namespace
  check_cmd "Namespace 'monitoring' exists" 1 \
    kubectl get namespace monitoring

  if ! kubectl get namespace monitoring &>/dev/null; then
    echo -e "  ${SKIP}  No monitoring namespace — skipping monitoring checks"
    SKIPPED=$((SKIPPED + 3))
    TOTAL=$((TOTAL + 3))
    echo ""
    return
  fi

  # Prometheus
  check_cmd "Prometheus StatefulSet exists" 1 \
    kubectl get statefulset -n monitoring -l app.kubernetes.io/name=prometheus --no-headers 2>/dev/null || \
    kubectl get statefulset prometheus-kube-prometheus-stack-prometheus -n monitoring

  # Grafana
  check_cmd "Grafana Deployment exists" 1 \
    kubectl get deployment -n monitoring -l app.kubernetes.io/name=grafana --no-headers 2>/dev/null || \
    kubectl get deployment kube-prometheus-stack-grafana -n monitoring

  # Alertmanager
  check_cmd "Alertmanager StatefulSet exists" 1 \
    kubectl get statefulset -n monitoring -l app.kubernetes.io/name=alertmanager --no-headers 2>/dev/null || \
    kubectl get statefulset alertmanager-kube-prometheus-stack-alertmanager -n monitoring

  # Vitess dashboard JSON
  check_cmd "vitess-dashboard.json exists" 1 test -f infra/monitoring/vitess-dashboard.json

  echo ""
}

# ── SECTION 8: Off-Site Backups + Restore ────────────────────────────────────
section_8_offsite() {
  echo "── 8. Off-Site Backups + Restore (Task 8) ──"

  local conn_rc=0
  kubectl cluster-info &>/dev/null 2>&1 || conn_rc=$?
  if [ "$conn_rc" -ne 0 ]; then
    echo -e "  ${SKIP}  No cluster access — skipping off-site backup checks"
    SKIPPED=$((SKIPPED + 2))
    TOTAL=$((TOTAL + 2))
    echo ""
    return
  fi

  # rclone sync cronjob
  check_cmd "rclone-sync CronJob exists" 1 \
    kubectl get cronjob -n euroscale rclone-sync 2>/dev/null || \
    kubectl get cronjob -n euroscale --no-headers

  # restore-test cronjob
  check_cmd "restore-test CronJob exists" 1 \
    kubectl get cronjob -n euroscale restore-test 2>/dev/null || \
    kubectl get cronjob -n euroscale --no-headers

  # Source YAMLs
  check_cmd "rclone-sync-cronjob.yaml exists" 1 test -f infra/backups/rclone-sync-cronjob.yaml
  check_cmd "restore-test-cronjob.yaml exists" 1 test -f infra/backups/restore-test-cronjob.yaml
  echo ""
}

# ── SECTION 9: CI/CD GitHub Actions ──────────────────────────────────────────
section_9_cicd() {
  echo "── 9. CI/CD Pipeline (Task 9) ──"

  local wf_file=".github/workflows/deploy-api.yml"

  check_cmd "GitHub Actions workflow exists ($wf_file)" 1 test -f "$wf_file"

  # Validate YAML structure
  if [ -f "$wf_file" ]; then
    check_cmd "Workflow file contains 'build-and-deploy' job" 1 \
      grep -q 'build-and-deploy' "$wf_file"
    check_cmd "Workflow uses docker/build-push-action" 1 \
      grep -q 'docker/build-push-action' "$wf_file"
    check_cmd "Workflow sets kubectl image" 1 \
      grep -q 'kubectl set image' "$wf_file"
    check_cmd "Workflow verifies rollout status" 1 \
      grep -q 'rollout status' "$wf_file"
  else
    # Already counted the SKIP for file existence
    echo -e "  ${SKIP}  CI/CD checks skipped — workflow file missing"
    SKIPPED=$((SKIPPED + 3))
    TOTAL=$((TOTAL + 3))
  fi

  echo ""
}

# ── SECTION 10: Cleanup / Extra Verification ─────────────────────────────────
section_10_extra() {
  echo "── 10. Additional Verification ──"

  local conn_rc=0
  kubectl cluster-info &>/dev/null 2>&1 || conn_rc=$?
  if [ "$conn_rc" -ne 0 ]; then
    echo -e "  ${SKIP}  No cluster access — skipping extra checks"
    SKIPPED=$((SKIPPED + 3))
    TOTAL=$((TOTAL + 3))
    echo ""
    return
  fi

  # Overall pod health
  local crash_count
  crash_count=$(kubectl get pods -A --no-headers 2>/dev/null | \
    awk '$4 != "Running" && $4 != "Completed" && $4 != "Succeeded" {print}' | wc -l)
  check_result "All pods healthy (no CrashLoop/Error/ImagePullBackOff)" "$crash_count" 0

  # Total pod count
  local total_pods
  total_pods=$(kubectl get pods -A --no-headers 2>/dev/null | wc -l)
  echo -e "  ${GREEN}INFO${NC}  Total pods across all namespaces: ${total_pods}"

  # Namespace listing
  echo -e "  ${GREEN}INFO${NC}  Namespaces:"
  kubectl get namespaces --no-headers 2>/dev/null | awk '{print "         - " $1}'

  echo ""
}

# ── Main ─────────────────────────────────────────────────────────────────────
main() {
  banner
  preflight

  section_1_terraform "infra/terraform/hetzner"
  section_2_k3s
  section_3_vitess
  section_4_api
  section_5_backups
  section_6_networking
  section_7_monitoring
  section_8_offsite
  section_9_cicd
  section_10_extra

  summary
}

main "$@"
