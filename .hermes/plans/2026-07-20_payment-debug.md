# Payment Debug Plan — "failed to create payment"

**Date**: 2026-07-20  
**Bug**: User clicks Upgrade on `/dashboard/billing`, sees toast "failed to create payment". No Mollie payment is created.

---

## 1. Complete Flow Trace

### 1.1 Frontend (Dashboard)

| Step | File | Line | What Happens |
|------|------|------|-------------|
| 1a | `dashboard/src/app/dashboard/billing/page.tsx` | 243–260 | `handleUpgrade(tier)` calls `createPayment(tier)` from hook |
| 1b | `dashboard/src/hooks/useCreatePayment.ts` | 16–45 | POST to `${API_BASE_URL}/api/v1/create-payment` |
| 1c | `dashboard/src/lib/constants.ts` | 3 | `API_BASE_URL = "/api/rest"` (hardcoded) |
| 1d | Creates URL: |  | **`/api/rest/api/v1/create-payment`** |

### 1.2 Next.js BFF Proxy

| Step | File | Line | What Happens |
|------|------|------|-------------|
| 2a | `dashboard/src/app/api/rest/[...path]/route.ts` | 27–29 | Matched by catch-all dynamic route; `segs = ["api","v1","create-payment"]` |
| 2b | Same file | 35 | Reads Better Auth session from cookie |
| 2c | Same file | 66–70 | Generates internal JWT (`HS256`) with `user_id`, `email`, `role`, 5-min expiry |
| 2d | Same file | 5, 74 | Forwards to `https://api.euroscale.app/api/v1/create-payment` with JWT as `Authorization: Bearer ...` |

### 1.3 Go Backend (API)

| Step | File | Line | What Happens |
|------|------|------|-------------|
| 3a | `api/cmd/server/main.go` | 1813 | Route registered: `withHTTPAuth(jwtSecret, mollieHTTPHandler.HandleCreatePayment)` |
| 3b | Same file | 1958–1979 | `withHTTPAuth` validates JWT Bearer token, extracts `user_id`, injects into context |
| 3c | `api/internal/mollie/mollie.go` | 283–386 | `HandleCreatePayment` handler |
| 3d | Lines 289–293 | Checks `userID != ""` (the JWT-authenticated user) |
| 3e | Lines 295–299 | Checks `h.client != nil` — 503 if Mollie not configured |
| 3f | Lines 311–322 | Parses body `{email, tier}`, validates both present |
| 3g | Lines 327–332 | Validates tier exists in `tiers.GetTier(req.Tier)` |
| 3h | Lines 335–341 | Maps tier to price via `tierPrice()`: scale=29.0, team=99.0, business=399.0 |
| 3i | Lines 343–345 | Builds Mollie URLs from env or defaults |
| 3j | **Lines 349–365** | **Calls `h.client.CreatePayment(...)` — this is where it fails** |
| 3k | Lines 359–364 | On failure: logs `ERROR: Mollie create payment failed: %v`, **returns 500 `{"message": "failed to create payment"}`** |

### 1.4 Mollie HTTP Client

| Step | File | Line | What Happens |
|------|------|------|-------------|
| 4a | `api/internal/mollie/mollie.go` | 80–118 | `CreatePayment` builds payload with `amount`, `description`, `redirectUrl`, `webhookUrl`, `metadata` |
| 4b | Same file | 137–177 | `do()` sends HTTP request to Mollie API |
| 4c | Lines 154–157 | Sets `Authorization: Bearer <MOLLIE_API_KEY>` |
| 4d | Lines 172–174 | **On non-2xx status: returns `mollie: unexpected status %d: %s`** — this contains Mollie's raw error body |

### 1.5 Error Chain (User → Toast)

```
HandleCreatePayment:  h.client.CreatePayment() fails
  ↓
  return 500 {"message": "failed to create payment"}   (line 361-363)
  ↓
  Go HTTP server returns 500 + JSON body
  ↓
  Next.js BFF proxy forwards 500 + body to frontend
  ↓
  useCreatePayment.ts: res.ok=false → body.message = "failed to create payment"
  ↓
  billing/page.tsx:  toast.error(err.message) → user sees "failed to create payment"
```

