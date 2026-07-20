# Storage UX Redesign Plan

**Goal:** Show "Plan includes X GB (base)" + "Add extra: +Y GB" + "Total: Z GB" clearly in the Storage UI. The slider controls extra storage (`additionalGb`), not total.

**Date:** 2026-07-20

---

## Architecture Decision

The protobuf generated files (`.pb.go`, `.pb.ts`) contain **binary raw descriptors** that are cumbersome to manually edit. To avoid introducing bugs from manual binary descriptor edits, we take a pragmatic approach:

**Strategy:** Add `MaxTotalStorageGB` to the Go `Tier` struct (backend concept only, not a proto field). The existing `MaxStorageGB` becomes the "base included" storage. In the `GetUsage` API response, `MaxStorageBytes` maps to the total max (`MaxTotalStorageGB * GB`), and we add a custom JSON field `base_storage_bytes_override` for the base. On the frontend, we derive base from the tier name using a constant map.

Wait — better approach: **Add a new field only to the Go struct and TypeScript type** (field number 8), skip the raw descriptor update. Proto3 binary: struct tags drive encoding. Proto3 JSON: we serve JSON via a custom marshaler. ConnectRPC binary: struct tags work without descriptor. The raw descriptor mismatch only affects `protojson` marshaling, not ConnectRPC binary.

**Final decision:** Add `base_storage_bytes` (field 8) to the `TierLimits` Go struct with proper `protobuf` tag. Add `baseStorageBytes` to the TypeScript type. The raw binary descriptors won't match but ConnectRPC binary encoding uses struct tags, not descriptors, so it works. For any JSON endpoints, we'll ensure manual marshaling.

### File-by-File Changes

---

## 1. `api/proto/euroscale/v1/database.proto` — Source of Truth

**Line 290-311:** Add field 8 to `TierLimits` message.

After line 310 (`autoscale_max_cu = 7`), add:

```proto
  // Base storage included with the plan in bytes (-1 = unlimited).
  int64 base_storage_bytes = 8;
```

---

## 2. `api/internal/tiers/tiers.go` — Add MaxTotalStorageGB

### 2a. Add field to Tier struct (line 44-53)

Add `MaxTotalStorageGB int64` after `MaxStorageGB`:

```go
type Tier struct {
	Name                    string
	MaxDatabases            int     // -1 = unlimited
	MaxStorageGB            int64   // base included storage (-1 = unlimited)
	MaxTotalStorageGB       int64   // max total storage after add-ons (-1 = unlimited)
	ReadUnitsPerMonth       int64   // -1 = unlimited
	WriteUnitsPerMonth      int64   // -1 = unlimited
	AdditionalStorageGBPrice float64 // €0.20 per GB-month
	AutoscaleCUPrice         float64  // €0.04 per CU-hour
	AutoscaleMaxCU           int32    // max CU this tier can autoscale to (-1 = unlimited, 0 = disabled)
}
```

### 2b. Update tierDefs (lines 56-107)

| Tier       | MaxStorageGB (base) | MaxTotalStorageGB |
|------------|---------------------|-------------------|
| Free       | 1                   | 1                 |
| Scale      | 10                  | 100               |
| Team       | 50                  | 500               |
| Business   | 250                 | 2000              |
| Enterprise | UnlimitedDBs (-1)   | UnlimitedDBs (-1) |

