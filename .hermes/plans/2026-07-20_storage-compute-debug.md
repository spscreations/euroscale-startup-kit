# Storage & Compute Add-ons Debug Investigation

**Date**: 2026-07-20
**Bug**: Scale tier user — Storage & Compute add-on buttons (Apply Changes, Autoscale toggle, storage slider, compute slider) don't work.

---

## 1. Full Flow Trace (Button Click → API → Backend)

### Step 1: User clicks "Apply Changes"

**File**: `dashboard/src/components/StorageCard.tsx`, line 295–298
```tsx
<Button onClick={handleApply} disabled={isApplying} className="w-full">
```

### Step 2: `handleApply()` validates and dispatches

**File**: `StorageCard.tsx`, lines 82–107
```tsx
const handleApply = useCallback(() => {
  if (!databaseId) { toast.error("No database selected"); return; }
  if (additionalStorageGB === 0 && additionalCU === 0 && !autoscaleEnabled) {
    toast.error("No changes to apply"); return;
  }
  if (additionalStorageGB > 0) {
    onApplyStorage(additionalStorageGB);       // → ResizeStorage RPC
  }
  onApplyAutoscale(autoscaleEnabled,           // → SetAutoscale RPC (ALWAYS)
    autoscaleThreshold, autoscaleIncrement);
  setAdditionalStorageGB(0);
  setAdditionalCU(0);
}, [...]);
```

**Key observations:**
- `onApplyStorage` only fires when the user moved the storage slider (additionalStorageGB > 0)
- `onApplyAutoscale` fires **unconditionally** — even if autoscale wasn't touched
- The compute slider (`additionalCU`) is **never sent to any backend** — it's purely UI state for cost display

### Step 3: Autoscale toggle (separate trigger)

**File**: `StorageCard.tsx`, lines 169–172
```tsx
<Switch
  checked={autoscaleEnabled}
  disabled={!canAutoscale}
  onCheckedChange={(v) => {
    setAutoscaleEnabled(v);
    onApplyAutoscale(v, autoscaleThreshold, autoscaleIncrement);
  }}
/>
```
Toggling the switch fires `onApplyAutoscale` **immediately**, before clicking Apply.

### Step 4: Callbacks in `DatabaseAddons`

**File**: `dashboard/src/components/DatabaseAddons.tsx`

`onApplyStorage` (lines 113–145):
```tsx
resizeMutation.mutate(
  { databaseId, additionalGb },
  {
    onSuccess: (res) => {
      if (res.success !== true) {
        toast.error(res.message || "Storage resize failed unexpectedly.");
        return;
      }
      // ...show success toast
    },
    onError: (err) => { toast.error(`Failed: ${err.message}`); },
  },
);
```

`onApplyAutoscale` (lines 147–167):
```tsx
autoscaleMutation.mutate(
  { databaseId, enabled, thresholdPercent: threshold, incrementPercent: increment },
  {
    onSuccess: () => { toast.success(...); void refetch(); },
    onError: (err) => { toast.error(`Autoscale failed: ${err.message}`); },
  },
);
```

### Step 5: Connect-Query → Connect-Web transport

**File**: `dashboard/src/hooks/useResizeStorage.ts`
```ts
import { resizeStorage } from "@/lib/proto/euroscale/v1/database-DatabaseService_connectquery";
export function useResizeStorage() { return useMutation(resizeStorage); }
```

**File**: `dashboard/src/lib/api.ts`, lines 51–56
```ts
export function createTransport(): Transport {
  return createConnectTransport({
    baseUrl: "/api/grpc",
    useBinaryFormat: false,
  });
}
```

Connect-web sends POST to `/api/grpc/euroscale.v1.DatabaseService/ResizeStorage` with `Content-Type: application/connect+json`.

### Step 6: Next.js BFF proxy

**File**: `dashboard/src/app/api/grpc/[...path]/route.ts`, lines 28–66
```ts
const API_BASE = "https://api.euroscale.app";
const servicePath = path.join("/");  // e.g. "euroscale.v1.DatabaseService/ResizeStorage"
// Signs JWT with Better Auth session → Authorization: Bearer <jwt>
const response = await fetch(`${API_BASE}/${servicePath}`, {
  method: "POST", headers, body: await req.arrayBuffer(),
});
```