**Critical issue**: The REAL Mollie error (e.g. "401 Unauthorized" or "422 validation error") is logged server-side but **never exposed to the user**. The generic "failed to create payment" message makes root-cause diagnosis impossible from the frontend.

---

## 2. Root Cause Hypotheses (ordered by likelihood)

### Hypothesis 1: Invalid or misconfigured Mollie API key ⭐ MOST LIKELY

**Evidence**:
- `MOLLIE_API_KEY` IS set (otherwise handlers would be disabled — main.go:1819 logs `"MOLLIE_API_KEY not set — Mollie payment handlers disabled"`)
- Mollie API returns non-2xx on payment creation
- The `do()` function (mollie.go:172-174) returns: `mollie: unexpected status %d: %s`

**What to check**:
```bash
# Verify the K8s secret exists and has the api_key
kubectl get secret euroscale-mollie -n euroscale -o jsonpath='{.data.api_key}' | base64 -d | head -c 20 ; echo

# Check if the key prefix is correct: test_... (test mode) or live_... (live mode)
# Keys look like: test_xxxxxxxxxxxxxxxx or live_xxxxxxxxxxxxxxxx

# Check API pod logs for the raw Mollie error
kubectl logs -n euroscale -l component=api --tail=100 | grep -i "mollie.*failed"
```

**Fix**: Update the `euroscale-mollie` K8s secret with the correct Mollie API key:
```bash
kubectl create secret generic euroscale-mollie \
  --namespace euroscale \
  --from-literal=api_key=<YOUR_CORRECT_KEY> \
  --from-literal=webhook_secret=<YOUR_WEBHOOK_SECRET> \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl rollout restart deployment/euroscale-api -n euroscale
```

### Hypothesis 2: Mollie API key wrong environment (test vs live)

Mollie has separate test and live API keys. If the dashboard connects to the live API but uses a test key (or vice versa), Mollie rejects with 401.

**Check**: The API key prefix in the K8s secret:
- `test_` → only works with test Mollie API
- `live_` → only works with live Mollie API

**Fix**: Use the correct key type matching the `MOLLIE_BASE_URL` (line 344, hardcoded to `https://api.mollie.com` — the live endpoint).

### Hypothesis 3: Mollie account not activated

New Mollie accounts require business verification (KYC). Until activated, the API returns errors on payment creation even with a valid key.

**Check**: Log into the Mollie Dashboard → Check account status under Settings → Organization. Look for pending verification steps.

**Status codes**:
- 401 → invalid key
- 403 → account not activated, or wrong profile
- 422 → validation error (see body for details)

### Hypothesis 4: Invalid redirect or webhook URLs

Default URLs (mollie.go:344-345):
```go
redirectURL = "https://euroscale.app/dashboard/billing?payment=success"  // MOLLIE_REDIRECT_URL
webhookURL  = "https://api.euroscale.app/api/v1/mollie-webhook"          // MOLLIE_WEBHOOK_URL
```

If `api.euroscale.app` is not publicly reachable (DNS, firewall, ingress), Mollie may reject the webhook URL. However, Mollie typically doesn't validate webhook reachability at payment creation time — it just needs a valid URL format.

**Check**: Verify the domains are correct and publicly reachable from Mollie's servers.

### Hypothesis 5: Network connectivity from API pod to Mollie

The Go API server (in K3s/Hetzner) must reach `api.mollie.com` on port 443.

**Check**:
```bash
kubectl exec -n euroscale deployment/euroscale-api -- \
  sh -c 'wget -q -O- --timeout=10 https://api.mollie.com/v2/payments/test || echo "CONNECTION FAILED"'
```

If this fails, check:
- Pod egress (NetworkPolicy, Istio, Calico)
- DNS resolution inside pod
- TLS/certificate trust