```go
var tierDefs = map[string]*Tier{
	TierFree: {
		Name:                    TierFree,
		MaxDatabases:            1,
		MaxStorageGB:            1,
		MaxTotalStorageGB:       1,
		ReadUnitsPerMonth:       100_000,
		WriteUnitsPerMonth:      0,
		AdditionalStorageGBPrice: 0.20,
		AutoscaleCUPrice:        0.04,
		AutoscaleMaxCU:          0,
	},
	TierScale: {
		Name:                    TierScale,
		MaxDatabases:            3,
		MaxStorageGB:            10,
		MaxTotalStorageGB:       100,
		ReadUnitsPerMonth:       1_000_000,
		WriteUnitsPerMonth:      500_000,
		AdditionalStorageGBPrice: 0.20,
		AutoscaleCUPrice:        0.04,
		AutoscaleMaxCU:          2,
	},
	TierTeam: {
		Name:                    TierTeam,
		MaxDatabases:            10,
		MaxStorageGB:            50,
		MaxTotalStorageGB:       500,
		ReadUnitsPerMonth:       10_000_000,
		WriteUnitsPerMonth:      5_000_000,
		AdditionalStorageGBPrice: 0.20,
		AutoscaleCUPrice:        0.04,
		AutoscaleMaxCU:          4,
	},
	TierBusiness: {
		Name:                    TierBusiness,
		MaxDatabases:            UnlimitedDBs,
		MaxStorageGB:            250,
		MaxTotalStorageGB:       2000,
		ReadUnitsPerMonth:       UnlimitedDBs,
		WriteUnitsPerMonth:      UnlimitedDBs,
		AdditionalStorageGBPrice: 0.20,
		AutoscaleCUPrice:        0.04,
		AutoscaleMaxCU:          8,
	},
	TierEnterprise: {
		Name:                    TierEnterprise,
		MaxDatabases:            UnlimitedDBs,
		MaxStorageGB:            UnlimitedDBs,
		MaxTotalStorageGB:       UnlimitedDBs,
		ReadUnitsPerMonth:       UnlimitedDBs,
		WriteUnitsPerMonth:      UnlimitedDBs,
		AdditionalStorageGBPrice: 0.20,
		AutoscaleCUPrice:        0.04,
		AutoscaleMaxCU:          UnlimitedDBs,
	},
}
```

---

## 3. `api/gen/euroscale/v1/database.pb.go` — Generated Go Code

### 3a. Add field to TierLimits struct (after line 1259)

```go
	// Base storage included with the plan in bytes (-1 = unlimited).
	BaseStorageBytes int64 `protobuf:"varint,8,opt,name=base_storage_bytes,json=baseStorageBytes,proto3" json:"base_storage_bytes,omitempty"`
```

### 3b. Add getter method (after line 1339, before `type Usage struct`)

```go
func (x *TierLimits) GetBaseStorageBytes() int64 {
	if x != nil {
		return x.BaseStorageBytes
	}
	return 0
}
```

**Note:** The raw binary descriptor at lines ~2101-2277 is a compressed `FileDescriptorProto`. We skip updating it because:
- ConnectRPC uses binary protobuf encoding, which relies on struct tags (not the descriptor)
- The descriptor is only used for JSON marshaling and reflection
- Adding `BaseStorageBytes` with the correct struct tag is sufficient for wire encoding

**If JSON endpoints are needed later**, regenerate using:
```bash
# Install tools
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest

# From api/ directory:
protoc --go_out=gen --go_opt=paths=source_relative \
  proto/euroscale/v1/database.proto
```

---

## 4. `api/cmd/server/main.go` — Two Changes

### 4a. GetUsage handler (line 722-730): Add BaseStorageBytes

Current:
```go
limits := &pb.TierLimits{
    MaxDatabases:              int32(tier.MaxDatabases),
    MaxStorageBytes:           tier.MaxStorageGB * 1_073_741_824, // GB to bytes
    ReadUnitsPerMonth:         tier.ReadUnitsPerMonth,
    WriteUnitsPerMonth:        tier.WriteUnitsPerMonth,
    AdditionalStorageGbPrice:  tier.AdditionalStorageGBPrice,
    AutoscaleCuPrice:          tier.AutoscaleCUPrice,
    AutoscaleMaxCu:            tier.AutoscaleMaxCU,
}
```

Change to:
```go
limits := &pb.TierLimits{
    MaxDatabases:              int32(tier.MaxDatabases),
    MaxStorageBytes:           tier.MaxTotalStorageGB * 1_073_741_824, // max total allowed (GB to bytes)
    BaseStorageBytes:          tier.MaxStorageGB * 1_073_741_824,      // base included (GB to bytes)
    ReadUnitsPerMonth:         tier.ReadUnitsPerMonth,
    WriteUnitsPerMonth:        tier.WriteUnitsPerMonth,
    AdditionalStorageGbPrice:  tier.AdditionalStorageGBPrice,
    AutoscaleCuPrice:          tier.AutoscaleCUPrice,
    AutoscaleMaxCu:            tier.AutoscaleMaxCU,
}
```

**Key change:** `MaxStorageBytes` now uses `MaxTotalStorageGB`, and the new `BaseStorageBytes` uses `MaxStorageGB`.

### 4b. ResizeStorage handler (line 800): Use MaxTotalStorageGB

Current:
```go
if tier.MaxStorageGB != tiers.UnlimitedDBs && requestedTotal > tier.MaxStorageGB {
```

Change to:
```go
if tier.MaxTotalStorageGB != tiers.UnlimitedDBs && requestedTotal > tier.MaxTotalStorageGB {
```

