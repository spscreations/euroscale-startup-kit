"use client";

import { useState, type FormEvent, useRef, useEffect } from "react";
import {
  Database,
  Loader2,
  Check,
  Copy,
  Eye,
  EyeOff,
  Shield,
  AlertTriangle,
  ChevronLeft,
} from "lucide-react";
import { cn, copyToClipboard } from "@/lib/utils";
import { useCreateDatabase } from "@/hooks/useCreateDatabase";
import { useAuth } from "@/lib/auth";
import type { CreateDatabaseResponse } from "@/lib/proto/euroscale/v1/database_pb";

// ── Types ───────────────────────────────────────────────────────────────────

type Engine = "mysql" | "postgres";
type Region = "nuremberg" | "helsinki";

interface EngineOption {
  value: Engine;
  label: string;
  description: string;
  badge: string;
}

interface RegionOption {
  value: Region;
  label: string;
  flag: string;
  provider: string;
  description: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const ENGINES: EngineOption[] = [
  {
    value: "mysql",
    label: "MySQL 8.0",
    description: "Vitess-compatible, auto-scaling",
    badge: "Recommended",
  },
  {
    value: "postgres",
    label: "PostgreSQL 16",
    description: "Coming soon — enter early access list",
    badge: "Preview",
  },
];

const REGIONS: RegionOption[] = [
  {
    value: "nuremberg",
    label: "Nuremberg, Germany",
    flag: "🇩🇪",
    provider: "Hetzner",
    description: "Central Europe — lowest latency for EU users",
  },
  {
    value: "helsinki",
    label: "Helsinki, Finland",
    flag: "🇫🇮",
    provider: "Hetzner",
    description: "Nordics — data residency in Finland",
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function isValidDBName(name: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_]{1,62}$/.test(name);
}

function formatNameError(name: string): string | null {
  if (name.length === 0) return null;
  if (name.length < 2) return "Name must be at least 2 characters";
  if (!/^[a-zA-Z]/.test(name)) return "Must start with a letter";
  if (!/^[a-zA-Z0-9_]+$/.test(name))
    return "Only letters, numbers, and underscores";
  if (name.length > 63) return "Name must be 63 characters or fewer";
  return null;
}

// ── Sub-components ──────────────────────────────────────────────────────────

function CredentialCard({
  response,
  onBack,
}: {
  response: CreateDatabaseResponse;
  onBack: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showFullString, setShowFullString] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  async function handleCopy(text: string) {
    await copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="animate-slide-up space-y-5">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="mx-auto w-12 h-12 rounded-full bg-success-subtle flex items-center justify-center">
          <Check size={24} className="text-success-text" />
        </div>
        <h2 className="text-lg font-semibold text-text-primary">
          Database created
        </h2>
        <p className="text-sm text-text-muted">
          Your database is provisioning in{" "}
          <strong className="text-text-secondary">
            {REGIONS.find((r) => r.value === response.region)?.label ??
              response.region}
          </strong>
          .
        </p>
      </div>

      {/* ⚠️ ONCE-ONLY WARNING */}
      <div className="rounded-lg border border-warning-subtle bg-warning-subtle p-3.5 space-y-1.5">
        <div className="flex items-start gap-2.5">
          <AlertTriangle
            size={18}
            className="text-warning-text shrink-0 mt-0.5"
          />
          <div>
            <p className="text-xs font-semibold text-warning-text">
              Save these credentials — shown once only
            </p>
            <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
              This is the only time you will see the password. Store them
              securely. You can rotate credentials from the database detail page
              if needed.
            </p>
          </div>
        </div>
      </div>

      {/* Connection string */}
      <div className="rounded-lg border border-border-subtle bg-surface-2 p-4 space-y-2">
        <label className="block text-xs font-medium text-text-secondary">
          Connection string
        </label>
        <div className="relative">
          <input
            ref={inputRef}
            readOnly
            value={
              showFullString
                ? response.connectionString
                : response.connectionString.replace(
                    /\/\/[^@]+@/,
                    "//••••••••:••••••••@",
                  )
            }
            className="w-full rounded-md bg-bg-primary border border-border-subtle px-3 py-2 text-xs font-mono text-text-primary pr-16 focus:outline-none focus:border-accent select-all"
          />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5">
            <button
              type="button"
              onClick={() => setShowFullString((v) => !v)}
              className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
              title={showFullString ? "Hide credentials" : "Show credentials"}
            >
              {showFullString ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button
              type="button"
              onClick={() => handleCopy(response.connectionString)}
              className={cn(
                "p-1.5 rounded transition-colors",
                copied
                  ? "text-success bg-success-subtle"
                  : "text-text-muted hover:text-text-primary hover:bg-surface-3",
              )}
              title="Copy connection string"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      </div>

      {/* Credentials detail grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <CredField label="Host" value={response.host} />
        <CredField label="Port" value={String(response.port)} />
        <CredField label="Username" value={response.username} mono copyable />
        <CredField
          label="Password"
          value={response.password}
          mono
          secret
          copyable
        />
        <CredField
          label="SSL CA (PEM)"
          value={
            response.sslCaPem
              ? `${response.sslCaPem.slice(0, 48)}…`
              : "Not required"
          }
          mono
          copyable
        />
        <CredField label="Engine" value={response.engine} />
        <CredField label="Region" value={response.region} />
        <CredField label="Status" value={response.status} />
      </div>

      {/* SSL info */}
      <div className="flex items-start gap-2.5 rounded-lg bg-surface-2 border border-border-subtle p-3">
        <Shield size={16} className="text-accent-text shrink-0 mt-0.5" />
        <p className="text-xs text-text-muted leading-relaxed">
          <span className="text-text-secondary font-medium">TLS required.</span>{" "}
          Connections are encrypted by default. Connect with:{" "}
          <code className="text-accent-text bg-surface-3 px-1 py-0.5 rounded text-[11px]">
            mysql --ssl-ca=ca.pem -u {response.username} -p -h {response.host}{" "}
            -P {response.port}
          </code>
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-center pt-1">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-md px-4 py-2.5 text-xs font-medium text-text-secondary hover:text-text-primary border border-border-subtle hover:border-border-default bg-surface-2 hover:bg-surface-3 transition-colors min-h-[44px]"
        >
          <ChevronLeft size={14} />
          Create another
        </button>
      </div>
    </div>
  );
}

function CredField({
  label,
  value,
  mono,
  secret,
  copyable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  secret?: boolean;
  copyable?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const displayValue = secret && !revealed ? "••••••••••••••••" : value;

  async function handleCopy() {
    try {
      await copyToClipboard(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-2 p-2.5 space-y-0.5">
      <p className="text-xs text-text-muted font-medium uppercase tracking-wider">
        {label}
      </p>
      <div className="flex items-center justify-between gap-2">
        <p
          className={cn(
            "text-xs truncate",
            mono ? "font-mono text-text-primary" : "text-text-secondary",
          )}
        >
          {displayValue}
        </p>
        <div className="flex gap-0.5 shrink-0">
          {secret && (
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              className="p-1.5 rounded text-text-muted hover:text-text-primary transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              title={revealed ? "Hide" : "Show"}
            >
              {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}
          {copyable && (
            <button
              type="button"
              onClick={handleCopy}
              className={cn(
                "p-1.5 rounded transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center",
                copied
                  ? "text-success"
                  : "text-text-muted hover:text-text-primary",
              )}
              title="Copy"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function CreateDBForm({
  onCreated,
}: {
  onCreated?: (response: CreateDatabaseResponse) => void;
}) {
  const { session } = useAuth();
  const createDb = useCreateDatabase();

  const [name, setName] = useState("");
  const [engine, setEngine] = useState<Engine>("mysql");
  const [region, setRegion] = useState<Region>("nuremberg");
  const [error, setError] = useState("");
  const [result, setResult] = useState<CreateDatabaseResponse | null>(null);

  const nameError = formatNameError(name);
  const isSubmitting = createDb.isPending;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Please enter a database name.");
      return;
    }
    if (!isValidDBName(name.trim())) {
      setError(
        "Name must start with a letter, contain only letters, numbers, and underscores, and be 2–63 characters.",
      );
      return;
    }
    if (!session?.id) {
      setError("You must be logged in to create a database.");
      return;
    }
    if (engine === "postgres") {
      setError(
        "PostgreSQL is in preview and not yet available for provisioning. Please select MySQL.",
      );
      return;
    }

    try {
      const res = await createDb.mutateAsync({
        name: name.trim().toLowerCase(),
        engine,
        region,
        userId: session.id,
      });
      setResult(res);
      onCreated?.(res);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to create database.";
      setError(message);
    }
  }

  // ── Success state ───────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="max-w-xl mx-auto py-8 px-6">
        <CredentialCard response={result} onBack={() => setResult(null)} />
      </div>
    );
  }

  // ── Form state ──────────────────────────────────────────────────────────
  return (
    <div className="max-w-xl mx-auto py-8 px-6 animate-slide-up">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-text-primary">
          Create database
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Provision a new Vitess-managed database in your chosen region
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* Error */}
        {error && (
          <div
            className="rounded-lg border border-error-subtle bg-error-subtle px-4 py-3 text-sm text-error-text animate-fade-in"
            role="alert"
          >
            {error}
          </div>
        )}

        {/* Database name */}
        <div className="rounded-lg border border-border-subtle bg-surface-1 p-4 space-y-3">
          <label
            htmlFor="db-name"
            className="block text-sm font-medium text-text-primary"
          >
            Database name
          </label>
          <div className="relative">
            <Database
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-disabled pointer-events-none"
            />
            <input
              id="db-name"
              type="text"
              autoComplete="off"
              autoFocus
              placeholder="my_production_db"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              className={cn(
                "w-full rounded-lg bg-surface-2 border pl-9 pr-10 py-2.5",
                "text-sm text-text-primary placeholder:text-text-disabled font-mono",
                "focus:outline-none focus:ring-1 transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                nameError
                  ? "border-error focus:ring-error"
                  : "border-border-subtle focus:border-accent focus:ring-accent",
              )}
            />
            {name && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {nameError ? (
                  <Check size={14} className="text-error" />
                ) : (
                  <Check size={14} className="text-success" />
                )}
              </div>
            )}
          </div>
          {nameError && (
            <p className="text-xs text-error-text">{nameError}</p>
          )}
          <p className="text-xs text-text-muted">
            2–63 characters: letters, numbers, and underscores. Must start with a
            letter.
          </p>
        </div>

        {/* Engine selector */}
        <div className="space-y-2.5">
          <p className="text-sm font-medium text-text-primary">
            Database engine
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ENGINES.map((e) => (
              <button
                key={e.value}
                type="button"
                disabled={e.value === "postgres"}
                onClick={() => setEngine(e.value)}
                className={cn(
                  "rounded-lg border p-3.5 text-left transition-colors cursor-pointer",
                  engine === e.value
                    ? "border-accent bg-accent-subtle"
                    : "border-border-subtle bg-surface-1 hover:border-border-default",
                  e.value === "postgres" && "opacity-50 cursor-not-allowed",
                )}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold text-text-primary">
                    {e.label}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full",
                      e.value === "mysql"
                        ? "bg-success-subtle text-success-text border border-success-subtle"
                        : "bg-warning-subtle text-warning-text border border-warning-subtle",
                    )}
                  >
                    {e.badge}
                  </span>
                </div>
                <p className="text-xs text-text-muted">{e.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Region selector */}
        <div className="space-y-2.5">
          <p className="text-sm font-medium text-text-primary">Region</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {REGIONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRegion(r.value)}
                className={cn(
                  "rounded-lg border p-3.5 text-left transition-colors cursor-pointer",
                  region === r.value
                    ? "border-accent bg-accent-subtle"
                    : "border-border-subtle bg-surface-1 hover:border-border-default",
                )}
              >
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-lg">{r.flag}</span>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">
                      {r.label}
                    </p>
                    <p className="text-xs text-accent-text">{r.provider}</p>
                  </div>
                </div>
                <p className="text-xs text-text-muted mt-1">{r.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Cost hint */}
        <div className="rounded-lg bg-surface-1 border border-border-subtle p-3.5 space-y-1">
          <p className="text-xs font-medium text-accent-text uppercase tracking-wider">
            Estimated cost
          </p>
          <p className="text-sm text-text-secondary">
            Free for the first 100 MB of storage.{" "}
            <span className="text-text-primary">€0.10/GB/month</span> after
            that. No hidden fees.
          </p>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              "flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold text-white",
              "bg-accent hover:bg-accent-hover active:bg-accent-pressed",
              "focus:outline-none transition-colors min-h-[44px]",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Provisioning…
              </>
            ) : (
              <>
                <Database size={16} />
                Create database
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
