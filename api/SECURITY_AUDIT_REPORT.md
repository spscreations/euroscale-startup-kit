# EuroScale Go API Backend — Security Audit Report

**Date:** 2026-07-06  
**Scope:** 22 Go source files under `api/cmd/server/`, `api/internal/`, plus Dockerfile and deploy manifest  
**Overall Risk Level:** 🔴 **CRITICAL** — multiple high-severity findings require immediate remediation

---

## Summary

The EuroScale API backend has solid infrastructure practices (TLS, K8s Secrets, crypto/rand credentials, parameterized queries) but suffers from **two architectural-level security gaps**: (1) there is no per-user authentication — a single shared API key is given to all users, and (2) there is no authorization — any authenticated caller can operate on any user's resources by simply changing the `user_id` parameter. Additionally, the Mollie payment webhook has **no signature verification**, enabling free tier upgrades by any attacker.

| Severity | Count |
|----------|-------|
| CRITICAL | 3 |
| HIGH     | 5 |
| MEDIUM   | 8 |
| LOW/INFO | 3 |
| **Total** | **19** |

---

## Findings

### CRITICAL-1: Single Shared API Key — No Per-User Authentication

**File:** `api/cmd/server/main.go` lines 998–999, 660–713  
**File:** `api/internal/auth/auth.go` lines 24–36

The entire system uses a single API key from the `EUROSCALE_API_KEY` env var. The `/api/v1/auth/login` and `/api/v1/auth/signup` handlers accept **any email/password combination** and return this same key to every caller:

```go
// main.go:660-713
func (s *server) authHandler(w http.ResponseWriter, r *http.Request) {
    // ... accepts any email, no password validation ...
    resp := authResponse{
        Token:            s.apiKey,   // ← same key for everyone
        ExpiresInSeconds: 86400,
    }
}
```

The interceptor validates only that the key matches, not *who* is using it:

```go
// auth.go:57-58
if key != validKey {
    return status.Error(codes.Unauthenticated, "invalid API key")
}
```

**Fix:**
- Implement per-user API key generation (UUID-based) stored in a K8s Secret or database
- Hash the API keys; store only the hash for verification
- Add a real user registration flow with password hashing (bcrypt/argon2)
- Replace the shared-key interceptor with one that extracts user identity from the key

---

### CRITICAL-2: No Authorization — User A Can Access User B's Resources

**File:** `api/cmd/server/main.go` — ALL gRPC handlers

Every gRPC method accepts `user_id` as a **request parameter** with no verification that the caller owns that user ID:

| Method | Line | User-supplied `user_id` |
|--------|------|------------------------|
| `CreateDatabase` | 117 | `req.UserId` — any user can create DBs under any user ID |
| `ListDatabases` | 269 | `req.UserId` — any user can list any user's databases |
| `GetDatabase` | 312 | **No user_id check at all** — any user can read any DB metadata |
| `DeleteDatabase` | 226 | **No user_id check** — any user can delete any database |
| `RotateCredentials` | 336 | **No user_id check** — any user can rotate any DB's credentials |
| `GetUsage` | 519 | `req.UserId` — any user can see any user's usage |
| `SetUserTier` | 553 | `req.UserId` — any user can set any user's tier (escalation!) |
| `ResizeStorage` | 572 | Any user can resize any database's PVC |
| All IP whitelist ops | 399+ | Any user can modify any DB's IP whitelist |

**Fix:**
- Extract the authenticated user's identity from the API key/token (see CRITICAL-1)
- Pass user identity through gRPC context (e.g., using `grpc_ctxtags` or custom metadata)
- In every handler, verify that the authenticated user matches `req.UserId` (or that the authenticated user owns the `database_id`)
- `SetUserTier` should be admin-only (add an admin role check)

---

### CRITICAL-3: Mollie Webhook — No Signature Verification (Free Tier Upgrades)

**File:** `api/internal/mollie/mollie.go` lines 354–494

The webhook handler at `POST /api/v1/mollie-webhook` processes payment status changes **without verifying Mollie's webhook signature**. An attacker only needs to know a valid Mollie payment ID to trigger a tier upgrade:

```go
// mollie.go:357 — NO signature check anywhere
func (h *Handler) HandleWebhook(w http.ResponseWriter, r *http.Request) {
    r.ParseForm()
    paymentID := r.FormValue("id")
    // ... no signature verification ...
    payment, _ := h.client.GetPayment(r.Context(), paymentID)
    if payment.Status != "paid" { return }
    // Upgrades the user's tier — NO auth check on who called this
    h.tierStore.SetUserTier(r.Context(), userID, tierName)
}
```

**Worst-case exploit:** Attacker finds a valid `tr_xxxxx` payment ID (from Mollie's REST API docs or a real checkout), POSTs it to the webhook endpoint, and gets their account upgraded to Enterprise for free.

**Fix:**
- Verify the `X-Mollie-Signature` header using the Mollie API key and request body
- The signature is `HMAC-SHA256(request_body, mollie_api_key)`. Compare the hex-encoded result with the header value.
- Reference: https://docs.mollie.com/overview/webhooks#verifying-webhooks

---

### HIGH-1: No Rate Limiting on Any Endpoint

**File:** `api/cmd/server/main.go` — entire `main()` function  
**File:** `api/internal/connect/connect.go` — all handlers

There is zero rate limiting anywhere in the codebase:
- No gRPC rate limiter interceptor
- No HTTP rate limiter middleware
- No rate limits on auth endpoints (brute-force risk)
- No rate limits on the Mollie webhook endpoint (replay/abuse risk)
- No rate limits on PITR restore triggering

**Fix:**
- Add a `golang.org/x/time/rate`-based interceptor for gRPC (or use `grpc_middleware`)
- Add a `tollbooth` or `httprate` middleware for HTTP endpoints
- Rate-limit auth endpoints to 5 req/min per IP
- Rate-limit PITR restore to 1 req/min per user
- Rate-limit webhook endpoint to 10 req/min per IP

---

### HIGH-2: PITR, Mollie, and IP-Whitelist REST Endpoints Have NO Authentication

**File:** `api/cmd/server/main.go` lines 1157–1177

The following HTTP endpoints have **no authentication at all** — they bypass both the gRPC interceptor and the Connect interceptor:

| Endpoint | Line | Risk |
|----------|------|------|
| `/api/v1/backups`, `/api/v1/backups/` | 1171–1172 | Unauthenticated backup listing — exposes DB names and backup metadata |
| `/api/v1/restore`, `/api/v1/restore/` | 1173–1174 | Unauthenticated restore trigger — can trigger K8s Jobs |
| `/api/v1/restores`, `/api/v1/restores/` | 1175–1176 | Unauthenticated restore status listing |
| `/api/v1/create-payment` | 1162 | Unauthenticated payment creation |
| `/api/v1/invoices` | 1164 | Unauthenticated invoice listing |
| `/api/v1/ip-whitelist`, `/api/v1/ip-whitelist/` | 1157–1158 | Requires only `X-User-ID` header (trivially spoofable) |

**Fix:**
- Wrap all these handlers with an auth middleware that validates the `Authorization: Bearer` header
- For the webhook endpoint specifically (`/api/v1/mollie-webhook`), add signature verification instead of auth
- For `ip-whitelist` endpoints, verify that the `X-User-ID` header matches the authenticated user from the token

---

### HIGH-3: `SetUserTier` Endpoint Is Available to All Authenticated Users

**File:** `api/cmd/server/main.go` lines 552–570

The `SetUserTier` gRPC method has no admin authorization check. Any authenticated user (with the shared API key) can set any user's tier to `enterprise`:

```go
func (s *server) SetUserTier(ctx context.Context, req *pb.SetUserTierRequest) (*pb.SetUserTierResponse, error) {
    // ... only validates user_id and tier are non-empty ...
    s.tierStore.SetUserTier(ctx, req.UserId, req.Tier)
}
```

**Fix:** Add an admin role check — only users with `role=admin` in their metadata can call this endpoint.

---

### HIGH-4: Error Messages Leak Internal Infrastructure Details

**Multiple files — see below**

Many gRPC handlers return raw error messages from K8s, vtctlclient, and MySQL directly to clients:

| File | Line | Leaked info |
|------|------|-------------|
| `cmd/server/main.go` | 151 | Raw Vitess errors: `"failed to create database: %v"` |
| `cmd/server/main.go` | 276 | K8s listing errors: `"failed to list databases: %v"` |
| `internal/metadata/metadata.go` | 102 | SQL query errors: `"failed to query INFORMATION_SCHEMA.SCHEMATA: %w"` |
| `internal/secrets/secrets.go` | 69 | Exposes K8s secret names: `"failed to create k8s secret %q: %w"` |
| `internal/secrets/secrets.go` | 79 | Exposes database IDs: `"failed to get k8s secret for database %q: %w"` |
| `internal/storage/storage.go` | 68 | Hetzner limits: `"requested size %d GB exceeds Hetzner max volume size"` |
| `internal/pitr/pitr.go` | 460 | Exposes keyspace names and vtctld addresses in Job spec |
| `internal/vitess/vitess.go` | 63 | Raw vtctlclient output: `"output: %s"` |

**Fix:**
- Return generic error messages to clients (e.g., `"internal error"`, `"database not found"`)
- Log the detailed error server-side only
- Use gRPC error codes appropriately (`codes.Internal` for internal errors, never include raw details)

---

### HIGH-5: CORS Is Wide Open — `Access-Control-Allow-Origin: *`

**File:** `api/cmd/server/main.go` lines 1225–1247

```go
func withCORS(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Access-Control-Allow-Origin", "*")
        // ...
    })
}
```

This allows any website on the internet to make authenticated API calls from a user's browser if the user is logged in to EuroScale. Combined with the shared API key, a malicious site could create/delete databases on behalf of any user.

**Fix:** Restrict `Access-Control-Allow-Origin` to `https://euroscale.app` and `https://app.euroscale.app` (or read from an env var).

---

### MEDIUM-1: In-Memory Payment Store — Data Lost on Restart

**File:** `api/internal/mollie/mollie.go` lines 238–239

Payment tracking uses an in-memory map:
```go
type Handler struct {
    payments map[string]*PaymentInfo  // lost on pod restart
    mu       sync.RWMutex
}
```

On pod restart/crash, all payment history, invoice data, and webhook idempotency state is lost. The invoices API returns only what's in memory.

**Fix:** Persist payment state to a K8s Secret or database. Alternatively, use Mollie's API directly for invoice lookup instead of an in-memory store.

---

### MEDIUM-2: Read-Modify-Write Race Conditions on Usage Counters

**File:** `api/internal/tiers/usage.go` lines 6–9, 117–151

The code itself documents this risk:
```go
// Concurrency note: increment/decrement operations use read-modify-write on
// the underlying Secret. In a multi-replica deployment this carries a small
// risk of lost updates.
```

`IncrementDatabaseCount`, `DecrementDatabaseCount`, and `AddStorageBytes` all follow the pattern: read → modify in memory → write back. With multiple replicas, concurrent updates will be lost.

**Fix:**
- Use K8s resource version for optimistic concurrency (check `metadata.resourceVersion` on update)
- Or use a proper atomic counter store (Redis INCR/DECR, or a PostgreSQL sequence)
- Or serialize operations through a single database pod

---

### MEDIUM-3: `saveIPs` Error Handling — Update-Fails → Create Succeeds Masking Real Errors

**File:** `api/internal/ipwhitelist/ipwhitelist.go` lines 182–189

```go
_, err = s.clientset.CoreV1().Secrets(s.namespace).Update(ctx, secret, metav1.UpdateOptions{})
if err != nil {
    // Fall back to create.
    _, err = s.clientset.CoreV1().Secrets(s.namespace).Create(ctx, secret, metav1.CreateOptions{})
```

If `Update` fails for a reason other than "not found" (e.g., RBAC denial, network error), the code silently falls through to `Create` which probably also fails. The real error is masked.

**Fix:** Check the error type — only fall back to `Create` on `IsNotFound` errors:
```go
if errors.IsNotFound(err) {
    _, err = s.clientset.CoreV1().Secrets(s.namespace).Create(...)
}
```

---

### MEDIUM-4: Webhook Returns 200 OK on Errors (Silent Failures)

**File:** `api/internal/mollie/mollie.go` lines 366–367, 373–374, 392–393, 400–401, 443–444, 451–452

The webhook handler returns HTTP 200 on **all** error paths:

```go
if err := r.ParseForm(); err != nil {
    log.Printf("ERROR: mollie webhook: failed to parse form: %v", err)
    w.WriteHeader(http.StatusOK)  // ← hides error from Mollie
    return
}
```

While this prevents Mollie from retrying, it also means: (a) failed tier upgrades are silently lost, (b) no monitoring/alerting can detect these failures from the HTTP response.

**Fix:** Return 200 OK (to stop retries) but add structured logging/metrics. Consider a dead-letter queue for failed upgrades to retry later.

---

### MEDIUM-5: `listCRDBackups` Returns ALL Backups Without Filtering

**File:** `api/internal/pitr/pitr.go` lines 278–291

```go
func (h *Handler) listCRDBackups(ctx context.Context, databaseID string) ([]BackupInfo, error) {
    list, err := h.dynamicClient.Resource(VitessBackupGVR).Namespace(h.namespace).List(ctx, metav1.ListOptions{})
    // ... returns ALL backups in the namespace ...
    // TODO: filter by keyspace matching database_id when available
```

The `databaseID` parameter is accepted but never used for filtering. Any caller gets ALL backups for ALL databases in the namespace.

**Fix:** Implement the TODO — filter backup results by the keyspace corresponding to the requested database ID.

---

### MEDIUM-6: PreviewTable — LIMIT Interpolation Into SQL

**File:** `api/internal/metadata/metadata.go` line 305

```go
query := fmt.Sprintf("SELECT * FROM `%s`.`%s` LIMIT %d", req.Database, req.Table, limit)
```

While the `Database` and `Table` fields are protected by `isSafeIdentifier` (only alphanumeric + underscore), the `LIMIT` value is user-controlled and directly interpolated. Although `limit` is constrained to 1–100 by lines 284–287, interpolation of values into SQL strings is a bad pattern.

**Fix:** Use MySQL's `?` placeholder for the LIMIT value — this is supported in MySQL:
```go
db.QueryContext(ctx, "SELECT * FROM `?`.`?` LIMIT ?", req.Database, req.Table, limit)
```
(Backtick-quoted identifiers are safe after `isSafeIdentifier`, but the LIMIT should still be parameterized.)

---

### MEDIUM-7: Unrestricted Restore Job Creation via K8s API

**File:** `api/internal/pitr/pitr.go` lines 424–478

The `HandleTriggerRestore` endpoint (which has **no auth** — see HIGH-2) creates K8s Jobs that execute `vtctlclient RestoreFromBackup`:

```go
Command: []string{
    "vtctlclient",
    "--server", h.vtctldAddr,
    "RestoreFromBackup",
    keyspace + "/0",
},
```

An unauthenticated attacker could:
- Create many K8s Jobs (resource exhaustion)
- Trigger restores on arbitrary keyspaces (data integrity risk)
- Cause denial of service by flooding the cluster with restore operations

**Fix:** Add authentication, authorization, and rate limiting (see HIGH-1, HIGH-2). Validate that the caller owns the database before triggering a restore.

---

### MEDIUM-8: `RotateCredentials` Hardcodes Region and Loses Metadata

**File:** `api/cmd/server/main.go` lines 360–371

```go
db := &models.Database{
    Region:    models.RegionNuremberg, // hardcoded!
    UserID:    "",                     // lost from original
    CreatedAt: time.Now(),            // overwritten
}
```

When rotating credentials, the region is hardcoded to `nuremberg` regardless of the original database's region. The `UserID` is set to empty string, losing the ownership association in the secret labels.

**Fix:** Read the existing secret's annotations before updating to preserve `Region` and `UserID`.

---

### LOW-1: Vitess Command Execution — No Whitelist of Allowed Commands

**File:** `api/internal/pitr/pitr.go` lines 362–367

```go
func (h *Handler) runVtctlClient(ctx context.Context, args ...string) (string, error) {
    fullArgs := append([]string{"--server", h.vtctldAddr}, args...)
    return runCommand(ctx, "vtctlclient", fullArgs...)
}
```

Any string can be passed as an `args` element. While the caller controls the arguments, there's no explicit whitelist of allowed vtctlclient subcommands.

**Fix:** Maintain an allowlist of permitted commands (`ListBackups`, `RestoreFromBackup`) and reject anything else.

---

### LOW-2: `extractDBName` Uses Fragile String Parsing

**File:** `api/cmd/server/main.go` lines 617–653

The `extractDBName` function manually parses the connection string:
```go
// Find the last '/' after '@'
```

This is fragile — if the connection string format changes (e.g., additional query parameters, different URL structure), this silently breaks. It also doesn't handle URL-encoded characters.

**Fix:** Use `net/url` to parse the connection string properly:
```go
u, _ := url.Parse(connStr)
dbName := strings.TrimPrefix(u.Path, "/")
```

---

### LOW-3: Username Hardcoded in gRPC Response (Not a Secret, but Unnecessary)

**File:** `api/cmd/server/main.go` lines 148, 175, 215

The `username` field appears in non-credential responses (e.g., `ListDatabases`, `GetDatabase`). While the username is not a secret per se, it reveals the naming convention (`u_` + 12 chars) which aids attackers in targeted attacks.

**Fix:** Consider whether the username needs to be exposed in list/get responses. If not, remove it.

---

## Good Practices (What's Done Well)

1. ✅ **Credentials generated with crypto/rand** — `vitess.go` lines 143–215 use `crypto/rand` with a 48-char password from a 86-char charset
2. ✅ **Database name validation** — `validateDatabaseName()` in `vitess.go` prevents command injection (only `[a-zA-Z0-9_]`, max 64 chars)
3. ✅ **Parameterized SQL queries** — All INFORMATION_SCHEMA queries use `?` placeholders (metadata.go lines 99–231)
4. ✅ **SQL identifier sanitization** — `isSafeIdentifier()` in metadata.go validates table/database names before backtick interpolation
5. ✅ **Credentials stored in K8s Secrets** — Not in code, not in config files
6. ✅ **Sensitive values from environment variables** — `EUROSCALE_API_KEY`, `MOLLIE_API_KEY`, `K8S_NAMESPACE`
7. ✅ **CIDR/IP validation** — Both `ipcheck.ValidateCIDR` and `ipwhitelist.validateIP` use `net.ParseCIDR`/`net.ParseIP`
8. ✅ **TLS with cert-manager** — `deploy/tls-certs.yaml` uses cert-manager for CA and server certificate lifecycle management
9. ✅ **Health endpoints** — `/healthz` (liveness) and `/ready` (readiness) on separate port `:8080`
10. ✅ **Non-root user** — Dockerfile `USER euroscale`, `addgroup -S` / `adduser -S`
11. ✅ **Stripped binary** — `-ldflags="-s -w"` removes symbol table and debug info
12. ✅ **HTTP timeouts** — `ReadTimeout: 30s`, `WriteTimeout: 60s`, `IdleTimeout: 60s`
13. ✅ **K8s RBAC-friendly labeling** — All secrets carry `app=euroscale`, `managed=true`, `user_id` labels for RBAC policies
14. ✅ **Connect protocol support** — Enables browser-based clients without exposing gRPC directly
15. ✅ **Webhook idempotency check** — In-memory check for already-processed payments (line 381)

---

## Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| **1 (Immediate)** | CRITICAL-2: Add authorization checks to all endpoints | Medium | Blocks data breaches |
| **2 (Immediate)** | CRITICAL-3: Add Mollie webhook signature verification | Low | Blocks payment fraud |
| **3 (This week)** | CRITICAL-1: Implement per-user API keys | High | Foundational |
| **4 (This week)** | HIGH-2: Add auth to PITR/Mollie/IP-whitelist REST endpoints | Medium | Blocks unauthenticated access |
| **5 (This week)** | HIGH-1: Add rate limiting | Medium | DoS protection |
| **6 (This week)** | HIGH-3: Restrict SetUserTier to admin only | Low | Blocks tier escalation |
| **7 (This sprint)** | HIGH-4: Sanitize error messages | Low | Prevents info leakage |
| **8 (This sprint)** | HIGH-5: Restrict CORS | Low | CSRF protection |
| **9 (Next sprint)** | MEDIUM items | Varies | Production hardening |

---

*Audit conducted by automated security analysis of 22 Go source files, Dockerfile, and TLS deployment manifest.*
