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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import { useDatabase } from "@/hooks/useDatabase";
import { useDeleteDatabase } from "@/hooks/useDeleteDatabase";
import { useRotateCredentials } from "@/hooks/useRotateCredentials";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function useCopyToClipboard() {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      toast.success(`Copied ${label}`);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  }, []);

  return { copied, copy };
}

/** Derive a display-usable status from the raw status string. */
function statusBadge(status: string) {
  const normalized = status.toLowerCase();
  switch (normalized) {
    case "ready":
      return { label: "Ready", className: "bg-green-400/10 text-green-400 border-green-400/30" };
    case "creating":
      return { label: "Creating", className: "bg-gold-400/10 text-gold-400 border-gold-400/30" };
    case "deleting":
      return { label: "Deleting", className: "bg-red-400/10 text-red-400 border-red-400/30" };
    case "deleted":
      return { label: "Deleted", className: "bg-slate-500/10 text-slate-500 border-slate-500/30" };
    case "error":
      return { label: "Error", className: "bg-red-400/10 text-red-400 border-red-400/30" };
    default:
      return { label: status, className: "bg-slate-500/10 text-slate-400 border-slate-500/30" };
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CopyButton({ value, label, copied, onCopy }: {
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
        "ml-2 shrink-0 p-1 rounded-md transition-all duration-200",
        "hover:bg-purple-500/10",
        isActive && "text-green-400"
      )}
      aria-label={`Copy ${label}`}
    >
      {isActive ? <CopyCheck size={14} /> : <Copy size={14} />}
    </button>
  );
}

