"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  Crown,
  ArrowUpRight,
  Building2,
  Loader2,
  AlertTriangle,
  HardDrive,
  Cpu,
  Zap,
  Check,
} from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import { useUsage } from "@/hooks/useUsage";
import { useResizeStorage } from "@/hooks/useResizeStorage";
import { useAuth } from "@/lib/auth";
import UsageBar from "./UsageBar";
import { useDatabases } from "@/hooks/useDatabases";
import { useCreatePayment } from "@/hooks/useCreatePayment";
import toast from "react-hot-toast";

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  scale: "Scale",
  team: "Team",
  business: "Business",
  enterprise: "Enterprise",
};

function bigintToNumber(n: number | bigint | undefined | null): number {
  if (n === undefined || n === null) return 0;
  return Number(n);
}

export default function TierCard() {
  const { data, isLoading, isError, error } = useUsage();

  // Add-on state
  const [storageGB, setStorageGB] = useState<number>(10);
  const [autoscaleEnabled, setAutoscaleEnabled] = useState(false);
  const [autoscaleCU, setAutoscaleCU] = useState(1);

  // Auth + databases for resize target
  const { session } = useAuth();
  const { data: dbs } = useDatabases();
  const resizeMutation = useResizeStorage();
  const { createPayment, isLoading: paymentLoading } = useCreatePayment();
  const searchParams = useSearchParams();

  // Mollie redirect detection — show toast when user returns from payment
  useEffect(() => {
    const paymentStatus = searchParams.get("payment");
    if (paymentStatus === "success") {
      toast.success("Payment successful! Your plan has been updated.");
    } else if (paymentStatus === "cancelled") {
      toast.error("Payment was cancelled. Your plan has not been changed.");
    }
  }, [searchParams]);

  const handleApply = useCallback(() => {
    if (!session?.id) {
      toast.error("Not authenticated");
      return;
    }
    if (storageGB <= 0 && !autoscaleEnabled) {
      toast.error("No changes to apply");
      return;
    }
    if (storageGB > 0) {
      // Validate databases exist before resize
      if (!dbs?.databases?.length) {
        toast.error("No databases to resize. Create a database first.");
        return;
      }
      // Resize the first database (in production, user selects which DB)
      const targetDb = dbs.databases[0];
      if (!targetDb?.databaseId) {
        toast.error("Database has no ID. Please contact support.");
        return;
      }
      resizeMutation.mutate(
        { databaseId: targetDb.databaseId, additionalGb: storageGB },
        {
          onSuccess: (res) => {
            if (res.success !== true) {
              toast.error(res.message || "Storage resize failed unexpectedly.");
              return;
            }
            const newGb = bigintToNumber(res.newTotalGb);
            if (!newGb || newGb <= 0) {
              toast.error(res.message || "Storage resize returned 0 GB — operation may have failed.");
              return;
            }
            toast.success(`Storage resized to ${newGb} GB`);
            setStorageGB(10); // Reset input
          },
          onError: (err) => {
            toast.error(`Failed: ${err.message}`);
          },
        },
      );
    }
    if (autoscaleEnabled) {
      toast.success(`Autoscale set to ${autoscaleCU} CU (billing integration pending)`);
    }
  }, [session?.id, storageGB, autoscaleEnabled, autoscaleCU, dbs, resizeMutation]);

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-1 p-4 animate-pulse space-y-4">
        <div className="flex items-center justify-between">
          <div className="skeleton h-5 w-24" />
          <div className="skeleton h-8 w-20 rounded-md" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between">
                <div className="skeleton h-3 w-16" />
                <div className="skeleton h-3 w-20" />
              </div>
              <div className="skeleton h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state — silently hidden, just don't show the card
  if (isError || !data) {
    return null;
  }

  const tier = data.tier || "free";
  const tierLabel = TIER_LABELS[tier] || tier;
  const limits = data.limits;
  const usage = data.usage;

  const maxDbs = bigintToNumber(limits?.maxDatabases);
  const maxStorage = bigintToNumber(limits?.maxStorageBytes);
  const maxReads = bigintToNumber(limits?.readUnitsPerMonth);
  const maxWrites = bigintToNumber(limits?.writeUnitsPerMonth);

  const dbCount = bigintToNumber(usage?.databaseCount);
  const storageUsed = bigintToNumber(usage?.storageBytes);
  const readsUsed = bigintToNumber(usage?.readUnitsUsed);
  const writesUsed = bigintToNumber(usage?.writeUnitsUsed);

  const showUpgrade = tier === "free" || tier === "scale";
  const isEnterprise = tier === "enterprise";

  // Map current tier → target upgrade tier
  const upgradeTarget: Record<string, string> = {
    free: "scale",
    scale: "team",
  };

  // Pricing from limits
  const storagePricePerGB = limits?.additionalStorageGbPrice ?? 0.20;
  const cuPricePerHour = limits?.autoscaleCuPrice ?? 0.04;
  const maxAutoscaleCU = limits?.autoscaleMaxCu ?? 0;
  const canAutoscale = maxAutoscaleCU > 0;

  // Estimated monthly hours (730 hours ≈ 1 month)
  const estimatedMonthlyHours = 730;

  // Cost calculations
  const storageCost = storageGB * storagePricePerGB;
  const autoscaleCost = autoscaleEnabled
    ? autoscaleCU * cuPricePerHour * estimatedMonthlyHours
    : 0;
  const totalAddonCost = storageCost + autoscaleCost;

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-1 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown size={16} className="text-accent-text" />
          <h3 className="text-sm font-semibold text-text-primary">
            {tierLabel} Plan
          </h3>
        </div>

        {isEnterprise ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-accent-subtle px-2.5 py-1 text-xs font-medium text-accent-text">
            <Building2 size={12} />
            Contact sales
          </span>
        ) : showUpgrade ? (
          <button
            type="button"
            onClick={async () => {
              try {
                const result = await createPayment(upgradeTarget[tier] || tier);
                window.location.href = result.checkout_url;
              } catch (err: any) {
                toast.error(err.message ?? "Failed to start payment");
              }
            }}
            disabled={paymentLoading}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-white",
              "bg-accent hover:bg-accent-hover active:bg-accent-pressed transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {paymentLoading ? (
              <><Loader2 size={12} className="animate-spin" /> Loading…</>
            ) : (
              <>
                Upgrade
                <ArrowUpRight size={12} />
              </>
            )}
          </button>
        ) : (
          <span className="text-xs text-text-muted">Current plan</span>
        )}
      </div>

      {/* Usage bars */}
      <div className="space-y-3">
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
      </div>

      {/* ── Add-ons Section ── */}
      <div className="border-t border-border-subtle pt-4 space-y-4">
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
          <Zap size={12} />
          Add-ons
        </h4>

        {/* Additional Storage */}
        <div className="rounded-md border border-border-subtle bg-surface-2 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <HardDrive size={14} className="text-text-secondary" />
            <span className="text-xs font-medium text-text-primary">
              Additional Storage
            </span>
            <span className="text-[11px] text-text-muted ml-auto">
              €{storagePricePerGB.toFixed(2)}/GB/mo
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={1000}
              value={storageGB}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= 0) setStorageGB(v);
              }}
              className={cn(
                "w-20 rounded-md bg-surface-1 border border-border-subtle",
                "px-2.5 py-1.5 text-xs text-text-primary text-center",
                "focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent",
                "transition-colors tabular-nums",
              )}
            />
            <span className="text-xs text-text-muted">GB</span>
            <span className="text-xs text-text-muted ml-auto">
              +€{storageCost.toFixed(2)}/mo
            </span>
          </div>
        </div>

        {/* Autoscale Compute */}
        <div className="rounded-md border border-border-subtle bg-surface-2 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Cpu size={14} className="text-text-secondary" />
            <span className="text-xs font-medium text-text-primary">
              Autoscale Compute
            </span>
            <span className="text-[11px] text-text-muted ml-auto">
              €{cuPricePerHour.toFixed(2)}/CU-hr
            </span>
          </div>

          {canAutoscale ? (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoscaleEnabled}
                  onClick={() => setAutoscaleEnabled(!autoscaleEnabled)}
                  className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                    "focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 focus:ring-offset-surface-2",
                    autoscaleEnabled ? "bg-accent" : "bg-surface-1 border-border-default",
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform ring-0 transition-transform",
                      autoscaleEnabled ? "translate-x-4" : "translate-x-0",
                    )}
                  />
                </button>
                <span
                  className={cn(
                    "text-xs font-medium",
                    autoscaleEnabled
                      ? "text-accent-text"
                      : "text-text-muted",
                  )}
                >
                  {autoscaleEnabled ? "ON" : "OFF"}
                </span>
              </div>

              {autoscaleEnabled && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-text-muted">
                      Max CU: <span className="text-text-primary font-mono">{autoscaleCU} CU</span>
                    </label>
                    <span className="text-xs text-text-muted tabular-nums">
                      ≈ €{autoscaleCost.toFixed(2)}/mo
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={maxAutoscaleCU > 0 && maxAutoscaleCU < 100 ? maxAutoscaleCU : 4}
                    value={autoscaleCU}
                    onChange={(e) =>
                      setAutoscaleCU(parseInt(e.target.value, 10))
                    }
                    className="w-full h-1.5 rounded-full appearance-none bg-surface-1 cursor-pointer
                      [&::-webkit-slider-thumb]:appearance-none
                      [&::-webkit-slider-thumb]:w-3.5
                      [&::-webkit-slider-thumb]:h-3.5
                      [&::-webkit-slider-thumb]:rounded-full
                      [&::-webkit-slider-thumb]:bg-accent
                      [&::-webkit-slider-thumb]:cursor-pointer
                      [&::-webkit-slider-thumb]:shadow-sm
                      accent-accent"
                  />
                  <div className="flex justify-between text-[10px] text-text-muted">
                    <span>1 CU</span>
                    <span>{maxAutoscaleCU > 0 && maxAutoscaleCU < 100 ? maxAutoscaleCU : 4} CU</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-text-muted italic">
              Autoscale not available on the {tierLabel} plan.
              <a href="/pricing" className="ml-1 text-accent-text hover:underline">
                Upgrade →
              </a>
            </p>
          )}
        </div>

        {/* Total add-on cost summary */}
        {(storageCost > 0 || autoscaleEnabled) && (
          <div className="flex items-center justify-between rounded-md bg-accent-subtle px-3 py-2">
            <span className="text-xs font-medium text-accent-text">
              Estimated add-on cost
            </span>
            <span className="text-xs font-bold text-accent-text tabular-nums">
              €{totalAddonCost.toFixed(2)}/mo
            </span>
          </div>
        )}

        {/* Apply button */}
        <button
          type="button"
          onClick={handleApply}
          disabled={resizeMutation.isPending}
          className={cn(
            "w-full rounded-md px-4 py-2 text-xs font-semibold transition-colors",
            "bg-accent text-white hover:bg-accent-hover active:bg-accent-pressed",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "min-h-[44px] flex items-center justify-center gap-1.5",
          )}
        >
          {resizeMutation.isPending ? (
            <><Loader2 size={14} className="animate-spin" /> Resizing...</>
          ) : (
            <>Apply Changes</>
          )}
        </button>
      </div>
    </div>
  );
}
