"use client";

import {
  Crown,
  ArrowUpRight,
  Building2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/utils";
import { useUsage } from "@/hooks/useUsage";
import UsageBar from "./UsageBar";

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  scale: "Scale",
  team: "Team",
  business: "Business",
  enterprise: "Enterprise",
};

function bigintToNumber(n: bigint | undefined): number {
  if (n === undefined || n === null) return 0;
  return Number(n);
}

export default function TierCard() {
  const { data, isLoading, isError, error } = useUsage();

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
          <a
            href="/pricing"
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-white",
              "bg-accent hover:bg-accent-hover active:bg-accent-pressed transition-colors",
            )}
          >
            Upgrade
            <ArrowUpRight size={12} />
          </a>
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
    </div>
  );
}
