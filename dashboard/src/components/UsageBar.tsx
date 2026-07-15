"use client";

import { cn, formatBytes } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

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
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}G`;
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

  const barColorClass =
    pct >= 85
      ? "[&_[data-slot=progress-indicator]]:bg-destructive"
      : pct >= 60
        ? "[&_[data-slot=progress-indicator]]:bg-warning"
        : "[&_[data-slot=progress-indicator]]:bg-success";

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
                ? "text-destructive"
                : "text-text-secondary",
          )}
        >
          {isUnlimited
            ? "Unlimited"
            : unit === "B"
              ? `${formatBytes(used, 1)} / ${formatBytes(limit, 1)}`
              : `${formatNumber(used)} / ${formatNumber(limit)} ${unit}`}
        </span>
      </div>
      <Progress
        value={isUnlimited ? 100 : pct}
        className={cn("flex-col gap-0", barColorClass)}
      />
    </div>
  );
}