### Hypothesis 6: Rate limiting by Mollie

If multiple payment creation attempts happen rapidly, Mollie may rate-limit.

**Check**: Look for HTTP 429 status in the logged error. Mollie's error body would include `"status":429`.

### Hypothesis 7: Request payload validation

Mollie could reject the payment creation due to:
- Invalid amount format (but we use `"29.00"` — correct for EUR)
- Missing `description` (always present: `"EuroScale Scale tier — monthly"`)
- Invalid `redirectUrl` format (if env var overrides are malformed)

**Check**: Verify `MOLLIE_REDIRECT_URL` and `MOLLIE_WEBHOOK_URL` env vars are valid HTTPS URLs if set.

---

## 3. Exact Files and Lines Involved

### Frontend
| File | Lines | Role |
|------|-------|------|
| `dashboard/src/app/dashboard/billing/page.tsx` | 243–260 | Upgrade click handler |
| `dashboard/src/hooks/useCreatePayment.ts` | 16–45 | API call + error parsing |
| `dashboard/src/lib/constants.ts` | 3 | `API_BASE_URL = "/api/rest"` |
| `dashboard/src/lib/auth.tsx` | 29–38 | Session shape (`id`, `email`) |
| `dashboard/src/app/api/rest/[...path]/route.ts` | 1–88 | BFF proxy — generates JWT, forwards to Go backend |

### Backend
| File | Lines | Role |
|------|-------|------|
| `api/cmd/server/main.go` | 1696–1720 | Mollie client init from env vars |
| `api/cmd/server/main.go` | 1812–1820 | Route registration |
| `api/cmd/server/main.go` | 1954–1979 | `withHTTPAuth` — JWT validation |
| `api/internal/mollie/mollie.go` | 80–118 | `CreatePayment` — builds Mollie payload |
| `api/internal/mollie/mollie.go` | 137–177 | `do()` — raw HTTP call to Mollie |
| `api/internal/mollie/mollie.go` | 283–386 | `HandleCreatePayment` — HTTP handler |
| **`api/internal/mollie/mollie.go`** | **359–364** | **Error returned to user** |
| `api/internal/mollie/mollie.go` | 760–772 | `tierPrice()` — price mapping |

### Config
| File | Lines | Role |
|------|-------|------|
| `deploy/api-deployment.yaml` | 99–109 | `MOLLIE_API_KEY` + `MOLLIE_WEBHOOK_SECRET` from K8s secret |
| `infra/secrets/mollie-secret.yaml` | 1–34 | Template for Mollie K8s secret |
| `deploy/dashboard-deployment.yaml` | 38–38 | `BETTER_AUTH_SECRET` for JWT signing |

---

## 4. Immediate Diagnostic Steps

### Step 1: Read the actual Mollie error from API logs
```bash
# This is the SINGLE most important command — it reveals Mollie's real rejection reason
kubectl logs -n euroscale -l component=api --tail=200 | grep -i "mollie.*create\|mollie.*failed\|mollie.*unexpected"
```

The logged error will look like:
```
ERROR: Mollie create payment failed: mollie: failed to create payment: mollie: unexpected status 401: {"status":401,"title":"Unauthorized Request",...}
```

The **status code and body** tell you exactly what's wrong.

### Step 2: Verify Mollie API key manually
```bash
# From any machine with curl:
curl -s -H "Authorization: Bearer <YOUR_MOLLIE_API_KEY>" \
  https://api.mollie.com/v2/payments/test
```

A successful response means the key works. A 401 means the key is invalid.

### Step 3: Check if the key was recently rotated
```bash
kubectl describe secret euroscale-mollie -n euroscale | grep -i "age\|creation"
```

### Step 4: Verify API pod env injection
```bash
kubectl exec -n euroscale deployment/euroscale-api -- env | grep MOLLIE
```

