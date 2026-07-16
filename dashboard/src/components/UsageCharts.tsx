"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Activity, HardDrive, Cpu } from "lucide-react";
import { useMetrics, type MetricPoint } from "@/hooks/useMetrics";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateLabel(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Custom Tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
  valueLabel,
  valueUnit,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: number;
  valueLabel: string;
  valueUnit: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border border-border-subtle bg-surface-1 px-3 py-2 text-xs shadow-lg">
      <p className="text-text-muted mb-0.5">{formatDateLabel(label ?? 0)}</p>
      <p className="text-text-primary font-medium tabular-nums">
        {valueLabel}: {payload[0]?.value?.toFixed(2)} {valueUnit}
      </p>
    </div>
  );
}

// ── Loading Skeleton ─────────────────────────────────────────────────────────

function ChartSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border-subtle px-5 py-3.5">
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent className="p-5">
        <Skeleton className="h-[200px] w-full rounded-lg" />
      </CardContent>
    </Card>
  );
}

// ── Empty State ──────────────────────────────────────────────────────────────

function ChartEmpty({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border-subtle px-5 py-3.5">
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-center p-8">
        <p className="text-xs text-text-muted text-center">
          No usage data yet. Data appears after the first collection cycle.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

type UsageChartsProps = {
  databaseId: string;
};

export default function UsageCharts({ databaseId }: UsageChartsProps) {
  const { data: metrics, isLoading, isError } = useMetrics(databaseId);

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="space-y-4">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    );
  }

  // ── Error / Empty ──
  if (isError || !metrics || metrics.length === 0) {
    return (
      <div className="space-y-4">
        <ChartEmpty
          icon={<Cpu size={16} className="text-text-muted" />}
          title="CPU Usage (last 24h)"
        />
        <ChartEmpty
          icon={<HardDrive size={16} className="text-text-muted" />}
          title="Disk Usage (last 24h)"
        />
      </div>
    );
  }

  // Prepare chart data — recharts expects an array of objects
  const chartData = metrics.map((m: MetricPoint) => ({
    time: m.timestamp,
    cpu: m.cpuPercent,
    disk: m.diskGb,
  }));

  return (
    <div className="space-y-4">
      {/* CPU Chart */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Cpu size={16} className="text-accent-text" />
            <CardTitle className="text-sm font-semibold">
              CPU Usage (last 24h)
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border-subtle, #262626)"
                />
                <XAxis
                  dataKey="time"
                  tickFormatter={formatTime}
                  tick={{ fontSize: 10, fill: "var(--color-text-muted, #a3a3a3)" }}
                  axisLine={{ stroke: "var(--color-border-subtle, #262626)" }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--color-text-muted, #a3a3a3)" }}
                  axisLine={false}
                  tickLine={false}
                  unit="%"
                  domain={[0, "auto"]}
                />
                <Tooltip
                  content={
                    <ChartTooltip valueLabel="CPU" valueUnit="%" />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="cpu"
                  stroke="var(--color-accent, #3b82f6)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "var(--color-accent, #3b82f6)" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Disk Chart */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-2">
            <HardDrive size={16} className="text-text-muted" />
            <CardTitle className="text-sm font-semibold">
              Disk Usage (last 24h)
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border-subtle, #262626)"
                />
                <XAxis
                  dataKey="time"
                  tickFormatter={formatTime}
                  tick={{ fontSize: 10, fill: "var(--color-text-muted, #a3a3a3)" }}
                  axisLine={{ stroke: "var(--color-border-subtle, #262626)" }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--color-text-muted, #a3a3a3)" }}
                  axisLine={false}
                  tickLine={false}
                  unit=" GB"
                  domain={[0, "auto"]}
                />
                <Tooltip
                  content={
                    <ChartTooltip valueLabel="Disk" valueUnit="GB" />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="disk"
                  stroke="var(--color-muted-foreground, #a3a3a3)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: "var(--color-muted-foreground, #a3a3a3)",
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
