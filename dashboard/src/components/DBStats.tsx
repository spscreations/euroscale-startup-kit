"use client";

import { useMemo } from "react";
import {
  HardDrive,
  Calendar,
  Shield,
  GitBranch,
  Activity,
  Database,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDatabase } from "@/hooks/useDatabase";
import type { Database as DatabaseType } from "@/lib/proto/euroscale/v1/database_pb";
import { formatDate, formatBytes } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

interface DBStatsProps {
  databaseId: string;
}

interface StatCardProps {
  icon: React.ComponentType<{ size: number; className?: string }>;
  label: string;
  value: string | number;
  subtext?: string;
  accent?: "purple" | "green" | "gold" | "cyan";
}

// ── Usage stats (simulated for now; replace with real API data) ─────────────

interface UsageStats {
  storageUsed: number;       // bytes
  storageLimit: number;      // bytes
  connections: number;
  queriesPerSecond: number;
  uptimeSeconds: number;
}

function mockUsageStats(): UsageStats {
  return {
    storageUsed: 256_000_000,         // ~256 MB
    storageLimit: 1_000_000_000,       // 1 GB
    connections: 3,
    queriesPerSecond: 42,
    uptimeSeconds: 86400 * 14,        // 14 days
  };
}

interface Backup {
  id: string;
  status: "success" | "running" | "failed";
  size: number;
  createdAt: string;
}

function mockBackups(): Backup[] {
  return [
    { id: "bkp_001", status: "success", size: 128_000_000, createdAt: "2026-07-02T03:00:00Z" },
    { id: "bkp_002", status: "success", size: 95_000_000, createdAt: "2026-07-01T03:00:00Z" },
    { id: "bkp_003", status: "success", size: 110_000_000, createdAt: "2026-06-30T03:00:00Z" },
  ];
}

interface Branch {
  id: string;
  name: string;
  status: "active" | "inactive";
  createdAt: string;
}

function mockBranches(): Branch[] {
  return [
    { id: "br_main", name: "main", status: "active", createdAt: "2026-06-18T12:00:00Z" },
    { id: "br_dev", name: "staging", status: "active", createdAt: "2026-06-25T09:00:00Z" },
  ];
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, subtext, accent = "purple" }: StatCardProps) {
  const accentColors: Record<string, string> = {
    purple: "bg-purple-500/15 text-purple-400",
    green: "bg-green-500/15 text-green-400",
    gold: "bg-gold-500/15 text-gold-400",
    cyan: "bg-cyan-500/15 text-cyan-400",
  };

  return (
    <div className="flex items-center gap-3 rounded-lg bg-navy-800/60 px-4 py-3">
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", accentColors[accent])}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
          {label}
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-text-primary">
          {value}
        </p>
        {subtext && (
          <p className="truncate text-xs text-text-muted">{subtext}</p>
        )}
      </div>
    </div>
  );
}

function BackupRow({ backup }: { backup: Backup }) {
  const statusColors: Record<string, string> = {
    success: "bg-green-400",
    running: "bg-gold-400",
    failed: "bg-red-400",
  };

  return (
    <div className="flex items-center justify-between rounded-lg bg-navy-800/40 px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className={cn("flex h-2 w-2 rounded-full", statusColors[backup.status])} />
        <div>
          <p className="text-sm text-text-primary capitalize">{backup.status}</p>
          <p className="text-xs text-text-muted">{formatDate(backup.createdAt)}</p>
        </div>
      </div>
      <span className="text-xs text-text-muted">{formatBytes(backup.size)}</span>
    </div>
  );
}

