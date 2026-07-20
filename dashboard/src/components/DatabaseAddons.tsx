"use client";

import { Zap, Loader2, WifiOff, Lock } from "lucide-react";
import { toast } from "sonner";
import { useUsage } from "@/hooks/useUsage";
import { useResizeStorage } from "@/hooks/useResizeStorage";
import { useSetAutoscale } from "@/hooks/useSetAutoscale";
import StorageCard from "@/components/StorageCard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

function bigintToNumber(n: number | bigint | undefined | null): number {
  if (n === undefined || n === null) return 0;
  return Number(n);
}

type DatabaseAddonsProps = {
  databaseId: string;
  databaseName: string;
};

/**
 * Storage & compute add-ons for a single selected database.
 * Isolated client component so hooks stay valid regardless of parent early returns.
 */
export default function DatabaseAddons({
  databaseId,
  databaseName,
}: DatabaseAddonsProps) {
  const { data: usageData, isLoading, error, refetch } = useUsage();
  const resizeMutation = useResizeStorage();
  const autoscaleMutation = useSetAutoscale();

  const limits = usageData?.limits;
  const usage = usageData?.usage;

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border-subtle px-5 py-3.5">
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent className="p-5">
          <div className="space-y-4">
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-text-muted" />
            <span className="text-sm font-semibold">Storage &amp; Compute Add-ons</span>
          </div>
        </CardHeader>
        <CardContent className="p-5 text-center">
          <WifiOff size={24} className="mx-auto text-text-muted mb-2" />
          <p className="text-xs text-text-muted">
            Could not load add-on data.
          </p>
          <Button
            variant="link"
            size="sm"
            onClick={() => refetch()}
            className="mt-2 h-auto p-0"
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const storageUsedBytes = bigintToNumber(usage?.storageBytes);
  const storageLimitBytes = bigintToNumber(limits?.maxStorageBytes);
  const storagePricePerGB = limits?.additionalStorageGbPrice ?? 0.2;
  const cuPricePerHour = limits?.autoscaleCuPrice ?? 0.04;
  const maxAutoscaleCU = limits?.autoscaleMaxCu ?? 0;
  const canAutoscale = maxAutoscaleCU > 0;
  const isFreeTier = maxAutoscaleCU <= 0;

  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="border-b border-border-subtle px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-accent-text" />
          <CardTitle className="text-sm font-semibold">
            Storage &amp; Compute Add-ons
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-5">
        <StorageCard
          storageUsedBytes={storageUsedBytes}
          storageLimitBytes={storageLimitBytes}
          storagePricePerGB={storagePricePerGB}
          currentCpuUsed={0}
          currentCpuLimit={maxAutoscaleCU > 0 ? maxAutoscaleCU : 2}
          cuPricePerHour={cuPricePerHour}
          maxAutoscaleCU={maxAutoscaleCU}
          canAutoscale={canAutoscale}
          databaseId={databaseId}
          onApplyStorage={(additionalGb: number) => {
            if (!databaseId) {
              toast.error("No database to resize.");
              return;
            }
            resizeMutation.mutate(
              { databaseId, additionalGb },
              {
                onSuccess: (res) => {
                  if (res.success !== true) {
                    toast.error(
                      res.message || "Storage resize failed unexpectedly.",
                    );
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
                  toast.success(
                    `Storage for ${databaseName} resized to ${newGb} GB`,
                  );
                  void refetch();
                },
                onError: (err) => {
                  toast.error(`Failed: ${err.message}`);
                },
              },
            );
          }}
          onApplyAutoscale={(
            enabled: boolean,
            threshold: number,
            increment: number,
          ) => {
            if (!databaseId) {
              toast.error("No database selected");
              return;
            }
            autoscaleMutation.mutate(
              { databaseId, enabled, thresholdPercent: threshold, incrementPercent: increment },
              {
                onSuccess: () => {
                  toast.success(`Autoscale ${enabled ? "enabled" : "disabled"} for ${databaseName}`);
                  void refetch();
                },
                onError: (err) => {
                  toast.error(`Autoscale failed: ${err.message}`);
                },
              },
            );
          }}
          isApplying={resizeMutation.isPending || autoscaleMutation.isPending}
        />
      </CardContent>
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
    </Card>
  );
}
