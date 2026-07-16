"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Crown,
  ArrowUpRight,
  Building2,
  Loader2,
  HardDrive,
  Cpu,
  Zap,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUsage } from "@/hooks/useUsage";
import { useResizeStorage } from "@/hooks/useResizeStorage";
import { useAuth } from "@/lib/auth";
import UsageBar from "./UsageBar";
import { useDatabases } from "@/hooks/useDatabases";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  // ── ALL hooks must stay above early returns ──
  const { data, isLoading, isError, error, refetch } = useUsage();
  const { session } = useAuth();
  const { data: dbs } = useDatabases();
  const resizeMutation = useResizeStorage();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Add-on state
  const [storageGB, setStorageGB] = useState<number>(10);
  const [autoscaleEnabled, setAutoscaleEnabled] = useState(false);
  const [autoscaleCU, setAutoscaleCU] = useState(1);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Mollie redirect detection — show dialog when user returns from payment
  useEffect(() => {
    const paymentStatus = searchParams.get("payment");
    if (paymentStatus === "success") {
      toast.success("Payment successful! Your plan has been updated.");
      // Force-refetch usage data in case webhook hasn't been processed yet
      refetch();
    } else if (paymentStatus === "cancelled") {
      toast.error("Payment was cancelled. Your plan has not been changed.");
    }
  }, [searchParams, refetch]);

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
              toast.error(
                res.message ||
                  "Storage resize returned 0 GB — operation may have failed.",
              );
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
      toast.success(
        `Autoscale set to ${autoscaleCU} CU (billing integration pending)`,
      );
    }
  }, [
    session?.id,
    storageGB,
    autoscaleEnabled,
    autoscaleCU,
    dbs,
    resizeMutation,
  ]);

  // ── Loading skeleton ──
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

  // ── Error state — silently hidden ──
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

  const isEnterprise = tier === "enterprise";
  // Free/Scale/Team/Business can upgrade; Enterprise shows Contact sales
  const showUpgrade = ["free", "scale", "team", "business"].includes(tier);

  // Map current tier → target upgrade tier
  const upgradeTarget: Record<string, string> = {
    free: "scale",
    scale: "team",
    team: "business",
    business: "enterprise",
  };

  // Pricing from limits
  const storagePricePerGB = limits?.additionalStorageGbPrice ?? 0.2;
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
    <Card className="p-4 space-y-4">
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
      <div className="space-y-4">
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
            <span className="text-[11px] text-muted-foreground ml-auto">
              €{storagePricePerGB.toFixed(2)}/GB/mo
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={1000}
              value={storageGB}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= 0) setStorageGB(v);
              }}
              className="w-20 text-center tabular-nums"
            />
            <span className="text-xs text-muted-foreground">GB</span>
            <span className="text-xs text-muted-foreground ml-auto">
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
            <span className="text-[11px] text-muted-foreground ml-auto">
              €{cuPricePerHour.toFixed(2)}/CU-hr
            </span>
          </div>

          {canAutoscale ? (
            <>
              <div className="flex items-center gap-2">
                <Switch
                  checked={autoscaleEnabled}
                  onCheckedChange={setAutoscaleEnabled}
                />
                <span
                  className={cn(
                    "text-xs font-medium",
                    autoscaleEnabled
                      ? "text-accent-text"
                      : "text-muted-foreground",
                  )}
                >
                  {autoscaleEnabled ? "ON" : "OFF"}
                </span>
              </div>

              {autoscaleEnabled && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-muted-foreground">
                      Max CU:{" "}
                      <span className="text-text-primary font-mono">
                        {autoscaleCU} CU
                      </span>
                    </label>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      ≈ €{autoscaleCost.toFixed(2)}/mo
                    </span>
                  </div>
                  <Slider
                    value={[autoscaleCU]}
                    onValueChange={(value: number | readonly number[]) =>
                      setAutoscaleCU(Array.isArray(value) ? value[0] : value)
                    }
                    min={1}
                    max={
                      maxAutoscaleCU > 0 && maxAutoscaleCU < 100
                        ? maxAutoscaleCU
                        : 4
                    }
                    step={1}
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>1 CU</span>
                    <span>
                      {maxAutoscaleCU > 0 && maxAutoscaleCU < 100
                        ? maxAutoscaleCU
                        : 4}{" "}
                      CU
                    </span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Autoscale not available on the {tierLabel} plan.
              <a
                href="/pricing"
                className="ml-1 text-accent-text hover:underline"
              >
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
        <Button
          onClick={() => setShowConfirmDialog(true)}
          disabled={resizeMutation.isPending}
          className="w-full"
        >
          {resizeMutation.isPending ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Resizing...
            </>
          ) : (
            "Apply Changes"
          )}
        </Button>

        {/* Confirm dialog */}
        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Info size={16} />
                Apply add-on changes?
              </DialogTitle>
              <DialogDescription
                render={
                  <div className="space-y-3 pt-2">
                    <p>
                      These changes will be applied immediately and{" "}
                      <strong>billed on your next invoice</strong> (post-paid).
                    </p>
                    {storageCost > 0 && (
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Additional storage ({storageGB} GB × €{storagePricePerGB.toFixed(2)}/GB)</span>
                        <span className="tabular-nums">+€{storageCost.toFixed(2)}/mo</span>
                      </div>
                    )}
                    {autoscaleEnabled && (
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Autoscale compute ({autoscaleCU} CU)</span>
                        <span className="tabular-nums">≈€{autoscaleCost.toFixed(2)}/mo</span>
                      </div>
                    )}
                    <div className="rounded-md bg-accent-subtle px-3 py-2 text-center">
                      <span className="text-xs font-semibold text-accent-text">
                        Total: +€{totalAddonCost.toFixed(2)}/mo on next invoice
                      </span>
                    </div>
                  </div>
                }
              />
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowConfirmDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setShowConfirmDialog(false);
                  handleApply();
                }}
              >
                Confirm & Apply
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
}