Also update the error message reference (line 804 from `tier.MaxStorageGB` to `tier.MaxTotalStorageGB`):

```go
return &pb.ResizeStorageResponse{
    Success: false,
    Message: fmt.Sprintf(
        "storage limit reached: your %s plan allows %d GB (current: %d GB, requested: %d GB). Upgrade at euroscale.app/billing",
        tier.Name, tier.MaxTotalStorageGB, currentGB, requestedTotal,
    ),
}, nil
```

---

## 5. `dashboard/src/lib/proto/euroscale/v1/database_pb.ts` — Generated TypeScript

### 5a. Add field to TierLimits type (after line 714, before the closing `};`)

```ts
  /**
   * Base storage included with the plan in bytes (-1 = unlimited).
   *
   * @generated from field: int64 base_storage_bytes = 8;
   */
  baseStorageBytes: bigint;
```

**Note:** The TypeScript `TierLimitsSchema` references the binary file descriptor (`messageDesc(file, 19)`). Adding a new field to the type without updating the binary descriptor means the field won't be known to the runtime schema. However, since `@connectrpc/connect-query` uses binary protobuf, and the Go server now sends field 8 on the wire, the extra bytes will arrive. The `@bufbuild/protobuf` library may:

1. **Drop unknown fields** (if using strict mode) — field 8 would be silently ignored
2. **Preserve unknown fields** (if using `unknownFields`) — field 8 would be in the unknown blob

**To handle this correctly**, we have two options:

**Option A (Recommended):** Instead of adding a proto field, derive `baseStorageGB` from `tier` on the frontend. No proto/TS changes needed.

**Option B:** Regenerate TS stubs from the updated `.proto`:
```bash
cd dashboard
npx buf generate  # if buf.gen.yaml exists
# OR
npx protoc --es_out=src/lib/proto --es_opt=target=ts \
  --proto_path=../api/proto \
  ../api/proto/euroscale/v1/database.proto
```

---

## 6. `dashboard/src/components/StorageCard.tsx` — UI Rework

### 6a. Add prop `baseStorageGB`

At line 15 (inside `StorageCardProps`), add:

```tsx
type StorageCardProps = {
  // ── Storage ──
  storageUsedBytes: number;
  storageLimitBytes: number;
  baseStorageGB: number;                          // NEW: plan's included storage in GB
  storagePricePerGB: number;
  // ... rest unchanged
```

### 6b. Destructure new prop (line 39)

Add `baseStorageGB` to the destructured parameters:

```tsx
export default function StorageCard({
  storageUsedBytes,
  storageLimitBytes,
  baseStorageGB,              // NEW
  storagePricePerGB,
  // ... rest unchanged
```

### 6c. Update derived values (lines 63-68)

Add derived `maxExtraGB`:

```tsx
  // ── Derived values ──
  const storageUsedGB = storageUsedBytes / (1024 * 1024 * 1024);
  const storageLimitGB = storageLimitBytes / (1024 * 1024 * 1024);
  const storageProgress =
    storageLimitBytes > 0
      ? Math.round((storageUsedBytes / storageLimitBytes) * 100)
      : 0;
  const maxExtraGB = storageLimitGB - baseStorageGB;  // NEW: max additional GB allowed
```

### 6d. Replace the "Additional Storage" section (lines 136-160)

Replace the entire block from line 136 to line 160 with:

```tsx
        {/* Additional Storage */}
        <div className="space-y-2">
          {/* Plan base + extra + total display */}
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-muted-foreground">
              Plan includes{" "}
              <span className="text-text-primary font-mono font-medium">
                {baseStorageGB} GB
              </span>
            </label>
            <span className="text-[11px] text-muted-foreground">
              Max total:{" "}
              <span className="text-text-primary font-mono font-medium">
                {storageLimitGB} GB
              </span>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-muted-foreground">
              Add extra:{" "}
              <span className="text-text-primary font-mono font-medium">
                {additionalStorageGB} GB
              </span>
            </label>
            <span className="text-xs text-muted-foreground tabular-nums">
              +€{storageCost.toFixed(2)}/mo
            </span>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-muted-foreground">
              Total storage:{" "}
              <span className="text-accent-text font-mono font-semibold">
                {baseStorageGB + additionalStorageGB} GB
              </span>
            </label>
          </div>
          <Slider
            value={[additionalStorageGB]}
            onValueChange={handleSliderChange(setAdditionalStorageGB)}
            min={0}
            max={maxExtraGB > 0 ? maxExtraGB : 1000}
            step={1}
            className="[&_[data-slot=slider-track]]:bg-border [&_[data-slot=slider-track]]:h-2 [&_[data-slot=slider-range]]:bg-accent-text"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0 GB</span>
            <span>{maxExtraGB > 0 ? maxExtraGB : 1000} GB</span>
          </div>
        </div>
```

