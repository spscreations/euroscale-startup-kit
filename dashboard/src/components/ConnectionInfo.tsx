"use client";

import { useState, useCallback, type FormEvent } from "react";
import { toast } from "sonner";
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
  CheckCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn, copyToClipboard } from "@/lib/utils";
import { useRotateCredentials } from "@/hooks/useRotateCredentials";
import type { Database, RotateCredentialsResponse } from "@/lib/proto/euroscale/v1/database_pb";
import type { LucideIcon } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

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
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={handleCopy}
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
    >
      {copied ? (
        <Check size={13} className="text-success" />
      ) : (
        <Copy size={13} />
      )}
    </Button>
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
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onToggle}
            aria-label={masked ? "Show" : "Hide"}
            title={masked ? "Show" : "Hide"}
          >
            {masked ? <EyeOff size={13} /> : <Eye size={13} />}
          </Button>
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

// ── Dialogs ────────────────────────────────────────────────────────────────

function ResetConfirmDialog({
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
            <AlertTriangle
              size={22}
              className="text-warning-text shrink-0 mt-0.5"
            />
            <div>
              <DialogTitle>Reset Database Password</DialogTitle>
              <DialogDescription className="mt-1">
                This will immediately invalidate the current password. All active
                connections using the old credentials will be{" "}
                <strong className="text-destructive">dropped</strong>. This
                action cannot be undone.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="confirm-reset-name"
              className="block text-[11px] font-medium text-text-muted mb-1.5 uppercase tracking-wider"
            >
              Type{" "}
              <code className="text-warning-text bg-warning-subtle px-1.5 py-0.5 rounded text-[11px]">
                {databaseName}
              </code>{" "}
              to confirm
            </label>
            <Input
              id="confirm-reset-name"
              type="text"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={loading}
              className={cn(
                match
                  ? "border-success focus:ring-success"
                  : "border-warning-text focus:ring-warning-text",
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
                  <Loader2 size={14} className="animate-spin" /> Resetting…
                </>
              ) : (
                "Reset Password"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetSuccessDialog({
  open,
  credentials,
  onDone,
}: {
  open: boolean;
  credentials: RotateCredentialsResponse | null;
  onDone: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);

  if (!credentials) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onDone()}>
      <DialogContent className="sm:max-w-md">
        {/* Success header */}
        <div className="flex flex-col items-center text-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
            <CheckCircle size={28} className="text-success" />
          </div>
          <DialogHeader>
            <DialogTitle className="text-center">
              Password Reset Successfully
            </DialogTitle>
          </DialogHeader>
        </div>

        {/* Warning */}
        <div className="flex items-start gap-2.5 rounded-lg bg-warning-subtle border border-warning-subtle p-3">
          <AlertTriangle
            size={14}
            className="text-warning-text shrink-0 mt-0.5"
          />
          <p className="text-xs text-text-muted">
            This password is shown <strong>once</strong>. Copy it now — it will
            not be displayed again.
          </p>
        </div>

        {/* Credential fields */}
        <div className="space-y-2">
          {/* Password */}
          <div className="rounded-lg bg-surface-2 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
                  Password
                </p>
                <p className="mt-0.5 truncate font-mono text-sm text-text-primary">
                  {showPassword
                    ? credentials.password
                    : "•".repeat(Math.min(credentials.password.length, 24))}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <CopyButton value={credentials.password} label="Password" />
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide" : "Show"}
                >
                  {showPassword ? (
                    <EyeOff size={13} />
                  ) : (
                    <Eye size={13} />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Username */}
          <div className="rounded-lg bg-surface-2 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
                  Username
                </p>
                <p className="mt-0.5 truncate font-mono text-sm text-text-primary">
                  {credentials.username}
                </p>
              </div>
              <CopyButton value={credentials.username} label="Username" />
            </div>
          </div>

          {/* Connection String */}
          <div className="rounded-lg bg-surface-2 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
                  Connection String
                </p>
                <p className="mt-0.5 truncate font-mono text-xs text-text-primary">
                  {credentials.connectionString}
                </p>
              </div>
              <CopyButton
                value={credentials.connectionString}
                label="Connection string"
              />
            </div>
          </div>

          {/* Host & Port */}
          {credentials.host && (
            <div className="rounded-lg bg-surface-2 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
                    Host
                  </p>
                  <p className="mt-0.5 font-mono text-sm text-text-primary">
                    {credentials.host}:{credentials.port}
                  </p>
                </div>
                <CopyButton
                  value={`${credentials.host}:${credentials.port}`}
                  label="Host:Port"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onDone} className="w-full sm:w-auto">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function ConnectionInfo({
  database,
  credentials,
}: ConnectionInfoProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [rotatedCredentials, setRotatedCredentials] =
    useState<RotateCredentialsResponse | null>(null);
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
  const databaseName = database.name;

  const handleReset = useCallback(async () => {
    try {
      const result = await rotateMutation.mutateAsync({
        databaseId: database.databaseId,
      });
      setRotatedCredentials(result);
      setShowResetDialog(false);
      setShowSuccessDialog(true);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to reset password",
      );
    }
  }, [rotateMutation, database.databaseId]);

  const handleDone = useCallback(() => {
    setShowSuccessDialog(false);
    setRotatedCredentials(null);
  }, []);

  return (
    <>
      <Card className="animate-slide-up overflow-hidden">
        {/* Header */}
        <CardHeader className="flex-row items-center justify-between border-b border-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-subtle">
              <Server size={16} className="text-accent-text" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">
                Connection Details
              </CardTitle>
              <p className="text-xs text-text-muted">
                {hasCredentials
                  ? "Credentials are visible — copy them now"
                  : "Reset password to generate new credentials"}
              </p>
            </div>
          </div>

          <Button
            onClick={() => setShowResetDialog(true)}
            disabled={rotateMutation.isPending}
            size="sm"
            variant="destructive"
          >
            <RotateCcw
              size={13}
              className={cn(rotateMutation.isPending && "animate-spin")}
            />
            {rotateMutation.isPending ? "Resetting…" : "Reset Password"}
          </Button>
        </CardHeader>

        {/* Connection String */}
        <CardContent className="space-y-4 px-5 pt-4">
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
        </CardContent>

        {/* Fields */}
        <CardContent className="space-y-1.5 px-5 pt-0">
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
            value={hasCredentials ? displayPassword : "Reset to generate"}
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
        </CardContent>

        {/* Footer */}
        {!hasCredentials && (
          <div className="border-t border-border-subtle px-5 py-2.5">
            <p className="flex items-center gap-1.5 text-xs text-warning-text">
              <Lock size={11} />
              Credentials are only shown once after creation. Click{" "}
              <strong>&ldquo;Reset Password&rdquo;</strong> to generate new
              credentials.
            </p>
          </div>
        )}
      </Card>

      {/* Reset Confirmation Dialog */}
      <ResetConfirmDialog
        open={showResetDialog}
        databaseName={databaseName}
        loading={rotateMutation.isPending}
        onConfirm={handleReset}
        onCancel={() => setShowResetDialog(false)}
      />

      {/* Success Dialog */}
      <ResetSuccessDialog
        open={showSuccessDialog}
        credentials={rotatedCredentials}
        onDone={handleDone}
      />
    </>
  );
}
