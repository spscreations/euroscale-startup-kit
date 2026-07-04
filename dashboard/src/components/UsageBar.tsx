"use client";

import { cn } from "@/lib/utils";

interface UsageBarProps {
  /** Display label for the resource */
  label: string;
  /** Current usage amount */
  used: number;
  /** Maximum allowed (0 = unlimited) */
  limit: number;
  /** Unit string (e.g. "databases", "GB", "reads") */
  unit: string;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/**
 * A reusable progress bar showing used vs limit.
 * Green when <60%, yellow at 60–85%, red >85%.
 */
export default function UsageBar({ label, used, limit, unit }: UsageBarProps) {
  const isUnlimited = limit <= 0;
  const pct = isUnlimited ? 0 : Math.min((used / limit) * 100, 100);

  const barColor =
    pct >= 85
      ? "bg-error"
      : pct >= 60
        ? "bg-warning"
        : "bg-success";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">
          {label}
        </span>
        <span
          className={cn(
            "text-xs tabular-nums",
            isUnlimited
              ? "text-text-muted"
              : pct >= 85
                ? "text-error-text"
                : "text-text-secondary",
          )}
        >
          {isUnlimited
            ? "Unlimited"
            : `${formatNumber(used)} / ${formatNumber(limit)} ${unit}`}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-surface-2 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor)}
          style={{ width: `${isUnlimited ? 100 : pct}%` }}
        />
      </div>
    </div>
  );
}