function FieldRow({ label, value, mono = false, copyLabel, copied, onCopy, children }: {
  label: string;
  value: string;
  mono?: boolean;
  copyLabel: string;
  copied: string | null;
  onCopy: (text: string, label: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-navy-600/50 last:border-b-0">
      <span className="text-xs font-medium text-text-muted uppercase tracking-wider min-w-[90px]">
        {label}
      </span>
      <div className="flex items-center ml-2 overflow-hidden">
        <span className={cn(
          "text-sm text-text-primary truncate max-w-[240px] sm:max-w-md",
          mono && "font-mono text-xs"
        )}>
          {value}
        </span>
        <CopyButton value={value} label={copyLabel} copied={copied} onCopy={onCopy} />
        {children}
      </div>
    </div>
  );
}

function ConnectionStringRow({ host, port, username, copied, onCopy }: {
  host: string;
  port: number;
  username: string;
  copied: string | null;
  onCopy: (text: string, label: string) => void;
}) {
  const connStr = `mysql://${username}:<password>@${host}:${port}`;
  return (
    <div className="mt-3 p-3 rounded-lg bg-navy-800 border border-navy-600/50">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
          Connection String
        </span>
        <CopyButton value={connStr} label="Connection String" copied={copied} onCopy={onCopy} />
      </div>
      <code className="text-[11px] sm:text-xs text-purple-300 break-all block font-mono">
        {connStr}
      </code>
    </div>
  );
}

function ProgressBar({ value, max, color = "bg-purple-500" }: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="w-full h-1.5 rounded-full bg-navy-700 overflow-hidden">
      <div
        className={cn("h-full rounded-full transition-all duration-700 ease-out", color)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ConfirmDialog({ open, title, message, confirmLabel, variant = "danger", onConfirm, onCancel }: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  variant?: "danger" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  const colors = variant === "danger"
    ? { btn: "bg-red-500 hover:bg-red-400", ring: "ring-red-500/50" }
    : { btn: "bg-gold-500 hover:bg-gold-400", ring: "ring-gold-500/50" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade">
      <div className="absolute inset-0 bg-navy-900/80 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative glass-card w-full max-w-sm p-6 space-y-4 animate-slide-up">
        <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
        <p className="text-sm text-text-secondary">{message}</p>
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-navy-600 px-4 py-2 text-sm font-medium text-text-secondary hover:bg-navy-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              "flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors focus:outline-none focus:ring-2",
              colors.btn, colors.ring
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmDialog({ open, databaseName, loading, onConfirm, onCancel }: {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade">
      <div className="absolute inset-0 bg-navy-900/80 backdrop-blur-sm" onClick={onCancel} />
      <form
        onSubmit={handleSubmit}
        className="relative glass-card w-full max-w-md p-6 space-y-4 animate-slide-up border-red-500/30"
      >
        <div className="flex items-start gap-3">
          <ShieldAlert size={24} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Delete Database</h3>
            <p className="text-sm text-text-secondary mt-1">
              This action is <strong className="text-red-400">irreversible</strong>. All data and
              credentials will be permanently deleted.
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="confirm-name" className="block text-xs font-medium text-text-muted mb-1.5 uppercase tracking-wider">
            Type <code className="text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">{databaseName}</code> to confirm
          </label>
          <input
            id="confirm-name"
            type="text"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={loading}
            className={cn(
              "w-full rounded-lg bg-navy-800 border px-3 py-2 text-sm text-text-primary placeholder:text-slate-600",
              "focus:outline-none focus:ring-2 transition-all duration-200",
              match ? "border-green-400/40 focus:ring-green-400/30" : "border-red-500/30 focus:ring-red-500/30"
            )}
            placeholder={databaseName}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-lg border border-navy-600 px-4 py-2 text-sm font-medium text-text-secondary hover:bg-navy-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!match || loading}
            className={cn(
              "flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-red-500/50",
              match && !loading ? "bg-red-500 hover:bg-red-400" : "bg-red-500/50 cursor-not-allowed",
              "disabled:opacity-50"
            )}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" /> Deleting…
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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6 animate-fade">
      {/* Header skeleton */}
      <div className="flex items-center gap-4">
        <div className="shimmer h-8 w-8 rounded-lg" />
        <div className="shimmer h-8 w-48 rounded-lg" />
        <div className="shimmer h-6 w-16 rounded-full" />
        <div className="shimmer h-6 w-20 rounded-full" />
      </div>

      {/* Cards skeleton */}
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="glass-card p-6 space-y-4">
          <div className="shimmer h-5 w-40 rounded" />
          <div className="space-y-3">
            <div className="shimmer h-4 w-full rounded" />
            <div className="shimmer h-4 w-3/4 rounded" />
            <div className="shimmer h-4 w-1/2 rounded" />
          </div>
        </div>
      ))}
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

  // Rotated credentials (returned ONCE after rotation)
  const [rotatedCreds, setRotatedCreds] = useState<{
    password: string;
    sslCaPem: string;
    connectionString: string;
  } | null>(null);

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (isLoading) return <DetailSkeleton />;

  // ── Not found ────────────────────────────────────────────────────────────────

  if (!data?.database) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-navy-900">
        <div className="glass-card max-w-sm w-full p-8 text-center space-y-4 animate-slide-up">
          <Database size={48} className="text-slate-600 mx-auto" />
          <div>
            <h2 className="text-xl font-semibold text-text-primary">Database Not Found</h2>
            <p className="text-sm text-text-muted mt-1">
              The database you&apos;re looking for doesn&apos;t exist or you don&apos;t have access.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="inline-flex items-center gap-2 rounded-lg bg-purple-500/20 border border-purple-500/30 px-4 py-2 text-sm font-medium text-purple-300 hover:bg-purple-500/30 transition-colors"
          >
            <ArrowLeft size={16} /> Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-navy-900">
        <div className="glass-card max-w-sm w-full p-8 text-center space-y-4 animate-slide-up border-red-500/30">
          <AlertTriangle size={48} className="text-red-400 mx-auto" />
          <div>
            <h2 className="text-xl font-semibold text-text-primary">Something went wrong</h2>
            <p className="text-sm text-text-muted mt-1">
              {error instanceof Error ? error.message : "An unexpected error occurred."}
            </p>
          </div>
          <div className="flex gap-3 justify-center pt-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-purple-500/20 border border-purple-500/30 px-4 py-2 text-sm font-medium text-purple-300 hover:bg-purple-500/30 transition-colors"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="rounded-lg border border-navy-600 px-4 py-2 text-sm font-medium text-text-secondary hover:bg-navy-700 transition-colors"
            >
              <ArrowLeft size={16} className="inline mr-1" /> Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Data ─────────────────────────────────────────────────────────────────────

  const db = data.database!;
  const badge = statusBadge(db.status);

  // Placeholder stats (API doesn't expose usage stats yet)
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
      toast.error(e instanceof Error ? e.message : "Failed to delete database");
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
      toast.error(e instanceof Error ? e.message : "Failed to rotate credentials");
    }
    setShowRotateConfirm(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-navy-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6 animate-slide-up">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="p-2 rounded-lg border border-navy-600 text-text-secondary hover:text-text-primary hover:border-purple-500/30 hover:bg-navy-700 transition-colors"
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary truncate">
            {db.name}
          </h1>
          <span className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider",
            badge.className
          )}>
            {badge.label === "Ready" && <span className="w-1.5 h-1.5 rounded-full bg-green-400" />}
            {badge.label === "Creating" && <Loader2 size={12} className="animate-spin" />}
            {badge.label}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-0.5 text-xs font-semibold text-cyan-400 uppercase tracking-wider">
            {db.engine}
          </span>
        </div>

        {/* Region & created info */}
        <p className="text-sm text-text-muted -mt-4">
          <span className="inline-flex items-center gap-1">
            {db.region} &bull; Created {formatDate(db.createdAt)}
          </span>
        </p>

        {/* ── Connection Info ──────────────────────────────────────────────── */}
        <section className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Database size={18} className="text-purple-400" />
            <h2 className="text-lg font-semibold text-text-primary">Connection Info</h2>
          </div>

          <div className="space-y-1">
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

            {/* Password */}
            <div className="flex items-center justify-between py-2 border-b border-navy-600/50 last:border-b-0">
              <span className="text-xs font-medium text-text-muted uppercase tracking-wider min-w-[90px]">
                Password
              </span>
              <div className="flex items-center ml-2 overflow-hidden">
                {(!rotatedCreds && db.status === "ready") ? (
                  <span className="text-sm text-text-muted italic">Not available — shown only once</span>
                ) : rotatedCreds ? (
                  <>
                    <span className="text-sm text-text-primary truncate max-w-[200px] sm:max-w-sm font-mono text-xs">
                      {showPassword ? rotatedCreds.password : "••••••••••••••••••••••••••••••••"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="ml-2 shrink-0 p-1 rounded-md hover:bg-purple-500/10 transition-colors text-text-muted hover:text-text-primary"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <CopyButton value={rotatedCreds.password} label="Password" copied={copied} onCopy={copy} />
                  </>
                ) : (
                  <span className="text-sm text-text-muted italic">—</span>
                )}
              </div>
            </div>

            {/* SSL CA */}
            <div className="flex items-center justify-between py-2 border-b border-navy-600/50 last:border-b-0">
              <span className="text-xs font-medium text-text-muted uppercase tracking-wider min-w-[90px]">
                SSL CA
              </span>
              <div className="flex items-center ml-2 overflow-hidden">
                {rotatedCreds?.sslCaPem ? (
                  <>
                    <span className="text-sm text-text-primary truncate max-w-[200px] sm:max-w-sm font-mono text-[10px]">
                      {rotatedCreds.sslCaPem.slice(0, 30)}…
                    </span>
                    <CopyButton value={rotatedCreds.sslCaPem} label="SSL CA" copied={copied} onCopy={copy} />
                  </>
                ) : db.status === "ready" ? (
                  <span className="text-sm text-text-muted italic">Not available — shown only once</span>
                ) : (
                  <span className="text-sm text-text-muted italic">—</span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between py-2 last:border-b-0">
              <span className="text-xs font-medium text-text-muted uppercase tracking-wider min-w-[90px]">
                Database ID
              </span>
              <div className="flex items-center ml-2 overflow-hidden">
                <span className="text-xs text-text-muted font-mono truncate max-w-[200px] sm:max-w-sm">
                  {db.databaseId}
                </span>
                <CopyButton value={db.databaseId} label="Database ID" copied={copied} onCopy={copy} />
              </div>
            </div>
          </div>

          <ConnectionStringRow
            host={db.host ?? "localhost"}
            port={db.port ?? 3306}
            username={db.username ?? "unknown"}
            copied={copied}
            onCopy={copy}
          />

          {/* Password warning */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-gold-400/5 border border-gold-400/15">
            <AlertTriangle size={14} className="text-gold-400 shrink-0 mt-0.5" />
            <p className="text-xs text-gold-300/80">
              Credentials are shown <strong>only once</strong> after creation or rotation.
              Store them securely — they cannot be retrieved later.
            </p>
          </div>
        </section>

        {/* ── Usage Stats ──────────────────────────────────────────────────── */}
        <section className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-cyan-400" />
            <h2 className="text-lg font-semibold text-text-primary">Usage Stats</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {/* Storage */}
            <div className="p-4 rounded-lg bg-navy-800/50 border border-navy-600/30 space-y-2">
              <div className="flex items-center gap-2">
                <HardDrive size={14} className="text-purple-400" />
                <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Storage</span>
              </div>
              <p className="text-lg font-semibold text-text-primary">
                {stats.storageUsedMB} <span className="text-sm text-text-muted font-normal">/ {stats.storageLimitMB} MB</span>
              </p>
              <ProgressBar value={stats.storageUsedMB} max={stats.storageLimitMB} color="bg-purple-500" />
            </div>

            {/* Connections */}
            <div className="p-4 rounded-lg bg-navy-800/50 border border-navy-600/30 space-y-2">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-cyan-400" />
                <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Connections</span>
              </div>
              <p className="text-lg font-semibold text-text-primary">
                {stats.activeConnections} <span className="text-sm text-text-muted font-normal">/ {stats.maxConnections} active</span>
              </p>
              <ProgressBar value={stats.activeConnections} max={stats.maxConnections} color="bg-cyan-400" />
            </div>

            {/* Queries */}
            <div className="p-4 rounded-lg bg-navy-800/50 border border-navy-600/30 space-y-2">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-green-400" />
                <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Queries</span>
              </div>
              <p className="text-lg font-semibold text-text-primary">
                {stats.queriesLastHour.toLocaleString()} <span className="text-sm text-text-muted font-normal">/ hour</span>
              </p>
              <ProgressBar value={stats.queriesLastHour} max={stats.queriesLimit} color="bg-green-400" />
            </div>
          </div>
        </section>

        {/* ── Backups ──────────────────────────────────────────────────────── */}
        <section className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-green-400" />
            <h2 className="text-lg font-semibold text-text-primary">Backups</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="p-4 rounded-lg bg-navy-800/50 border border-navy-600/30 space-y-1.5">
              <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Last Backup</span>
              <p className="text-sm text-text-primary flex items-center gap-2">
                <Clock size={14} className="text-text-muted" />
                <span className="text-text-secondary">Backups not yet configured</span>
              </p>
            </div>
            <div className="p-4 rounded-lg bg-navy-800/50 border border-navy-600/30 space-y-1.5">
              <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Next Scheduled</span>
              <p className="text-sm text-text-primary flex items-center gap-2">
                <Clock size={14} className="text-text-muted" />
                <span className="text-text-secondary">Not scheduled</span>
              </p>
            </div>
          </div>

          <p className="text-xs text-text-muted">
            Automated backups are coming soon. See{" "}
            <a
              href="https://docs.euroscale.io/backups"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300 underline underline-offset-4 transition-colors"
            >
              backup documentation
            </a>{" "}
            for manual backup procedures.
          </p>
        </section>

        {/* ── Danger Zone ──────────────────────────────────────────────────── */}
        <section className="glass-card p-6 space-y-4 border-red-500/20">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-400" />
            <h2 className="text-lg font-semibold text-red-300">Danger Zone</h2>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {/* Rotate Credentials */}
            <button
              type="button"
              onClick={() => setShowRotateConfirm(true)}
              disabled={rotateMutation.isPending}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                "border-gold-400/30 text-gold-400 bg-gold-400/5 hover:bg-gold-400/10",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {rotateMutation.isPending ? (
                <><Loader2 size={16} className="animate-spin" /> Rotating…</>
              ) : (
                <><RefreshCw size={16} /> Rotate Credentials</>
              )}
            </button>

            {/* Delete Database */}
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleteMutation.isPending}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                "border-red-500/30 text-red-400 bg-red-500/5 hover:bg-red-500/10",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {deleteMutation.isPending ? (
                <><Loader2 size={16} className="animate-spin" /> Deleting…</>
              ) : (
                <><Trash2 size={16} /> Delete Database</>
              )}
            </button>
          </div>
        </section>

        {/* ── Rotated Credentials Banner ──────────────────────────────────────── */}
        {rotatedCreds && (
          <div className="glass-card p-6 space-y-3 border-green-400/30 animate-slide-up">
            <div className="flex items-center gap-2">
              <Shield size={18} className="text-green-400" />
              <h2 className="text-lg font-semibold text-green-300">New Credentials</h2>
            </div>
            <p className="text-xs text-text-muted">
              These credentials were just rotated. Save them now — they will not be shown again.
            </p>
            <div className="p-3 rounded-lg bg-navy-800 border border-navy-600/50 space-y-1">
              <FieldRow label="Username" value={db.username ?? "—"} mono copyLabel="Username" copied={copied} onCopy={copy} />
              <div className="flex items-center justify-between py-2 border-b border-navy-600/50 last:border-b-0">
                <span className="text-xs font-medium text-text-muted uppercase tracking-wider min-w-[90px]">Password</span>
                <div className="flex items-center ml-2 overflow-hidden">
                  <span className="text-sm text-text-primary truncate max-w-[200px] sm:max-w-sm font-mono text-xs">
                    {showPassword ? rotatedCreds.password : "••••••••••••••••••••••••••••••••"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="ml-2 shrink-0 p-1 rounded-md hover:bg-purple-500/10 transition-colors text-text-muted hover:text-text-primary"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <CopyButton value={rotatedCreds.password} label="Password" copied={copied} onCopy={copy} />
                </div>
              </div>
              <FieldRow label="SSL CA" value={`${rotatedCreds.sslCaPem.slice(0, 40)}…`} mono copyLabel="SSL CA" copied={copied} onCopy={copy} />
            </div>
            <ConnectionStringRow
              host={db.host ?? "localhost"}
              port={db.port ?? 3306}
              username={db.username ?? "unknown"}
              copied={copied}
              onCopy={copy}
            />
          </div>
        )}
      </div>

      {/* ── Dialogs ────────────────────────────────────────────────────────── */}
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
