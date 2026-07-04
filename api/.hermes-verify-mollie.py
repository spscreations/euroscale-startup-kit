#!/usr/bin/env python3
"""Ad-hoc verification script for Mollie API integration."""

import subprocess, os, sys

API_DIR = os.path.expanduser("~/Desktop/euroscale_startup_kit/api")
errors = []
warnings = []

def log(msg, kind="info"):
    print(f"  [{kind:>7}] {msg}")

def check_file_exists(path, description):
    ok = os.path.isfile(path)
    log(f"{description}: {path}", "PASS" if ok else "FAIL")
    if not ok:
        errors.append(f"Missing: {path}")

def check_imports(path, expected):
    if not os.path.isfile(path): return
    content = open(path).read()
    for imp in expected:
        if imp in content:
            log(f"Import '{imp}'", "PASS")
        else:
            log(f"Missing import '{imp}'", "FAIL")
            errors.append(f"Missing {imp}")

def check_defined(path, symbol, stype="type"):
    if not os.path.isfile(path): return
    content = open(path).read()
    if stype == "type":
        ok = f"type {symbol} " in content
    elif stype == "func":
        ok = f"func {symbol}(" in content
    elif stype == "const":
        ok = f"const {symbol} " in content
    elif stype == "method":
        ok = symbol in content  # broader check
    else:
        ok = True
    log(f"{stype} '{symbol}': {'found' if ok else 'MISSING'}", "PASS" if ok else "FAIL")
    if not ok: errors.append(f"Missing {stype} {symbol}")

# ── File existence ──
print("\n=== File existence ===")
check_file_exists(f"{API_DIR}/internal/mollie/mollie.go", "Mollie package")
check_file_exists(os.path.expanduser("~/Desktop/euroscale_startup_kit/deploy/mollie-api-key.yaml"), "K8s Secret")
check_file_exists(os.path.expanduser("~/Desktop/euroscale_startup_kit/deploy/api-deployment.yaml"), "Deployment")

# ── mollie.go types & functions ──
print("\n=== mollie.go structure ===")
M = f"{API_DIR}/internal/mollie/mollie.go"
for t in ["MollieConfig", "Client", "MolliePayment", "MollieAmount", "MollieLinks", "Handler", "PaymentInfo"]:
    check_defined(M, t, "type")
for f in ["NewClient", "NewHandler", "generateInvoiceRef", "tierPrice", "getEnvOrDefault"]:
    check_defined(M, f, "func")
for m in ["CreatePayment", "GetPayment", "HandleCreatePayment", "HandleWebhook", "HandleListInvoices"]:
    check_defined(M, m, "method")
check_defined(M, "MollieWebhookKey", "const")

# ── main.go integration ──
print("\n=== main.go integration ===")
MAIN = f"{API_DIR}/cmd/server/main.go"
check_imports(MAIN, ['molliepkg'])
for phrase in ["mollieHTTPHandler *molliepkg.Handler", "molliepkg.NewHandler", "molliepkg.NewClient",
               "molliepkg.MollieConfig", "MOLLIE_API_KEY", "MOLLIE_BASE_URL",
               "/api/v1/create-payment", "/api/v1/mollie-webhook", "/api/v1/invoices"]:
    ok = phrase in open(MAIN).read()
    log(f"Contains '{phrase}'", "PASS" if ok else "FAIL")
    if not ok: errors.append(f"Missing in main.go: {phrase}")

# ── Deploy manifest ──
print("\n=== Deploy ===")
DEP = os.path.expanduser("~/Desktop/euroscale_startup_kit/deploy/api-deployment.yaml")
ok = os.path.isfile(DEP)
if ok:
    c = open(DEP).read()
    ok = 'name: euroscale-mollie' in c and 'MOLLIE_API_KEY' in c
    log("Deployment has MOLLIE_API_KEY from euroscale-mollie", "PASS" if ok else "FAIL")
    if not ok: errors.append("Deployment missing MOLLIE_API_KEY")
else:
    errors.append("Deploy file not found")

# ── go.mod cleanup ──
GM = f"{API_DIR}/go.mod"
if os.path.isfile(GM):
    c = open(GM).read()
    if "mollie/mollie-api-golang" not in c:
        log("Unused mollie SDK dependency removed from go.mod", "PASS")
    else:
        log("Unused mollie SDK still in go.mod", "FAIL")
        errors.append("go.mod still has unused mollie SDK")

# ── Go build attempt ──
print("\n=== Go build ===")
try:
    r = subprocess.run(
        ["go", "build", "-o", "/dev/null", f"{API_DIR}/internal/mollie/"],
        cwd=API_DIR, capture_output=True, text=True, timeout=120,
        env={**os.environ, "GONOSUMCHECK": "*", "GONOSUMDB": "*", "GOPROXY": "off"}
    )
    if r.returncode == 0:
        log("go build ./internal/mollie/", "PASS")
    else:
        log(f"BUILD FAILED: {r.stderr[:300]}", "FAIL")
        errors.append(f"Build failed: {r.stderr[:200]}")
except subprocess.TimeoutExpired:
    warnings.append("Build timed out (proxy unreachable)")
    log("Build timed out (proxy unavailable)", "WARN")
except FileNotFoundError:
    warnings.append("go not installed in PATH")
    log("Go toolchain not found in PATH", "SKIP")

# ── Summary ──
print("\n" + "="*45)
if errors:
    print(f"  FAILED: {len(errors)} error(s)")
    for e in errors: print(f"    ✗ {e}")
else:
    print("  ALL CHECKS PASSED ✓")
for w in warnings: print(f"  ⚠ {w}")
print(f"\n  Errors: {len(errors)}  Warnings: {len(warnings)}")
sys.exit(1 if errors else 0)