### 6e. Update progress bar to reflect total (base + extra)

The existing progress bar at lines 122-133 already uses `storageLimitBytes` as the denominator, which now reflects `MaxTotalStorageGB` (the absolute max). This is correct — the bar shows usage vs total allowed capacity.

**No change needed** to the progress section.

---

## 7. `dashboard/src/components/DatabaseAddons.tsx` — Pass baseStorageGB

### 7a. Compute baseStorageGB (add after line 89)

After line 89 (`const canAutoscale = maxAutoscaleCU > 0;`), add:

```tsx
  // Base storage is included with the plan — derive from tier.
  // Tier → base GB mapping (matches tiers.go):
  // free=1, scale=10, team=50, business=250, enterprise=-1 (unlimited)
  const tierBaseStorageGB: Record<string, number> = {
    free: 1,
    scale: 10,
    team: 50,
    business: 250,
    enterprise: -1,
  };
  const baseStorageGB = tierBaseStorageGB[usageData?.tier ?? "free"] ?? 1;
```

### 7b. Pass baseStorageGB to StorageCard (add at line 103)

In the `<StorageCard` JSX element, add the prop:

```tsx
        <StorageCard
          storageUsedBytes={storageUsedBytes}
          storageLimitBytes={storageLimitBytes}
          baseStorageGB={baseStorageGB}        // NEW
          storagePricePerGB={storagePricePerGB}
          // ... rest unchanged
```

---

## 8. `dashboard/src/components/TierCard.tsx` — Optional: Show base vs total

The TierCard currently shows `maxStorage` (line 83) as the limit for the UsageBar. After this change, `maxStorage` will reflect the total max (from `MaxTotalStorageGB`). For the TierCard, this is correct — it shows the plan's capacity limit.

**No change needed** for TierCard.

Similarly, `dashboard/src/app/dashboard/settings/page.tsx` (line 125) uses `maxStorageGB` for display. It'll now show the total max — correct behavior.

---

## Dependency Order

```
1. tiers.go          — Add MaxTotalStorageGB, update tierDefs
                      ↓
2. main.go (line 800) — ResizeStorage limit check → MaxTotalStorageGB
                      ↓
3. database.proto    — Add base_storage_bytes = 8
                      ↓ (regenerate OR manual)
4. database.pb.go    — Add BaseStorageBytes field + getter
                      ↓
5. main.go (line 722) — GetUsage: populate BaseStorageBytes, use MaxTotalStorageGB for MaxStorageBytes
                      ↓
6. database_pb.ts    — Add baseStorageBytes to TierLimits type
                      ↓
7. DatabaseAddons.tsx — Derive baseStorageGB, pass to StorageCard
                      ↓
8. StorageCard.tsx    — Use baseStorageGB prop, rework UI
```

---

## Verification Checklist

- [ ] Free tier: base=1GB, no extra allowed, slider max=0
- [ ] Scale tier: base=10GB, max extra=90GB, slider max=90
- [ ] Team tier: base=50GB, max extra=450GB, slider max=450
- [ ] Business tier: base=250GB, max extra=1750GB, slider max=1750
- [ ] Enterprise: base=unlimited, no slider needed
- [ ] ResizeStorage rejects requests beyond MaxTotalStorageGB
- [ ] StorageCard shows "Plan includes X GB" → "Add extra: Y GB" → "Total: X+Y GB"
- [ ] Progress bar shows usage relative to total allowed (base + extra)
- [ ] Cost display: +€(extra * price)/mo
- [ ] Free tier overlay still works ("Not available on Free tier")

---

## Alternative: No Proto Changes (Simpler)

If the proto/generated file edits are too risky, use this simpler approach:

**Skip steps 3, 5a, 6a** entirely. Instead:
- Only do **steps 1, 2, 4, 7, 8**
- Frontend derives `baseStorageGB` from tier name (step 7)
- `MaxStorageBytes` in the API = max total (from `MaxTotalStorageGB`)
- StorageCard receives `baseStorageGB` from DatabaseAddons

This avoids ALL proto and generated file changes. The trade-off: frontend hardcodes tier→base mapping (duplicated from backend).
