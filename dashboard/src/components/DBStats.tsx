"use client";

import {
  HardDrive,
  Calendar,
  Shield,
  GitBranch,
  Activity,
  Database,
  Globe,
} from "lucide-react";
import { useDatabase } from "@/hooks/useDatabase";
import { formatDate } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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

// ── Main Component ─────────────────────────────────────────────────────────

export default function DBStats({ databaseId }: DBStatsProps) {
  const { data, isLoading, isError } = useDatabase(databaseId);
  const database = data?.database;

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

  return (
    <div className="space-y-4">
      {/* Usage Stats — honest: real metadata only; no fake metrics */}
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
              value="—"
              subtext="Not instrumented yet"
            />
            <StatCard
              icon={Database}
              label="Active Connections"
              value="—"
              subtext="Not instrumented yet"
            />
            <StatCard
              icon={Activity}
              label="Queries / sec"
              value="—"
              subtext="Not instrumented yet"
            />
            <StatCard
              icon={Calendar}
              label="Created"
              value={formatDate(database.createdAt)}
              subtext="Database creation time"
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

      {/* Backups — no mock data */}
      <Card className="animate-slide-up overflow-hidden">
        <CardHeader className="border-b border-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Shield size={15} className="text-success" />
            <CardTitle className="text-sm font-semibold">Backups</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-3.5">
          <p className="text-xs text-text-muted">
            No backups available yet.
          </p>
        </CardContent>
      </Card>

      {/* Branches — no mock data */}
      <Card className="animate-slide-up overflow-hidden">
        <CardHeader className="border-b border-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-2">
            <GitBranch size={15} className="text-accent-text" />
            <CardTitle className="text-sm font-semibold">Branches</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-3.5">
          <p className="text-xs text-text-muted">
            No branches created yet.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