JWT payload: `{ user_id, email, role: "user", sub: user_id, iss: "euroscale", aud: ["euroscale-api"], exp: now+300 }`, signed with `BETTER_AUTH_SECRET` (HS256).

### Step 7: API Connect handler receives request

**File**: `api/cmd/server/main.go`, lines 1857–1858
```go
connectHandler := connectpkg.NewHandler(srv, jwtSecret, ...)
httpMux.Handle("/euroscale.v1.DatabaseService/", connectHandler)
```

**File**: `api/internal/connect/connect.go`, lines 229–252

The Connect handler routes `/euroscale.v1.DatabaseService/ResizeStorage` → `ResizeStorage` method, validated through JWT auth interceptor (lines 370–402).

### Step 8: `ResizeStorage` gRPC handler

**File**: `api/cmd/server/main.go`, lines 781–828

```go
func (s *server) ResizeStorage(...) {
  // 1. Validate inputs
  // 2. verifyDatabaseOwnership() — checks JWT user owns this DB
  // 3. Tier limit enforcement: checks currentGB + additionalGb ≤ tier.MaxStorageGB
  //    For Scale tier: MaxStorageGB = 10
  //    If exceeded → returns Success: false (NOT a gRPC error!)
  // 4. Calls s.resizer.ResizeStorage() — patches VitessShard CRD
  // 5. Returns Success: true/false
}
```

### Step 9: `SetAutoscale` gRPC handler

**File**: `api/cmd/server/main.go`, lines 909–942

```go
func (s *server) SetAutoscale(...) {
  // 1. Validate inputs
  // 2. verifyDatabaseOwnership()
  // 3. NO TIER CHECK — saves autoscale settings unconditionally
  // 4. Saves to K8s Secret: autoscale-{databaseId} in "euroscale" namespace
}
```

---

## 2. Tiers & Limits Configuration

**File**: `api/internal/tiers/tiers.go`

| Tier | MaxStorageGB | AutoscaleMaxCU |
|------|-------------|----------------|
| Free | 1 | **0** (disabled) |
| Scale | 10 | **2** |
| Team | 50 | 4 |
| Business | 250 | 8 |
| Enterprise | unlimited | unlimited |

**Critical for this bug**: `AutoscaleMaxCU: 0` means autoscale is disabled and the Free tier overlay is shown.

### How `DatabaseAddons` decides to show the overlay:

**File**: `DatabaseAddons.tsx`, lines 88–90
```tsx
const maxAutoscaleCU = limits?.autoscaleMaxCu ?? 0;
const canAutoscale = maxAutoscaleCU > 0;
const isFreeTier = maxAutoscaleCU <= 0;
```

**Lines 172–182** — the blocking overlay:
```tsx
{isFreeTier && (
  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center 
                  backdrop-blur-[2px] bg-surface-2/60 rounded-md">
    <Lock size={18} />
    <p>Not available on Free tier</p>
    <p>Upgrade to Scale to add compute resources</p>
  </div>
)}
```

The overlay has `z-10` and NO `pointer-events-none` — it **blocks all clicks** on the Apply Changes button and all sliders underneath it.

---

## 3. Root Cause Analysis

### BUG #1 (PRIMARY — THE ACTUAL ROOT CAUSE): Free-tier overlay appears when usage data is not loaded or tier is wrong

**Severity**: CRITICAL — Blocks all user interaction

**What triggers the overlay for a Scale user:**

1. **`useUsage` query returns no data or errors** → `limits = undefined` → `maxAutoscaleCU = 0` → `isFreeTier = true`
2. **User's tier in ConfigMap is not "scale"** (falls back to Free) → `autoscaleMaxCu = 0` → `isFreeTier = true`

**Why this happens:**
- The `useUsage` hook (`hooks/useUsage.ts`, line 12–18) is enabled only when `session?.id` exists
- Better Auth's `useSession()` could return data where the user ID doesn't match the ID stored in the API's `euroscale-user-tiers` ConfigMap
- If the BFF JWT user_id doesn't match the ConfigMap key, the API falls back to `DefaultTier = Free` (tiers.go line 193–204)

