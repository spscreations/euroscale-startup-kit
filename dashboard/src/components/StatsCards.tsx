"use client";

import { Database, Activity, HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardsProps {
  totalDatabases?: number;
  activeConnections?: number;
  storageUsed?: string;
  isLoading?: boolean;
}

const statConfigs = [
  {
    label: "Total Databases",
    icon: Database,
    getValue: (p: StatsCardsProps) =>
      p.totalDatabases !== undefined ? String(p.totalDatabases) : "—",
  },
  {
    label: "Active Connections",
    icon: Activity,
    getValue: (p: StatsCardsProps) =>
      p.activeConnections !== undefined ? String(p.activeConnections) : "—",
  },
  {
    label: "Storage Used",
    icon: HardDrive,
    getValue: (p: StatsCardsProps) => p.storageUsed ?? "—",
  },
];

export default function StatsCards(props: StatsCardsProps) {
  if (props.isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-border-subtle bg-surface-1 p-4 animate-pulse"
          >
            <div className="skeleton h-3 w-20 mb-3" />
            <div className="skeleton h-6 w-12" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {statConfigs.map((cfg) => {
        const Icon = cfg.icon;
        return (
          <div
            key={cfg.label}
            className="rounded-lg border border-border-subtle bg-surface-1 p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
                {cfg.label}
              </span>
              <Icon size={16} className="text-text-muted" />
            </div>
            <p className="text-2xl font-semibold text-text-primary tabular-nums">
              {cfg.getValue(props)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
