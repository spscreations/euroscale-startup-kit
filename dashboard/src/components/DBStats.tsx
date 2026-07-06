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
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

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

  const badgeVariant: Record<string, "default" | "secondary" | "destructive"> = {
    success: "default",
    running: "secondary",
    failed: "destructive",
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
          <div className="flex items-center gap-2">
            <p className="text-xs text-text-primary capitalize">
              {backup.status}
            </p>
            <Badge variant={badgeVariant[backup.status]} className="text-[10px]">
              {backup.status}
            </Badge>
          </div>
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
      <Badge
        variant={branch.status === "active" ? "default" : "secondary"}
      >
        {branch.status}
      </Badge>
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
      <Card className="animate-fade-in">
        <CardContent className="space-y-3 pt-5">
          <Skeleton className="h-4 w-24" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError || !database) {
    return (
      <Card>
        <CardContent className="p-5 text-center">
          <p className="text-xs text-text-muted">
            Unable to load database stats.
          </p>
        </CardContent>
      </Card>
    );
  }

  const uptimeDays = Math.floor(usage.uptimeSeconds / 86400);

  return (
    <div className="space-y-4">
      {/* Usage Stats */}
      <Card className="animate-slide-up overflow-hidden">
        <CardHeader className="border-b border-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Activity size={15} className="text-text-muted" />
            <CardTitle className="text-sm font-semibold">Usage</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <div className="grid grid-cols-1 gap-2 pt-5 sm:grid-cols-2 lg:grid-cols-3">
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
        </CardContent>
      </Card>

      {/* Backups */}
      <Card className="animate-slide-up overflow-hidden">
        <CardHeader className="border-b border-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Shield size={15} className="text-success" />
            <CardTitle className="text-sm font-semibold">Backups</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-3.5">
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
        </CardContent>
      </Card>

      {/* Branches */}
      <Card className="animate-slide-up overflow-hidden">
        <CardHeader className="border-b border-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-2">
            <GitBranch size={15} className="text-accent-text" />
            <CardTitle className="text-sm font-semibold">Branches</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-3.5">
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
        </CardContent>
      </Card>
    </div>
  );
}
