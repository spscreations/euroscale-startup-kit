"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useCallback, type FormEvent } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  CopyCheck,
  Eye,
  EyeOff,
  RefreshCw,
  Trash2,
  Loader2,
  AlertTriangle,
  Database,
  HardDrive,
  Activity,
  Zap,
  Clock,
  Shield,
  ShieldAlert,
  WifiOff,
} from "lucide-react";
import { cn, copyToClipboard, formatDate, formatBytes } from "@/lib/utils";
import { useDatabase } from "@/hooks/useDatabase";
import { useDeleteDatabase } from "@/hooks/useDeleteDatabase";
import { useRotateCredentials } from "@/hooks/useRotateCredentials";
import { useUsage } from "@/hooks/useUsage";
import IPWhitelist from "@/components/IPWhitelist";
import UsageCharts from "@/components/UsageCharts";
import DatabaseAddons from "@/components/DatabaseAddons";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function useCopyToClipboard() {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = useCallback(async (text: string, label: string) => {
    try {
      await copyToClipboard(text);
      setCopied(label);
      toast.success(`Copied ${label}`);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  }, []);

  return { copied, copy };
}

function statusBadge(status: string) {
  const normalized = status.toLowerCase();
  switch (normalized) {
    case "ready":
      return { label: "Ready", variant: "default" as const };
    case "creating":
      return { label: "Creating", variant: "secondary" as const };
    case "deleting":
      return { label: "Deleting", variant: "destructive" as const };
    case "deleted":
      return { label: "Deleted", variant: "secondary" as const };
    case "error":
      return { label: "Error", variant: "destructive" as const };
    default:
      return { label: status, variant: "secondary" as const };
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CopyButton({
  value,
  label,
  copied,
  onCopy,
}: {
  value: string;
  label: string;
  copied: string | null;
  onCopy: (text: string, label: string) => void;
}) {
  const isActive = copied === label;
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={() => onCopy(value, label)}
      className={cn(isActive && "text-success")}
      aria-label={`Copy ${label}`}
    >
      {isActive ? <CopyCheck size={13} /> : <Copy size={13} />}
    </Button>
  );
}

function FieldRow({
  label,
  value,
  mono = false,
  copyLabel,
  copied,
  onCopy,
  children,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyLabel: string;
  copied: string | null;
  onCopy: (text: string, label: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border-subtle last:border-b-0">
      <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider min-w-[80px]">
        {label}
      </span>
      <div className="flex items-center ml-2 overflow-hidden">
        <span
          className={cn(
            "text-sm text-text-primary truncate max-w-[220px] sm:max-w-md",
            mono && "font-mono text-xs",
          )}
        >
          {value}
        </span>
        <CopyButton
          value={value}
          label={copyLabel}
          copied={copied}
          onCopy={onCopy}
        />
        {children}
      </div>
    </div>
  );
}

function ConnectionStringRow({
  host,
  port,
  username,
  copied,
  onCopy,
}: {
  host: string;
  port: number;
  username: string;
  copied: string | null;
  onCopy: (text: string, label: string) => void;
}) {
  const connStr = `mysql://${username}:***@${host}:${port}`;
  return (
    <div className="mt-2.5 p-3 rounded-lg bg-surface-2 border border-border-subtle">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
          Connection String
        </span>
        <CopyButton
          value={connStr}
          label="Connection String"
          copied={copied}
          onCopy={onCopy}
        />
      </div>
      <code className="text-[11px] text-accent-text break-all block font-mono">
        {connStr}
      </code>
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <Skeleton className="h-7 w-7 rounded-lg" />
          <Skeleton className="h-6 w-40 rounded" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="space-y-3 pt-5">
              <Skeleton className="h-4 w-28 rounded" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-full rounded" />
                <Skeleton className="h-3 w-3/4 rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DatabaseDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const { data, isLoading, error } = useDatabase(id);
  const { data: usageData } = useUsage();
  const deleteMutation = useDeleteDatabase();
  const rotateMutation = useRotateCredentials();

  const { copied, copy } = useCopyToClipboard();

  const [showPassword, setShowPassword] = useState(false);
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [rotatedCreds, setRotatedCreds] = useState<{
    password: string;
    sslCaPem: string;
    connectionString: string;
  } | null>(null);

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) return <DetailSkeleton />;

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="max-w-sm w-full text-center space-y-3 p-6">
          <WifiOff size={32} className="text-error-text mx-auto" />
          <div>
            <CardTitle className="text-sm font-semibold">
              Something went wrong
            </CardTitle>
            <p className="text-xs text-text-muted mt-1">
              {error instanceof Error
                ? error.message
                : "An unexpected error occurred."}
            </p>
          </div>
          <div className="flex gap-2.5 justify-center pt-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/dashboard")}
            >
              <ArrowLeft size={13} />
              Dashboard
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────────
  if (!data?.database) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="max-w-sm w-full text-center space-y-3 p-6">
          <Database size={36} className="text-text-disabled mx-auto" />
          <div>
            <CardTitle className="text-sm font-semibold">
              Database Not Found
            </CardTitle>
            <p className="text-xs text-text-muted mt-1">
              The database you&apos;re looking for doesn&apos;t exist or you
              don&apos;t have access.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push("/dashboard")}
          >
            <ArrowLeft size={14} /> Back to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  // ── Data ─────────────────────────────────────────────────────────────────────
  const db = data.database!;
  const badge = statusBadge(db.status);

  // Real account usage when available; connections/queries not instrumented yet
  const storageBytes = usageData?.usage?.storageBytes;
  const maxStorageBytes = usageData?.limits?.maxStorageBytes;
  const hasStorage =
    storageBytes !== undefined && maxStorageBytes !== undefined;
  const storageUsedNum = hasStorage ? Number(storageBytes) : null;
  const storageLimitNum = hasStorage ? Number(maxStorageBytes) : null;
  const storageProgress =
    storageUsedNum !== null &&
    storageLimitNum !== null &&
    storageLimitNum > 0
      ? Math.round((storageUsedNum / storageLimitNum) * 100)
      : 0;

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync({ databaseId: id });
      toast.success("Database deleted successfully");
      router.push("/dashboard");
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : "Failed to delete database",
      );
    }
    setShowDeleteConfirm(false);
  }

  async function handleRotate() {
    try {
      const result = await rotateMutation.mutateAsync({ databaseId: id });
      setRotatedCreds({
        password: result.password,
        sslCaPem: result.sslCaPem,
        connectionString: result.connectionString,
      });
      toast.success("Credentials rotated successfully");
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : "Failed to rotate credentials",
      );
    }
    setShowRotateConfirm(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-4 animate-fade-in">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/dashboard")}
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={18} />
          </Button>
          <h1 className="text-xl font-bold text-text-primary truncate">
            {db.name}
          </h1>
          <Badge variant={badge.variant} className="uppercase tracking-wider text-[11px]">
            {badge.label === "Ready" && (
              <span className="w-1.5 h-1.5 rounded-full bg-success mr-1" />
            )}
            {badge.label}
          </Badge>
          <Badge variant="secondary" className="uppercase tracking-wider text-[11px]">
            {db.engine}
          </Badge>
        </div>

        <p className="text-xs text-text-muted -mt-3">
          {db.region} · Created {formatDate(db.createdAt)}
        </p>

        {/* Connection Info */}
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border-subtle px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Database size={16} className="text-accent-text" />
              <CardTitle className="text-sm font-semibold">Connection Info</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-1">
            <FieldRow
              label="Host"
              value={db.host ?? "—"}
              mono
              copyLabel="Host"
              copied={copied}
              onCopy={copy}
            />
            <FieldRow
              label="Port"
              value={String(db.port ?? "3306")}
              copyLabel="Port"
              copied={copied}
              onCopy={copy}
            />
            <FieldRow
              label="Username"
              value={db.username ?? "—"}
              mono
              copyLabel="Username"
              copied={copied}
              onCopy={copy}
            />
            <FieldRow
              label="Database ID"
              value={db.databaseId}
              mono
              copyLabel="Database ID"
              copied={copied}
              onCopy={copy}
            />

            {/* Password */}
            <div className="flex items-center justify-between py-2 border-b border-border-subtle last:border-b-0">
              <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider min-w-[80px]">
                Password
              </span>
              <div className="flex items-center ml-2 overflow-hidden">
                {!rotatedCreds && db.status === "ready" ? (
                  <span className="text-xs text-text-disabled italic">
                    Not available — shown only once
                  </span>
                ) : rotatedCreds ? (
                  <>
                    <span className="text-xs text-text-primary truncate max-w-[180px] sm:max-w-sm font-mono">
                      {showPassword
                        ? rotatedCreds.password
                        : "••••••••••••••••••••"}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                    </Button>
                    <CopyButton
                      value={rotatedCreds.password}
                      label="Password"
                      copied={copied}
                      onCopy={copy}
                    />
                  </>
                ) : (
                  <span className="text-xs text-text-disabled italic">—</span>
                )}
              </div>
            </div>

            {/* SSL CA */}
            <div className="flex items-center justify-between py-2 border-b border-border-subtle last:border-b-0">
              <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider min-w-[80px]">
                SSL CA
              </span>
              <div className="flex items-center ml-2 overflow-hidden">
                {db.sslCaPem ? (
                  <>
                    <span className="text-xs text-text-primary truncate max-w-[180px] sm:max-w-sm font-mono">
                      {db.sslCaPem.slice(0, 30)}…
                    </span>
                    <CopyButton
                      value={db.sslCaPem}
                      label="SSL CA"
                      copied={copied}
                      onCopy={copy}
                    />
                  </>
                ) : rotatedCreds?.sslCaPem ? (
                  <>
                    <span className="text-xs text-text-primary truncate max-w-[180px] sm:max-w-sm font-mono">
                      {rotatedCreds.sslCaPem.slice(0, 30)}…
                    </span>
                    <CopyButton
                      value={rotatedCreds.sslCaPem}
                      label="SSL CA"
                      copied={copied}
                      onCopy={copy}
                    />
                  </>
                ) : (
                  <span className="text-xs text-text-disabled italic">—</span>
                )}
              </div>
            </div>

            <ConnectionStringRow
              host={db.host ?? "localhost"}
              port={db.port ?? 3306}
              username={db.username ?? "unknown"}
              copied={copied}
              onCopy={copy}
            />

            {/* Credentials warning */}
            <div className="flex items-start gap-2 mt-3 p-2.5 rounded-lg bg-warning-subtle border border-warning-subtle">
              <AlertTriangle
                size={13}
                className="text-warning-text shrink-0 mt-0.5"
              />
              <p className="text-xs text-text-muted">
                Credentials are shown <strong>only once</strong> after creation
                or rotation. Store them securely — they cannot be retrieved
                later.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Usage Stats */}
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border-subtle px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-text-muted" />
              <CardTitle className="text-sm font-semibold">Usage Stats</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 p-5 sm:grid-cols-3">
            <div className="p-3.5 rounded-lg bg-surface-2 border border-border-subtle space-y-1.5">
              <div className="flex items-center gap-1.5">
                <HardDrive size={13} className="text-accent-text" />
                <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
                  Storage
                </span>
              </div>
              {hasStorage && storageUsedNum !== null && storageLimitNum !== null ? (
                <>
                  <p className="text-base font-semibold text-text-primary">
                    {formatBytes(storageUsedNum)}{" "}
                    <span className="text-xs text-text-muted font-normal">
                      / {formatBytes(storageLimitNum)}
                    </span>
                  </p>
                  {storageLimitNum > 0 && (
                    <Progress value={storageProgress} className="h-1.5" />
                  )}
                  <p className="text-[11px] text-text-muted">Account total</p>
                </>
              ) : (
                <>
                  <p className="text-base font-semibold text-text-primary">—</p>
                  <p className="text-[11px] text-text-muted">
                    Metrics not available yet
                  </p>
                </>
              )}
            </div>

            <div className="p-3.5 rounded-lg bg-surface-2 border border-border-subtle space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Zap size={13} className="text-accent-text" />
                <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
                  Connections
                </span>
              </div>
              <p className="text-base font-semibold text-text-primary">—</p>
              <p className="text-[11px] text-text-muted">
                Metrics not available yet
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-surface-2 border border-border-subtle space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Activity size={13} className="text-accent-text" />
                <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
                  Queries
                </span>
              </div>
              <p className="text-base font-semibold text-text-primary">—</p>
              <p className="text-[11px] text-text-muted">
                Metrics not available yet
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Usage Charts (line charts) */}
        <UsageCharts databaseId={db.databaseId} />

        {/* Storage & Compute Add-ons for THIS database */}
        <DatabaseAddons
          databaseId={db.databaseId}
          databaseName={db.name}
        />

        {/* Backups */}
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border-subtle px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-success" />
              <CardTitle className="text-sm font-semibold">Backups</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
            <div className="p-3.5 rounded-lg bg-surface-2 border border-border-subtle space-y-1">
              <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
                Last Backup
              </span>
              <p className="text-xs text-text-primary flex items-center gap-1.5">
                <Clock size={12} className="text-text-muted" />
                <span className="text-text-muted">
                  Backups not yet configured
                </span>
              </p>
            </div>
            <div className="p-3.5 rounded-lg bg-surface-2 border border-border-subtle space-y-1">
              <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
                Next Scheduled
              </span>
              <p className="text-xs text-text-primary flex items-center gap-1.5">
                <Clock size={12} className="text-text-muted" />
                <span className="text-text-muted">Not scheduled</span>
              </p>
            </div>
          </CardContent>
          <div className="px-5 pb-4">
            <p className="text-xs text-text-muted">
              Automated backups are coming soon. See{" "}
              <a
                href="https://docs.euroscale.io/backups"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-text hover:underline underline-offset-4 transition-colors"
              >
                backup documentation
              </a>{" "}
              for manual backup procedures.
            </p>
          </div>
        </Card>

        {/* IP Whitelist */}
        <IPWhitelist databaseId={db.databaseId} />

        {/* Danger Zone */}
        <Card className="overflow-hidden border-destructive/30">
          <CardHeader className="border-b border-border-subtle px-5 py-3.5">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-destructive" />
              <CardTitle className="text-sm font-semibold text-destructive">
                Danger Zone
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-2.5 p-5">
            <Button
              variant="secondary"
              onClick={() => setShowRotateConfirm(true)}
              disabled={rotateMutation.isPending}
              className="flex-1 border-warning-subtle text-warning-text bg-warning-subtle/50 hover:bg-warning-subtle"
            >
              {rotateMutation.isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Rotating…
                </>
              ) : (
                <>
                  <RefreshCw size={14} /> Rotate Credentials
                </>
              )}
            </Button>

            <Button
              variant="destructive"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleteMutation.isPending}
              className="flex-1"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Deleting…
                </>
              ) : (
                <>
                  <Trash2 size={14} /> Delete Database
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Rotated Credentials Banner */}
        {rotatedCreds && (
          <Card className="overflow-hidden animate-slide-up border-success">
            <CardHeader className="border-b border-border-subtle px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-success" />
                <CardTitle className="text-sm font-semibold text-success">
                  New Credentials
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-5 space-y-2">
              <p className="text-xs text-text-muted">
                These credentials were just rotated. Save them now — they will
                not be shown again.
              </p>
              <div className="p-3 rounded-lg bg-surface-2 border border-border-subtle space-y-1">
                <FieldRow
                  label="Username"
                  value={db.username ?? "—"}
                  mono
                  copyLabel="Username"
                  copied={copied}
                  onCopy={copy}
                />
                <div className="flex items-center justify-between py-2 border-b border-border-subtle last:border-b-0">
                  <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider min-w-[80px]">
                    Password
                  </span>
                  <div className="flex items-center ml-2 overflow-hidden">
                    <span className="text-xs text-text-primary truncate max-w-[180px] sm:max-w-sm font-mono">
                      {showPassword
                        ? rotatedCreds.password
                        : "••••••••••••••••••••"}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                    </Button>
                    <CopyButton
                      value={rotatedCreds.password}
                      label="Password"
                      copied={copied}
                      onCopy={copy}
                    />
                  </div>
                </div>
                <FieldRow
                  label="SSL CA"
                  value={`${rotatedCreds.sslCaPem.slice(0, 40)}…`}
                  mono
                  copyLabel="SSL CA"
                  copied={copied}
                  onCopy={copy}
                />
              </div>
              <ConnectionStringRow
                host={db.host ?? "localhost"}
                port={db.port ?? 3306}
                username={db.username ?? "unknown"}
                copied={copied}
                onCopy={copy}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialogs */}
      <RotateConfirmDialog
        open={showRotateConfirm}
        onConfirm={handleRotate}
        onCancel={() => setShowRotateConfirm(false)}
      />

      <DeleteConfirmDialog
        open={showDeleteConfirm}
        databaseName={db.name}
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
        onCancel={() => {
          setShowDeleteConfirm(false);
        }}
      />
    </div>
  );
}

