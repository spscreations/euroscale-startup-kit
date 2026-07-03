"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useCallback, type FormEvent } from "react";
import toast from "react-hot-toast";
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
import { cn, copyToClipboard, formatDate } from "@/lib/utils";
import { useDatabase } from "@/hooks/useDatabase";
import { useDeleteDatabase } from "@/hooks/useDeleteDatabase";
import { useRotateCredentials } from "@/hooks/useRotateCredentials";

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
      return {
        label: "Ready",
        className: "bg-success-subtle text-success-text",
      };
    case "creating":
      return {
        label: "Creating",
        className: "bg-warning-subtle text-warning-text",
      };
    case "deleting":
      return {
        label: "Deleting",
        className: "bg-error-subtle text-error-text",
      };
    case "deleted":
      return {
        label: "Deleted",
        className: "bg-surface-3 text-text-disabled",
      };
    case "error":
      return {
        label: "Error",
        className: "bg-error-subtle text-error-text",
      };
    default:
      return {
        label: status,
        className: "bg-surface-3 text-text-disabled",
      };
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
    <button
      type="button"
      onClick={() => onCopy(value, label)}
      className={cn(
        "ml-1.5 shrink-0 p-1 rounded transition-colors",
        "hover:bg-accent-subtle hover:text-accent-text",
        isActive && "text-success",
      )}
      aria-label={`Copy ${label}`}
    >
      {isActive ? <CopyCheck size={13} /> : <Copy size={13} />}
    </button>
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

