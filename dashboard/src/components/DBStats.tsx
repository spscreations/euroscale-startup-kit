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
}

// ── Usage stats (simulated) ────────────────────────────────────────────────

interface UsageStats {
  storageUsed: number;
  storageLimit: number;
  connections: number;
  queriesPerSecond: number;
  uptimeSeconds: number;
}

function mockUsageStats(): UsageStats {
  return {
    storageUsed: 256_000_000,
    storageLimit: 1_000_000_000,
    connections: 3,
    queriesPerSecond: 42,
    uptimeSeconds: 86400 * 14,
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
    {
      id: "bkp_001",
      status: "success",
      size: 128_000_000,
      createdAt: "2026-07-02T03:00:00Z",
    },
    {
      id: "bkp_002",
      status: "success",
      size: 95_000_000,
      createdAt: "2026-07-01T03:00:00Z",
    },
    {
      id: "bkp_003",
      status: "success",
      size: 110_000_000,
      createdAt: "2026-06-30T03:00:00Z",
    },
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
    {
      id: "br_main",
      name: "main",
      status: "active",
      createdAt: "2026-06-18T12:00:00Z",
    },
    {
      id: "br_dev",
      name: "staging",
      status: "active",
      createdAt: "2026-06-25T09:00:00Z",
    },
  ];
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, subtext }: StatCardProps) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-surface-2 px-3 py-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-subtle">
        <Icon size={16} className="text-accent-text" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
          {label}
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-text-primary">
          {value}
        </p>
        {subtext && (
          <p className="truncate text-[11px] text-text-muted">{subtext}</p>
        )}
      </div>
    </div>
  );
}

function BackupRow({ backup }: { backup: Backup }) {
  const statusColors: Record<string, string> = {
    success: "bg-success",
    running: "bg-warning",
    failed: "bg-error",
  };

  return (
    <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "flex h-2 w-2 rounded-full",
            statusColors[backup.status],
          )}
        />
        <div>
          <p className="text-xs text-text-primary capitalize">
            {backup.status}
          </p>
          <p className="text-[11px] text-text-muted">
            {formatDate(backup.createdAt)}
          </p>
        </div>
      </div>
      <span className="text-[11px] text-text-muted">
        {formatBytes(backup.size)}
      </span>
    </div>
  );
}

function BranchRow({ branch }: { branch: Branch }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2">
      <div className="flex items-center gap-2.5">
        <GitBranch size={13} className="text-accent-text" />
        <div>
          <p className="text-xs font-medium text-text-primary">
            {branch.name}
          </p>
          <p className="text-[11px] text-text-muted">
            Created {formatDate(branch.createdAt)}
          </p>
        </div>
      </div>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-medium",
          branch.status === "active"
            ? "bg-success-subtle text-success-text"
            : "bg-surface-3 text-text-disabled",
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

  const usage = useMemo(() => mockUsageStats(), []);
  const backups = useMemo(() => mockBackups(), []);
  const branches = useMemo(() => mockBranches(), []);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface-1 animate-fade-in p-5">
        <div className="space-y-3">
          <div className="skeleton h-4 w-24" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-14 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError || !database) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface-1 p-5 text-center">
        <p className="text-xs text-text-muted">
          Unable to load database stats.
        </p>
      </div>
    );
  }

  const uptimeDays = Math.floor(usage.uptimeSeconds / 86400);

  return (
    <div className="space-y-4">
      {/* Usage Stats */}
      <div className="rounded-xl border border-border-subtle bg-surface-1 animate-slide-up overflow-hidden">
        <div className="border-b border-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Activity size={15} className="text-text-muted" />
            <h2 className="text-sm font-semibold text-text-primary">Usage</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            icon={HardDrive}
            label="Storage"
            value={`${formatBytes(usage.storageUsed)} / ${formatBytes(usage.storageLimit)}`}
            subtext={`${Math.round((usage.storageUsed / usage.storageLimit) * 100)}% used`}
          />
          <StatCard
            icon={Database}
            label="Active Connections"
            value={usage.connections}
            subtext="Current pool size"
          />
          <StatCard
            icon={Activity}
            label="Queries / sec"
            value={usage.queriesPerSecond.toLocaleString()}
            subtext="Average QPS"
          />
          <StatCard
            icon={Calendar}
            label="Uptime"
            value={`${uptimeDays} day${uptimeDays !== 1 ? "s" : ""}`}
            subtext={`Created ${formatDate(database.createdAt)}`}
          />
          <StatCard
            icon={Globe}
            label="Region"
            value={
              database.region.charAt(0).toUpperCase() +
              database.region.slice(1)
            }
            subtext={database.engine.toUpperCase()}
          />
          <StatCard
            icon={Shield}
            label="Status"
            value={
              database.status.charAt(0).toUpperCase() +
              database.status.slice(1)
            }
            subtext={database.status === "ready" ? "Healthy" : "Pending"}
          />
        </div>
      </div>

      {/* Backups */}
      <div className="rounded-xl border border-border-subtle bg-surface-1 animate-slide-up overflow-hidden">
        <div className="border-b border-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Shield size={15} className="text-success" />
            <h2 className="text-sm font-semibold text-text-primary">
              Backups
            </h2>
          </div>
        </div>

        <div className="p-5 pt-3.5">
          {backups.length === 0 ? (
            <p className="text-xs text-text-muted">
              No backups available yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {backups.map((backup) => (
                <BackupRow key={backup.id} backup={backup} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Branches */}
      <div className="rounded-xl border border-border-subtle bg-surface-1 animate-slide-up overflow-hidden">
        <div className="border-b border-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-2">
            <GitBranch size={15} className="text-accent-text" />
            <h2 className="text-sm font-semibold text-text-primary">
              Branches
            </h2>
          </div>
        </div>

        <div className="p-5 pt-3.5">
          {branches.length === 0 ? (
            <p className="text-xs text-text-muted">
              No branches created yet.
            </p>
          ) : (
            <div className="space-y-1.5">
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
