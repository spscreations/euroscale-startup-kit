"use client";

import { Database, Activity, HardDrive, Loader2 } from "lucide-react";
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
    color: "from-purple-500 to-purple-400",
    shadow: "shadow-purple-500/20",
  },
  {
    label: "Active Connections",
    icon: Activity,
    getValue: (p: StatsCardsProps) =>
      p.activeConnections !== undefined ? String(p.activeConnections) : "—",
    color: "from-cyan-400 to-cyan-300",
    shadow: "shadow-cyan-400/20",
  },
  {
    label: "Storage Used",
    icon: HardDrive,
    getValue: (p: StatsCardsProps) => p.storageUsed ?? "—",
    color: "from-green-400 to-green-300",
    shadow: "shadow-green-400/20",
  },
];

export default function StatsCards(props: StatsCardsProps) {
  if (props.isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="glass-card rounded-xl p-5 animate-pulse"
          >
            <div className="h-4 w-24 rounded bg-navy-600 mb-3" />
            <div className="h-8 w-16 rounded bg-navy-600" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {statConfigs.map((cfg) => {
        const Icon = cfg.icon;
        return (
          <div
            key={cfg.label}
            className={cn(
              "glass-card rounded-xl p-5 transition-all duration-200",
              "hover:border-purple-500/30 hover:shadow-lg",
              cfg.shadow,
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                {cfg.label}
              </span>
              <Icon
                size={20}
                className={cn(
                  "bg-gradient-to-br rounded-lg p-0.5 text-white",
                  cfg.color,
                )}
              />
            </div>
            <p className="text-3xl font-bold text-text-primary tracking-tight">
              {cfg.getValue(props)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