function ProgressBar({
  value,
  max,
}: {
  value: number;
  max: number;
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="w-full h-1.5 rounded-full bg-surface-3 overflow-hidden">
      <div
        className="h-full rounded-full bg-accent transition-all duration-700 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  variant = "danger",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  variant?: "danger" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  const colors =
    variant === "danger"
      ? { btn: "bg-error hover:bg-error/90" }
      : { btn: "bg-warning hover:bg-warning/90 text-black" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-sm rounded-xl border border-border-subtle bg-surface-1 p-5 space-y-4 animate-slide-up shadow-2xl">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <p className="text-xs text-text-secondary">{message}</p>
        <div className="flex gap-2.5 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-border-subtle px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-2 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-colors",
              colors.btn,
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
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

  if (!open) return null;

  const match = typed === databaseName;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onCancel}
      />
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-md rounded-xl border border-error-subtle bg-surface-1 p-5 space-y-4 animate-slide-up shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <ShieldAlert
            size={22}
            className="text-error-text shrink-0 mt-0.5"
          />
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              Delete Database
            </h3>
            <p className="text-xs text-text-muted mt-1">
              This action is{" "}
              <strong className="text-error-text">irreversible</strong>. All
              data and credentials will be permanently deleted.
            </p>
          </div>
        </div>

        <div>
          <label
            htmlFor="confirm-name"
            className="block text-[11px] font-medium text-text-muted mb-1.5 uppercase tracking-wider"
          >
            Type{" "}
            <code className="text-error-text bg-error-subtle px-1.5 py-0.5 rounded text-[11px]">
              {databaseName}
            </code>{" "}
            to confirm
          </label>
          <input
            id="confirm-name"
            type="text"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={loading}
            className={cn(
              "w-full rounded-lg bg-surface-2 border px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled",
              "focus:outline-none focus:ring-1 transition-colors",
              match
                ? "border-success focus:ring-success"
                : "border-error-subtle focus:ring-error",
            )}
            placeholder={databaseName}
          />
        </div>

        <div className="flex gap-2.5 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-lg border border-border-subtle px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-2 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!match || loading}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-colors",
              match && !loading
                ? "bg-error hover:bg-error/90"
                : "bg-error/50 cursor-not-allowed",
              "disabled:opacity-50",
            )}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-1.5">
                <Loader2 size={14} className="animate-spin" /> Deleting…
              </span>
            ) : (
              "Delete Database"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="skeleton h-7 w-7 rounded-lg" />
          <div className="skeleton h-6 w-40 rounded" />
          <div className="skeleton h-5 w-16 rounded-full" />
        </div>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-border-subtle bg-surface-1 p-5 space-y-3"
          >
            <div className="skeleton h-4 w-28 rounded" />
            <div className="space-y-2">
              <div className="skeleton h-3 w-full rounded" />
              <div className="skeleton h-3 w-3/4 rounded" />
            </div>
          </div>
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
      <div className="flex-1 flex items-center justify-center p-4 bg-bg-primary">
        <div className="max-w-sm w-full rounded-xl border border-error-subtle bg-surface-1 p-6 text-center space-y-3 animate-fade-in">
          <WifiOff size={32} className="text-error-text mx-auto" />
          <div>
            <h2 className="text-sm font-semibold text-text-primary">
              Something went wrong
            </h2>
            <p className="text-xs text-text-muted mt-1">
              {error instanceof Error
                ? error.message
                : "An unexpected error occurred."}
            </p>
          </div>
          <div className="flex gap-2.5 justify-center pt-1">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-accent-subtle px-3.5 py-2 text-xs font-medium text-accent-text hover:bg-accent/20 transition-colors"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="rounded-lg border border-border-subtle px-3.5 py-2 text-xs font-medium text-text-secondary hover:bg-surface-2 transition-colors"
            >
              <ArrowLeft size={13} className="inline mr-1" /> Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────────
  if (!data?.database) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 bg-bg-primary">
        <div className="max-w-sm w-full rounded-xl border border-border-subtle bg-surface-1 p-6 text-center space-y-3 animate-fade-in">
          <Database size={36} className="text-text-disabled mx-auto" />
          <div>
            <h2 className="text-sm font-semibold text-text-primary">
              Database Not Found
            </h2>
            <p className="text-xs text-text-muted mt-1">
              The database you&apos;re looking for doesn&apos;t exist or you
              don&apos;t have access.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-subtle px-3.5 py-2 text-xs font-medium text-accent-text hover:bg-accent/20 transition-colors"
          >
            <ArrowLeft size={14} /> Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── Data ─────────────────────────────────────────────────────────────────────
  const db = data.database!;
  const badge = statusBadge(db.status);

  const stats = {
    storageUsedMB: 142,
    storageLimitMB: 500,
    activeConnections: 3,
    maxConnections: 25,
    queriesLastHour: 1240,
    queriesLimit: 5000,
  };

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
    <div className="flex-1 overflow-auto bg-bg-primary">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-4 animate-fade-in">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-xl font-bold text-text-primary truncate">
            {db.name}
          </h1>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              badge.className,
            )}
          >
            {badge.label === "Ready" && (
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
            )}
            {badge.label === "Creating" && (
              <Loader2 size={11} className="animate-spin" />
            )}
            {badge.label}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-subtle text-accent-text px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
            {db.engine}
          </span>
        </div>

        <p className="text-xs text-text-muted -mt-3">
          {db.region} · Created {formatDate(db.createdAt)}
        </p>

        {/* Connection Info */}
        <section className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden">
          <div className="border-b border-border-subtle px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Database size={16} className="text-accent-text" />
              <h2 className="text-sm font-semibold text-text-primary">
                Connection Info
              </h2>
            </div>
          </div>

          <div className="p-5 space-y-1">
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
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="ml-1.5 shrink-0 p-1 rounded hover:bg-accent-subtle transition-colors text-text-muted hover:text-text-primary"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
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
                {rotatedCreds?.sslCaPem ? (
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
                ) : db.status === "ready" ? (
                  <span className="text-xs text-text-disabled italic">
                    Not available — shown only once
                  </span>
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
          </div>
        </section>

        {/* Usage Stats */}
        <section className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden">
          <div className="border-b border-border-subtle px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-text-muted" />
              <h2 className="text-sm font-semibold text-text-primary">
                Usage Stats
              </h2>
            </div>
          </div>

          <div className="grid gap-3 p-5 sm:grid-cols-3">
            <div className="p-3.5 rounded-lg bg-surface-2 border border-border-subtle space-y-1.5">
              <div className="flex items-center gap-1.5">
                <HardDrive size={13} className="text-accent-text" />
                <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
                  Storage
                </span>
              </div>
              <p className="text-base font-semibold text-text-primary">
                {stats.storageUsedMB}{" "}
                <span className="text-xs text-text-muted font-normal">
                  / {stats.storageLimitMB} MB
                </span>
              </p>
              <ProgressBar value={stats.storageUsedMB} max={stats.storageLimitMB} />
            </div>

            <div className="p-3.5 rounded-lg bg-surface-2 border border-border-subtle space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Zap size={13} className="text-accent-text" />
                <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
                  Connections
                </span>
              </div>
              <p className="text-base font-semibold text-text-primary">
                {stats.activeConnections}{" "}
                <span className="text-xs text-text-muted font-normal">
                  / {stats.maxConnections} active
                </span>
              </p>
              <ProgressBar
                value={stats.activeConnections}
                max={stats.maxConnections}
              />
            </div>

            <div className="p-3.5 rounded-lg bg-surface-2 border border-border-subtle space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Activity size={13} className="text-accent-text" />
                <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
                  Queries
                </span>
              </div>
              <p className="text-base font-semibold text-text-primary">
                {stats.queriesLastHour.toLocaleString()}{" "}
                <span className="text-xs text-text-muted font-normal">
                  / hour
                </span>
              </p>
              <ProgressBar
                value={stats.queriesLastHour}
                max={stats.queriesLimit}
              />
            </div>
          </div>
        </section>

        {/* Backups */}
        <section className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden">
          <div className="border-b border-border-subtle px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-success" />
              <h2 className="text-sm font-semibold text-text-primary">
                Backups
              </h2>
            </div>
          </div>

          <div className="grid gap-3 p-5 sm:grid-cols-2">
            <div className="p-3.5 rounded-lg bg-surface-2 border border-border-subtle space-y-1">
              <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
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
              <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
                Next Scheduled
              </span>
              <p className="text-xs text-text-primary flex items-center gap-1.5">
                <Clock size={12} className="text-text-muted" />
                <span className="text-text-muted">Not scheduled</span>
              </p>
            </div>
          </div>

          <div className="px-5 pb-4">
            <p className="text-[11px] text-text-muted">
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
        </section>

        {/* Danger Zone */}
        <section className="rounded-xl border border-error-subtle bg-surface-1 overflow-hidden">
          <div className="border-b border-border-subtle px-5 py-3.5">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-error-text" />
              <h2 className="text-sm font-semibold text-error-text">
                Danger Zone
              </h2>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 p-5">
            <button
              type="button"
              onClick={() => setShowRotateConfirm(true)}
              disabled={rotateMutation.isPending}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors",
                "border-warning-subtle text-warning-text bg-warning-subtle/50 hover:bg-warning-subtle",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
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
            </button>

            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleteMutation.isPending}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors",
                "border-error-subtle text-error-text bg-error-subtle/50 hover:bg-error-subtle",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
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
            </button>
          </div>
        </section>

        {/* Rotated Credentials Banner */}
        {rotatedCreds && (
          <section className="rounded-xl border border-success-subtle bg-surface-1 animate-slide-up overflow-hidden">
            <div className="border-b border-border-subtle px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-success" />
                <h2 className="text-sm font-semibold text-success-text">
                  New Credentials
                </h2>
              </div>
            </div>
            <div className="p-5 space-y-2">
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
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="ml-1.5 shrink-0 p-1 rounded hover:bg-accent-subtle transition-colors text-text-muted hover:text-text-primary"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
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
            </div>
          </section>
        )}
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        open={showRotateConfirm}
        title="Rotate Credentials"
        message="This will generate new credentials and invalidate the current ones. Any application using the old credentials will lose access. Continue?"
        confirmLabel="Rotate"
        variant="warning"
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
