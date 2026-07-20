"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Crown,
  ArrowUpRight,
  Building2,
  HardDrive,
  Cpu,
  Lock,
  Loader2,
  Info,
} from "lucide-react";
import { useUsage } from "@/hooks/useUsage";
import { useDatabases } from "@/hooks/useDatabases";
import { useResizeStorage } from "@/hooks/useResizeStorage";
import { useResizeCompute } from "@/hooks/useResizeCompute";
import { useSetAutoscale } from "@/hooks/useSetAutoscale";
import UsageBar from "./UsageBar";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  scale: "Scale",
  team: "Team",
  business: "Business",
  enterprise: "Enterprise",
};

const TIER_BASE_STORAGE_GB: Record<string, number> = {
  free: 1,
  scale: 10,
  team: 50,
  business: 250,
  enterprise: -1,
};

function bigintToNumber(n: number | bigint | undefined | null): number {
  if (n === undefined || n === null) return 0;
  return Number(n);
}

export default function TierCard() {
  // ═══════════════════════════════════════════════════════════════
  // ALL hooks — must be called in the same order on every render
  // ═══════════════════════════════════════════════════════════════
  const { data, isLoading, isError, refetch } = useUsage();
  const { data: dbData } = useDatabases();
  const searchParams = useSearchParams();
  const router = useRouter();
  const resizeMutation = useResizeStorage();
  const resizeComputeMutation = useResizeCompute();
  const autoscaleMutation = useSetAutoscale();

  // Add-ons state
  const [storageInputValue, setStorageInputValue] = useState(10);
  const [autoscaleEnabled, setAutoscaleEnabled] = useState(false);
  const [storageInitialized, setStorageInitialized] = useState(false);
  const [additionalCU, setAdditionalCU] = useState(0);

  // Derived values needed by hooks (computed above early returns)
  // All use ?./?? to safely handle loading / missing data
  const tier = data?.tier || "free";
  const baseStorageGB = TIER_BASE_STORAGE_GB[tier] ?? 1;
  const limits = data?.limits;
  const maxAutoscaleCU = limits?.autoscaleMaxCu ?? 0;
  const canAutoscale = maxAutoscaleCU > 0;
  const baseCU = limits?.baseCu ?? 0;
  const maxTotalCU = limits?.maxTotalCu ?? 0;

  const databases = dbData?.databases ?? [];
  const firstDb = databases.length > 0 ? databases[0] : null;
  const firstDbId: string | null = firstDb?.databaseId ?? null;
  const firstDbName: string | null = firstDb?.name ?? null;

  // ── Effects ──

  // Initialize storage input from base tier storage (must be in useEffect,
  // NOT during render — calling setState during render causes crashes)
  useEffect(() => {
    if (!storageInitialized && baseStorageGB > 0 && data) {
      setStorageInputValue(baseStorageGB);
      setStorageInitialized(true);
    }
  }, [storageInitialized, baseStorageGB, data]);

  // Mollie redirect detection — show toast when user returns from payment
  useEffect(() => {
    const paymentStatus = searchParams.get("payment");
    if (paymentStatus === "success") {
      toast.success("Payment successful! Your plan has been updated.");
      refetch();
    } else if (paymentStatus === "cancelled") {
      toast.error("Payment was cancelled. Your plan has not been changed.");
    }
  }, [searchParams, refetch]);

  // ── Callbacks (hooks — must be above early returns) ──

  const handleApplyChanges = useCallback(() => {
    if (!firstDbId) {
      toast.error("No databases. Create a database first.");
      return;
    }

    const additionalGb = Math.max(0, storageInputValue - baseStorageGB);
    if (additionalGb > 0) {
      resizeMutation.mutate(
        { databaseId: firstDbId, additionalGb },
        {
          onSuccess: (res) => {
            const newGb = bigintToNumber((res as any)?.newTotalGb);
            if (newGb && newGb > 0) {
              toast.success(
                `Storage for ${firstDbName || firstDbId} resized to ${newGb} GB`,
              );
            } else {
              toast.success("Storage resize applied");
            }
            void refetch();
          },
          onError: (err) => {
            toast.error(`Failed: ${err.message}`);
          },
        },
      );
    }

    if (additionalCU > 0) {
      resizeComputeMutation.mutate(
        { databaseId: firstDbId, additionalCu: additionalCU },
        {
          onSuccess: (res) => {
            const newCu = (res as any)?.newTotalCu;
            if (newCu && newCu > 0) {
              toast.success(
                `Compute for ${firstDbName || firstDbId} resized to ${newCu} CU`,
              );
            } else {
              toast.success("Compute resize applied");
            }
            void refetch();
          },
          onError: (err) => {
            toast.error(`Failed: ${err.message}`);
          },
        },
      );
    }

    if (autoscaleEnabled && canAutoscale) {
      autoscaleMutation.mutate(
        {
          databaseId: firstDbId,
          enabled: true,
          thresholdPercent: 80,
          incrementPercent: 20,
        },
        {
          onSuccess: () => {
            toast.success(`Autoscale enabled for ${firstDbName || firstDbId}`);
          },
          onError: (err) => {
            toast.error(`Autoscale failed: ${err.message}`);
          },
        },
      );
    }

    if (additionalGb === 0 && additionalCU === 0 && !autoscaleEnabled) {
      toast.success("No changes to apply");
    }
  }, [
    storageInputValue,
    baseStorageGB,
    additionalCU,
    autoscaleEnabled,
    canAutoscale,
    firstDbId,
    firstDbName,
    resizeMutation,
    resizeComputeMutation,
    autoscaleMutation,
    refetch,
  ]);

  const isApplying = resizeMutation.isPending || resizeComputeMutation.isPending || autoscaleMutation.isPending;

  // ═══════════════════════════════════════════════════════════════
  // Early returns — only AFTER all hooks
  // ═══════════════════════════════════════════════════════════════

  if (isLoading) {
    return (
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (isError || !data) {
    return null;
  }

  // ═══════════════════════════════════════════════════════════════
  // Post-early-return computations (data is guaranteed non-null here)
  // ═══════════════════════════════════════════════════════════════

  const tierLabel = TIER_LABELS[tier] || tier;
  const usage = data.usage;

  const maxDbs = bigintToNumber(limits?.maxDatabases);
  const maxStorage = bigintToNumber(limits?.maxStorageBytes);
  const maxReads = bigintToNumber(limits?.readUnitsPerMonth);
  const maxWrites = bigintToNumber(limits?.writeUnitsPerMonth);

  const dbCount = bigintToNumber(usage?.databaseCount);
  const storageUsed = bigintToNumber(usage?.storageBytes);
  const readsUsed = bigintToNumber(usage?.readUnitsUsed);
  const writesUsed = bigintToNumber(usage?.writeUnitsUsed);

  const isEnterprise = tier === "enterprise";
  const isFreeTier = tier === "free";
  const showUpgrade = ["free", "scale", "team", "business"].includes(tier);

  // ═══════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════
  return (
    <Card className="p-4 space-y-4 relative">
      {/* Free tier overlay — dims the add-ons section */}
      {isFreeTier && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center backdrop-blur-[2px] bg-surface-2/60 rounded-md">
          <Lock size={18} className="text-muted-foreground mb-1.5" />
          <p className="text-xs text-muted-foreground text-center px-4 font-medium">
            Not available on Free tier
          </p>
          <p className="text-[10px] text-muted-foreground/70 text-center px-4 mt-0.5">
            Upgrade to Scale to add compute resources
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown size={16} className="text-accent-text" />
          <h3 className="text-sm font-semibold text-text-primary">
            {tierLabel} Plan
          </h3>
        </div>

        {isEnterprise ? (
          <Badge variant="secondary">
            <Building2 size={12} />
            Contact sales
          </Badge>
        ) : showUpgrade ? (
          <Button
            size="sm"
            onClick={() => router.push("/dashboard/billing")}
            className="text-white"
          >
            Upgrade
            <ArrowUpRight size={12} />
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Current plan</span>
        )}
      </div>

      {/* Plan includes info */}
      {baseStorageGB > 0 && (
        <div className="flex items-center gap-1.5 text-xs">
          <Info size={12} className="text-text-muted" />
          <span className="text-text-muted">
            Plan includes{" "}
            <span className="text-text-primary font-medium">
              {baseStorageGB} GB
            </span>{" "}
            storage
          </span>
        </div>
      )}

      {/* Usage bars */}
      <CardContent className="p-0 space-y-3">
        <UsageBar
          label="Databases"
          used={dbCount}
          limit={maxDbs}
          unit="DBs"
        />
        <UsageBar
          label="Storage"
          used={storageUsed}
          limit={maxStorage}
          unit="B"
        />
        <UsageBar
          label="Read Units"
          used={readsUsed}
          limit={maxReads}
          unit="reads"
        />
        <UsageBar
          label="Write Units"
          used={writesUsed}
          limit={maxWrites}
          unit="writes"
        />
      </CardContent>

      {/* ── Add-ons Section ── */}
      <Separator />
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <HardDrive size={14} className="text-accent-text" />
          <span className="text-xs font-semibold text-text-primary">
            Add-ons
          </span>
        </div>

        {/* Storage add-on */}
        <div className="rounded-md border border-border-subtle bg-surface-2 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <HardDrive size={13} className="text-text-muted" />
            <span className="text-[11px] font-medium text-text-primary">
              Storage
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-muted-foreground whitespace-nowrap">
              Additional storage:
            </label>
            <input
              type="number"
              min={baseStorageGB}
              max={baseStorageGB + 500}
              value={storageInputValue}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= baseStorageGB) setStorageInputValue(v);
              }}
              className="w-16 h-7 px-1.5 text-center text-xs border border-border-subtle rounded bg-surface-1 text-text-primary"
            />
            <span className="text-[11px] text-muted-foreground">GB</span>
            <span className="text-[10px] text-muted-foreground ml-auto">
              (base: {baseStorageGB} GB)
            </span>
          </div>
        </div>

        {/* Compute / Autoscale section */}
        <div className="rounded-md border border-border-subtle bg-surface-2 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Cpu size={13} className="text-text-muted" />
            <span className="text-[11px] font-medium text-text-primary">
              Compute
            </span>
            {autoscaleEnabled && canAutoscale && (
              <Badge variant="secondary" className="ml-auto">
                Active
              </Badge>
            )}
          </div>

          {isFreeTier ? (
            <p className="text-[11px] text-muted-foreground italic">
              Compute add-ons not available on the Free plan. Upgrade to Scale to
              enable.
            </p>
          ) : baseCU > 0 ? (
            <div className="space-y-2">
              {/* Plan baseline */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  Plan includes <span className="text-text-primary font-medium">{baseCU} CU</span>
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Max total: <span className="text-text-primary font-medium">{maxTotalCU} CU</span>
                </span>
              </div>

              {/* Additional CU */}
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-muted-foreground whitespace-nowrap">
                  Additional CU:
                </label>
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, maxTotalCU - baseCU)}
                  value={additionalCU}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v >= 0 && v <= Math.max(0, maxTotalCU - baseCU))
                      setAdditionalCU(v);
                  }}
                  className="w-16 h-7 px-1.5 text-center text-xs border border-border-subtle rounded bg-surface-1 text-text-primary"
                />
                <span className="text-[11px] text-muted-foreground">CU</span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  (base: {baseCU} CU)
                </span>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground italic">
              Compute add-ons not available on your current plan. Upgrade to enable.
            </p>
          )}

          <Separator className="my-1" />

          {/* Autoscale toggle */}
          {isFreeTier ? null : canAutoscale ? (
            <div className="flex items-center gap-2">
              <Switch
                checked={autoscaleEnabled}
                onCheckedChange={(v) => setAutoscaleEnabled(v)}
              />
              <span
                className={cn(
                  "text-[11px] font-medium",
                  autoscaleEnabled
                    ? "text-accent-text"
                    : "text-muted-foreground",
                )}
              >
                {autoscaleEnabled
                  ? "Autoscale enabled"
                  : "Enable autoscale compute"}
              </span>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground italic">
              Autoscale not available on your current plan. Upgrade to enable.
            </p>
          )}
        </div>

        {/* Apply Changes button */}
        <Button
          onClick={handleApplyChanges}
          disabled={isApplying}
          className="w-full"
          size="sm"
        >
          {isApplying ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Applying...
            </>
          ) : (
            "Apply Changes"
          )}
        </Button>
      </div>
    </Card>
  );
}
