"use client";

import { Zap } from "lucide-react";
import { toast } from "sonner";
import { useUsage } from "@/hooks/useUsage";
import { useResizeStorage } from "@/hooks/useResizeStorage";
import StorageCard from "@/components/StorageCard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

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
  const { data: usageData, refetch } = useUsage();
  const resizeMutation = useResizeStorage();

  const limits = usageData?.limits;
  const usage = usageData?.usage;

  const storageUsedBytes = bigintToNumber(usage?.storageBytes);
  const storageLimitBytes = bigintToNumber(limits?.maxStorageBytes);
  const storagePricePerGB = limits?.additionalStorageGbPrice ?? 0.2;
  const cuPricePerHour = limits?.autoscaleCuPrice ?? 0.04;
  const maxAutoscaleCU = limits?.autoscaleMaxCu ?? 0;
  const canAutoscale = maxAutoscaleCU > 0;

  return (
    <Card className="overflow-hidden">
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
            _enabled: boolean,
            threshold: number,
            increment: number,
          ) => {
            toast.success(
              `Storage autoscale for ${databaseName}: ${threshold}% threshold, ${increment}% increment (billing integration pending)`,
            );
          }}
          isApplying={resizeMutation.isPending}
        />
      </CardContent>
    </Card>
  );
}
