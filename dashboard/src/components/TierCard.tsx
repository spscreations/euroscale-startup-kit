"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Crown,
  ArrowUpRight,
  Building2,
} from "lucide-react";
import { useUsage } from "@/hooks/useUsage";
import UsageBar from "./UsageBar";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

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
  const { data, isLoading, isError, refetch } = useUsage();
  const searchParams = useSearchParams();
  const router = useRouter();

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
    </Card>
  );
}