### Step 5: Reproduce and capture the full error
- Open browser DevTools → Network tab
- Click Upgrade on billing page
- Look at the POST to `/api/rest/api/v1/create-payment`
- Check the response (500 + body: `{"message":"failed to create payment"}`)
- Simultaneously tail API logs: `kubectl logs -n euroscale -l component=api -f | grep -i mollie`

---

## 5. Proposed Fixes

### Fix A: Return detailed Mollie error to client (Critical for debugging)

**File**: `api/internal/mollie/mollie.go`, lines 359–364

**Current code**:
```go
if err != nil {
    log.Printf("ERROR: Mollie create payment failed: %v", err)
    writeJSON(w, http.StatusInternalServerError, map[string]string{
        "message": "failed to create payment",
    })
    return
}
```

**Proposed change**: Return a safe subset of the error without leaking the API key or raw Mollie body:
```go
if err != nil {
    log.Printf("ERROR: Mollie create payment failed: %v", err)
    errMsg := err.Error()
    // Extract Mollie status if present for the client (safe — doesn't leak API key)
    if strings.Contains(errMsg, "unexpected status") {
        writeJSON(w, http.StatusBadGateway, map[string]string{
            "message": "Mollie payment service returned an error — please try again or contact support",
        })
    } else if strings.Contains(errMsg, "failed to marshal") {
        writeJSON(w, http.StatusInternalServerError, map[string]string{
            "message": "failed to create payment — internal error",
        })
    } else {
        writeJSON(w, http.StatusInternalServerError, map[string]string{
            "message": "failed to create payment — payment service unreachable",
        })
    }
    return
}
```

### Fix B: Validate Mollie API key at startup

**File**: `api/cmd/server/main.go`, after line 1716

Add a startup health check:
```go
if mollieClient != nil {
    _, err := mollieClient.GetPayment(context.Background(), "test") 
    // This will fail with 404/401 but proves connectivity+auth
    if err != nil && !strings.Contains(err.Error(), "404") {
        log.Printf("WARNING: Mollie API reachability check failed: %v", err)
    } else {
        log.Println("Mollie API reachable and authenticated.")
    }
}
```

### Fix C: Add structured logging for Mollie errors

Add Mollie response status to all logged errors. The current `do()` method already includes the status code, but the webhook handler could benefit from similar detail.

---

## 6. Open Questions for the User

1. **What is the actual error in the API pod logs?** Run the diagnostic command in Step 1 above. This is the fastest path to the root cause.

2. **Did the Mollie API key work previously?** If this is a regression, what changed? (New deployment, key rotation, K8s secret update?)

3. **Is this a test or production Mollie account?** The API key prefix (`test_` vs `live_`) determines which Mollie environment is used.

4. **Has the Mollie account completed business verification (KYC)?** An unverified account will reject all payment requests.

5. **Are `api.euroscale.app` and `euroscale.app` publicly reachable?** Mollie needs these for the webhook URL and redirect URL.

6. **Can the API pod reach `api.mollie.com`?** Network egress from the K3s cluster to Mollie's API is required.

7. **What tier was the user trying to upgrade to?** The `tierPrice()` function only supports `scale`, `team`, and `business`. If someone tries "free" or "enterprise", the handler returns 400 but with a different error message ("unknown tier"), so this is unlikely the issue.

---

## 7. Summary of Most Likely Cause

Based on the code analysis, the error `"failed to create payment"` maps exactly to a failed `h.client.CreatePayment()` call in `HandleCreatePayment` (mollie.go:359). The Mollie client IS initialized (otherwise handlers would be disabled with 503 "Mollie payment service is not configured"), so the issue is in the actual HTTP call to Mollie's `/v2/payments` endpoint.

The most probable root causes in order:
1. **Invalid/expired Mollie API key** in the K8s secret `euroscale-mollie`
2. **Mollie account not activated** (KYC pending)
3. **Network connectivity** from the API pod to `api.mollie.com`

**Immediate action**: Check API pod logs for the raw Mollie error (line 360 of mollie.go logs it). This will confirm which of the above is the root cause within minutes.