**Evidence**:
- `DatabaseAddons.tsx` line 90: `const isFreeTier = maxAutoscaleCU <= 0` — the only guard
- `DatabaseAddons.tsx` lines 172–182: overlay blocks entire card
- `StorageCard.tsx` line 168: `disabled={!canAutoscale}` — toggle disabled separately (less visible)

**To verify in production**: Check what `GetUsage` returns for the Scale user. If `limits.autoscaleMaxCu` is 0, the ConfigMap entry is missing or wrong.

### BUG #2: `onApplyAutoscale` always called from `handleApply`, doubling mutations

**Severity**: MEDIUM — Causes unnecessary RPC calls, potential race conditions

**File**: `StorageCard.tsx`, line 94
```tsx
onApplyAutoscale(autoscaleEnabled, autoscaleThreshold, autoscaleIncrement);
```

This fires every time "Apply Changes" is clicked, even when:
- User only moved the storage slider (no autoscale changes)
- User already toggled autoscale (which already fired a separate `onApplyAutoscale` via the Switch's `onCheckedChange` at line 171)

**Impact**: Every Apply click triggers TWO mutations: `resizeStorage` and `setAutoscale`. If `setAutoscale` fails (e.g., K8s Secret write error), the user gets an error toast from an operation they didn't intend to perform.

### BUG #3: No tier validation in `SetAutoscale` gRPC handler

**Severity**: MEDIUM — Allows Free tier users to enable autoscale via API

**File**: `api/cmd/server/main.go`, lines 909–942

Unlike `ResizeStorage` (lines 795–809) which checks `tier.MaxStorageGB`, `SetAutoscale` has **zero** tier checks. A Free tier user could call SetAutoscale directly and save autoscale settings to a K8s Secret, even though `AutoscaleMaxCU = 0` for their tier.

### BUG #4: Compute slider (`additionalCU`) has no backend persistence

**Severity**: LOW — Feature gap, not a bug

**File**: `StorageCard.tsx`, lines 60, 256–280

The `additionalCU` slider adjusts a UI-only state variable. The computed monthly cost (`≈ €{computeCost.toFixed(2)}/mo`) is shown but the value is never sent to any API endpoint. There's no `UpdateComputeLimit` RPC. This means the compute slider is cosmetic only.

### BUG #5: Inconsistent error handling — `ResizeStorage` returns errors in response body, not as gRPC errors

**Severity**: LOW — Makes frontend error handling harder

**File**: `api/cmd/server/main.go`, lines 799–808, 814–818

`ResizeStorage` returns `Success: false` as a **successful gRPC response** (HTTP 200) with an error message in the body, instead of returning a gRPC error status. This forces the frontend to check `res.success !== true` (DatabaseAddons.tsx line 122) rather than using standard `onError` handling.

Contrast with `SetAutoscale` (line 930) which uses `status.Errorf(codes.Internal, ...)` — a proper gRPC error that triggers `onError`.

### BUG #6: Autoscale K8s Secret namespace is hardcoded

**Severity**: LOW — Works in default deployment but breaks if namespace changes

**File**: `api/cmd/server/main.go`, line 859
```go
Namespace: "euroscale",
```

The namespace is hardcoded instead of using `s.namespace` (which is set from `K8S_NAMESPACE` env var, line 1627–1630). If deployed in a non-`euroscale` namespace, `saveAutoscaleSettings` will fail with permission errors.

---

## 4. Exact Files & Lines for Fixes

### Fix #1 (CRITICAL): Guard the overlay against false negatives

**File**: `dashboard/src/components/DatabaseAddons.tsx`

**Line 89–90** — Change:
```tsx
const canAutoscale = maxAutoscaleCU > 0;
const isFreeTier = maxAutoscaleCU <= 0;
```
to:
```tsx
const canAutoscale = maxAutoscaleCU > 0;
// Only show the overlay when we're sure the data is loaded and autoscale is disabled.
// Don't block the UI just because usage data hasn't loaded yet.
const isFreeTier = limits !== undefined && maxAutoscaleCU <= 0;
```

This prevents the overlay from appearing when `useUsage` hasn't loaded data yet. Without this fix, a Scale user with a slow or failed `GetUsage` call sees the Free tier overlay.

### Fix #2: Only call `onApplyAutoscale` when autoscale was changed

**File**: `dashboard/src/components/StorageCard.tsx`

**Lines 82–107** — Track whether autoscale was toggled:
```tsx
// Add state:
const [autoscaleTouched, setAutoscaleTouched] = useState(false);

// In handleApply, line 94:
if (autoscaleTouched) {
  onApplyAutoscale(autoscaleEnabled, autoscaleThreshold, autoscaleIncrement);
  setAutoscaleTouched(false);
}

// In Switch onCheckedChange (line 171):
setAutoscaleTouched(true);
onApplyAutoscale(v, autoscaleThreshold, autoscaleIncrement);
```

And update the early-return guard (line 87) to also check `autoscaleTouched`:
```tsx
if (additionalStorageGB === 0 && additionalCU === 0 && !autoscaleTouched) {
```

### Fix #3: Add tier validation to `SetAutoscale`

**File**: `api/cmd/server/main.go`

**After line 915** (`verifyDatabaseOwnership`), add:
```go
// Tier limit enforcement: autoscale requires tier with AutoscaleMaxCU > 0.
userID := auth.GetUserID(ctx)
if userID != "" {
    tier := s.tierStore.GetTierForUser(ctx, userID)
    if tier.AutoscaleMaxCU <= 0 {
        return nil, status.Errorf(codes.PermissionDenied,
            "autoscale not available on your %q tier — upgrade at euroscale.app/billing", tier.Name)
    }
}
```

### Fix #4: Standardize `ResizeStorage` error handling

**File**: `api/cmd/server/main.go`

**Lines 799–808, 814–818** — Replace `Success: false` responses with proper gRPC errors:
```go
// Tier limit exceeded:
if tier.MaxStorageGB != tiers.UnlimitedDBs && requestedTotal > tier.MaxStorageGB {
    return nil, status.Errorf(codes.ResourceExhausted,
        "storage limit reached: your %s plan allows %d GB ...", tier.Name, tier.MaxStorageGB)
}

// Resize failure:
if err != nil {
    log.Printf("ERROR: failed to resize PVC for database %q: %v", req.DatabaseId, err)
    return nil, status.Errorf(codes.Internal, "resize failed: %v", err)
}
```

This lets the frontend's `onError` handler catch these as standard errors, simplifying the frontend logic.

### Fix #5: Use `s.namespace` instead of hardcoded `"euroscale"` in autoscale Secret

**File**: `api/cmd/server/main.go`, line 859
```go
// Change:
Namespace: "euroscale",
// To:
Namespace: s.namespace,
```

Also update line 874 (`s.clientset.CoreV1().Secrets("euroscale")`) → `s.clientset.CoreV1().Secrets(s.namespace)`.

---

## 5. Tier Configuration Verification

To verify the Scale user's tier is correctly set in production:

```bash
kubectl get configmap euroscale-user-tiers -n euroscale -o yaml
```

Look for the user's Better Auth ID as a key in `data`. The value should be `"scale"`.

If missing or set to `"free"`, run:
```bash
kubectl patch configmap euroscale-user-tiers -n euroscale --type merge -p '{"data":{"<USER_ID>":"scale"}}'
```

---

## 6. Summary of Cascading Failures

The most likely cascading failure when Scale tier user clicks "Apply Changes":

1. User loads dashboard → `useUsage` queries `GetUsage`
2. `GetUsage` returns tier data — if tier is `"free"` → `autoscaleMaxCu: 0` → **overlay blocks UI**
3. Even if tier is `"scale"` but query fails silently → `limits = undefined` → `autoscaleMaxCu = 0` → **overlay blocks UI**
4. User sees "Not available on Free tier" message even though they upgraded
5. Buttons are underneath a `z-10` overlay with backdrop blur — clicks are intercepted

**The root cause is the free-tier guard in `DatabaseAddons.tsx` line 90 that conflates "no data loaded" with "free tier" — both result in `maxAutoscaleCU <= 0`.**