function BranchRow({ branch }: { branch: Branch }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-navy-800/40 px-4 py-2.5">
      <div className="flex items-center gap-3">
        <GitBranch size={14} className="text-purple-400" />
        <div>
          <p className="text-sm font-medium text-text-primary">{branch.name}</p>
          <p className="text-xs text-text-muted">Created {formatDate(branch.createdAt)}</p>
        </div>
      </div>
      <span
        className={cn(
          "rounded-full px-2.5 py-0.5 text-xs font-medium",
          branch.status === "active"
            ? "bg-green-500/15 text-green-400"
            : "bg-navy-600 text-text-muted"
        )}
      >
        {branch.status}
      </span>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function DBStats({ databaseId }: DBStatsProps) {
  const { data, isLoading, isError } = useDatabase(databaseId);
  const database = data?.database;

  // Mock data (will be replaced with real API data)
  const usage = useMemo(() => mockUsageStats(), []);
  const backups = useMemo(() => mockBackups(), []);
  const branches = useMemo(() => mockBranches(), []);

  if (isLoading) {
    return (
      <div className="glass-card animate-fade p-6">
        <div className="space-y-4">
          <div className="shimmer h-5 w-32 rounded" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="shimmer h-16 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError || !database) {
    return (
      <div className="glass-card p-6 text-center">
        <p className="text-sm text-text-muted">Unable to load database stats.</p>
      </div>
    );
  }

  const storageUsagePercent = Math.round((usage.storageUsed / usage.storageLimit) * 100);
  const uptimeDays = Math.floor(usage.uptimeSeconds / 86400);

  return (
    <div className="space-y-6">
      {/* ── Usage Stats ──────────────────────────────────────────────── */}
      <div className="glass-card animate-slide-up">
        <div className="border-b border-glass-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-text-muted" />
            <h2 className="text-base font-semibold text-text-primary">Usage</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            icon={HardDrive}
            label="Storage"
            value={`${formatBytes(usage.storageUsed)} / ${formatBytes(usage.storageLimit)}`}
            subtext={`${storageUsagePercent}% used`}
            accent="cyan"
          />
          <StatCard
            icon={Database}
            label="Active Connections"
            value={usage.connections}
            subtext="Current pool size"
            accent="green"
          />
          <StatCard
            icon={Activity}
            label="Queries / sec"
            value={usage.queriesPerSecond.toLocaleString()}
            subtext="Average QPS"
            accent="purple"
          />
          <StatCard
            icon={Calendar}
            label="Uptime"
            value={`${uptimeDays} day${uptimeDays !== 1 ? "s" : ""}`}
            subtext={`Created ${formatDate(database.createdAt)}`}
            accent="gold"
          />
          <StatCard
            icon={Globe}
            label="Region"
            value={database.region.charAt(0).toUpperCase() + database.region.slice(1)}
            subtext={database.engine.toUpperCase()}
          />
          <StatCard
            icon={Shield}
            label="Status"
            value={database.status.charAt(0).toUpperCase() + database.status.slice(1)}
            subtext={database.status === "ready" ? "Healthy" : "Pending"}
            accent={database.status === "ready" ? "green" : "gold"}
          />
        </div>
      </div>

      {/* ── Backups ──────────────────────────────────────────────────── */}
      <div className="glass-card animate-slide-up">
        <div className="border-b border-glass-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-green-400" />
            <h2 className="text-base font-semibold text-text-primary">Backups</h2>
          </div>
        </div>

        <div className="p-6 pt-4">
          {backups.length === 0 ? (
            <p className="text-sm text-text-muted">No backups available yet.</p>
          ) : (
            <div className="space-y-2">
              {backups.map((backup) => (
                <BackupRow key={backup.id} backup={backup} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Branches ─────────────────────────────────────────────────── */}
      <div className="glass-card animate-slide-up">
        <div className="border-b border-glass-border px-6 py-4">
          <div className="flex items-center gap-2">
            <GitBranch size={16} className="text-purple-400" />
            <h2 className="text-base font-semibold text-text-primary">Branches</h2>
          </div>
        </div>

        <div className="p-6 pt-4">
          {branches.length === 0 ? (
            <p className="text-sm text-text-muted">No branches created yet.</p>
          ) : (
            <div className="space-y-2">
              {branches.map((branch) => (
                <BranchRow key={branch.id} branch={branch} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