// ─── Dialogs ─────────────────────────────────────────────────────────────────

function RotateConfirmDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rotate Credentials</DialogTitle>
          <DialogDescription>
            This will generate new credentials and invalidate the current ones.
            Any application using the old credentials will lose access. Continue?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={onConfirm}>
            Rotate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteConfirmDialog({
  open,
  databaseName,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  databaseName: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (typed === databaseName) onConfirm();
  }

  const match = typed === databaseName;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <ShieldAlert
              size={22}
              className="text-destructive shrink-0 mt-0.5"
            />
            <div>
              <DialogTitle>Delete Database</DialogTitle>
              <DialogDescription className="mt-1">
                This action is{" "}
                <strong className="text-destructive">irreversible</strong>. All
                data and credentials will be permanently deleted.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="confirm-name"
              className="block text-[11px] font-medium text-text-muted mb-1.5 uppercase tracking-wider"
            >
              Type{" "}
              <code className="text-destructive bg-destructive/10 px-1.5 py-0.5 rounded text-[11px]">
                {databaseName}
              </code>{" "}
              to confirm
            </label>
            <Input
              id="confirm-name"
              type="text"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={loading}
              className={cn(
                match
                  ? "border-success focus:ring-success"
                  : "border-destructive focus:ring-destructive",
              )}
              placeholder={databaseName}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!match || loading}
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Deleting…
                </>
              ) : (
                "Delete Database"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
