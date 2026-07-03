"use client";

import { useState, useCallback } from "react";
import toast from "react-hot-toast";
import {
  Copy,
  Eye,
  EyeOff,
  RotateCcw,
  Check,
  Server,
  Key,
  Lock,
  Globe,
} from "lucide-react";
import { cn, copyToClipboard } from "@/lib/utils";
import { useRotateCredentials } from "@/hooks/useRotateCredentials";
import type { Database } from "@/lib/proto/euroscale/v1/database_pb";
import type { LucideIcon } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

interface ConnectionCredentials {
  connectionString: string;
  username: string;
  password: string;
  host: string;
  port: number;
  sslCaPem: string;
}

interface ConnectionInfoProps {
  database: Database;
  credentials?: ConnectionCredentials | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function maskValue(value: string): string {
  if (value.length <= 8) return "•".repeat(value.length);
  return (
    value.slice(0, 4) +
    "•".repeat(Math.min(value.length - 8, 16)) +
    value.slice(-4)
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await copyToClipboard(value);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  }, [value, label]);

  return (
    <button
      onClick={handleCopy}
      className="rounded p-1 text-text-muted transition-all hover:bg-surface-3 hover:text-accent-text"
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
    >
      {copied ? (
        <Check size={13} className="text-success" />
      ) : (
        <Copy size={13} />
      )}
    </button>
  );
}

function FieldRow({
  icon: Icon,
  label,
  value,
  masked,
  secret,
  onToggle,
  copyValue,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  masked?: boolean;
  secret?: boolean;
  onToggle?: () => void;
  copyValue?: string;
}) {
  const displayValue = masked ? maskValue(value) : value;

  return (
    <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Icon size={15} className="shrink-0 text-text-muted" />
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
            {label}
          </p>
          <p className="mt-0.5 truncate font-mono text-sm text-text-primary">
            {displayValue}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {copyValue && <CopyButton value={copyValue} label={label} />}
        {secret && onToggle && (
          <button
            onClick={onToggle}
            className="rounded p-1 text-text-muted transition-all hover:bg-surface-3 hover:text-accent-text"
            aria-label={masked ? "Show" : "Hide"}
            title={masked ? "Show" : "Hide"}
          >
            {masked ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        )}
      </div>
    </div>
  );
}

function SslCaSection({ pem }: { pem: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg bg-surface-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-surface-3"
      >
        <div className="flex items-center gap-2.5">
          <Lock size={15} className="text-text-muted" />
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
              SSL CA Certificate
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">
              {expanded ? "Click to hide" : "Click to view PEM"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <CopyButton value={pem} label="SSL CA Cert" />
          <span className="text-[11px] text-text-muted">
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </button>
      {expanded && (
        <pre className="max-h-40 overflow-auto border-t border-border-subtle px-3 py-2.5 font-mono text-[11px] text-text-secondary">
          {pem}
        </pre>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function ConnectionInfo({
  database,
  credentials,
}: ConnectionInfoProps) {
  const [showPassword, setShowPassword] = useState(false);
  const rotateMutation = useRotateCredentials();

  const connString =
    credentials?.connectionString ??
    `mysql://${database.username}@${database.host}:${database.port}/${database.name}?ssl-mode=VERIFY_IDENTITY`;

  const displayHost = credentials?.host ?? database.host;
  const displayPort = credentials?.port ?? database.port;
  const displayUsername = credentials?.username ?? database.username;
  const displayPassword = credentials?.password ?? null;
  const displaySslCaPem = credentials?.sslCaPem ?? null;

  const hasCredentials = displayPassword !== null;

  const handleRotate = useCallback(async () => {
    try {
      await rotateMutation.mutateAsync({ databaseId: database.databaseId });
      toast.success("Credentials rotated successfully");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to rotate credentials",
      );
    }
  }, [rotateMutation, database.databaseId]);

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1 animate-slide-up overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-subtle">
            <Server size={16} className="text-accent-text" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">
              Connection Details
            </h2>
            <p className="text-xs text-text-muted">
              {hasCredentials
                ? "Credentials are visible — copy them now"
                : "Rotate to generate new credentials"}
            </p>
          </div>
        </div>

        <button
          onClick={handleRotate}
          disabled={rotateMutation.isPending}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            "bg-accent-subtle text-accent-text hover:bg-accent/20",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <RotateCcw
            size={13}
            className={cn(rotateMutation.isPending && "animate-spin")}
          />
          {rotateMutation.isPending ? "Rotating…" : "Rotate Credentials"}
        </button>
      </div>

      {/* Connection String */}
      <div className="px-5 pt-4">
        <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-2 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
              Connection String
            </p>
            <p className="mt-0.5 truncate font-mono text-xs text-text-primary">
              {connString}
            </p>
          </div>
          <CopyButton value={connString} label="Connection string" />
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-1.5 p-5 pt-4">
        <FieldRow
          icon={Globe}
          label="Host"
          value={displayHost}
          copyValue={displayHost}
        />
        <FieldRow
          icon={Globe}
          label="Port"
          value={String(displayPort)}
          copyValue={String(displayPort)}
        />
        <FieldRow
          icon={Key}
          label="Username"
          value={displayUsername}
          copyValue={displayUsername}
        />
        <FieldRow
          icon={Key}
          label="Password"
          value={hasCredentials ? displayPassword : "Rotate to generate"}
          masked={showPassword ? false : hasCredentials}
          secret
          onToggle={() => setShowPassword(!showPassword)}
          copyValue={hasCredentials ? displayPassword : undefined}
        />
        <FieldRow
          icon={Globe}
          label="Region"
          value={
            database.region.charAt(0).toUpperCase() + database.region.slice(1)
          }
        />
        <FieldRow
          icon={Globe}
          label="Engine"
          value={database.engine.toUpperCase()}
        />

        {displaySslCaPem && <SslCaSection pem={displaySslCaPem} />}
      </div>

      {/* Footer */}
      {!hasCredentials && (
        <div className="border-t border-border-subtle px-5 py-2.5">
          <p className="flex items-center gap-1.5 text-xs text-warning-text">
            <Lock size={11} />
            Credentials are only shown once after creation. Click{" "}
            <strong>&ldquo;Rotate Credentials&rdquo;</strong> to generate new
            ones.
          </p>
        </div>
      )}
    </div>
  );
}
