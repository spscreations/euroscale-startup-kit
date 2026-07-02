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
import { cn } from "@/lib/utils";
import { useCreateDatabase } from "@/hooks/useCreateDatabase";
import { useAuth } from "@/lib/auth";
import type { CreateDatabaseResponse } from "@/lib/proto/euroscale/v1/database_pb";

// ── Types ───────────────────────────────────────────────────────────────────

type Engine = "mysql" | "postgres";
type Region = "nuremberg" | "helsinki";

interface EngineOption {
  value: Engine;
  label: string;
  icon: string;
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
    icon: "🐬",
    description: "Vitess-compatible, auto-scaling",
    badge: "Recommended",
  },
  {
    value: "postgres",
    label: "PostgreSQL 16",
    icon: "🐘",
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
  return /^[a-z][a-z0-9_]{2,63}$/.test(name);
}

function formatNameError(name: string): string | null {
  if (name.length === 0) return null;
  if (name.length < 3) return "Name must be at least 3 characters";
  if (!/^[a-z]/.test(name)) return "Must start with a lowercase letter";
  if (!/^[a-z0-9_]+$/.test(name))
    return "Only lowercase letters, numbers, and underscores";
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

  // Auto-select connection string on mount
  useEffect(() => {
    inputRef.current?.select();
  }, []);

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  return (
    <div className="animate-slide-up space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="mx-auto w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center">
          <Check size={28} className="text-green-400" />
        </div>
        <h2 className="text-xl font-semibold text-slate-100">
          Database created successfully
        </h2>
        <p className="text-sm text-slate-400">
          Your database <span className="font-mono text-purple-300">{response.databaseId.slice(0, 8)}…</span>{" "}
          is provisioning in <strong>{REGIONS.find(r => r.value === response.region)?.label ?? response.region}</strong>.
        </p>
      </div>

      {/* ⚠️ ONCE-ONLY WARNING */}
      <div className="rounded-xl border border-gold-400/20 bg-gold-400/5 p-4 space-y-2">
        <div className="flex items-start gap-3">
          <AlertTriangle
            size={20}
            className="text-gold-400 shrink-0 mt-0.5"
          />
          <div>
            <p className="text-sm font-semibold text-gold-300">
              Save these credentials — shown once only
            </p>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              This is the only time you will see the password and full connection
              string. Store them securely in a password manager or environment
              variables. If you lose them, you can rotate credentials from the
              database detail page.
            </p>
          </div>
        </div>
      </div>

      {/* Connection string */}
      <div className="glass-card p-5 space-y-3">
        <label className="block text-sm font-medium text-slate-300">
          Connection string
        </label>
        <div className="relative">
          <input
            ref={inputRef}
            readOnly
            value={showFullString ? response.connectionString : response.connectionString.replace(/\/\/[^@]+@/, "//••••••••:••••••••@")}
            className="w-full rounded-lg bg-navy-900 border border-purple-500/20 px-4 py-3 text-xs font-mono text-slate-200 pr-20 focus:outline-none focus:ring-2 focus:ring-purple-500/50 select-all"
          />
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-1">
            <button
              type="button"
              onClick={() => setShowFullString((v) => !v)}
              className="p-2 rounded-md text-slate-500 hover:text-slate-200 hover:bg-navy-700 transition-colors"
              title={showFullString ? "Hide credentials" : "Show credentials"}
            >
              {showFullString ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button
              type="button"
              onClick={() => copyToClipboard(response.connectionString)}
              className={cn(
                "p-2 rounded-md transition-colors",
                copied
                  ? "text-green-400 bg-green-500/10"
                  : "text-slate-500 hover:text-slate-200 hover:bg-navy-700"
              )}
              title="Copy connection string"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        </div>
      </div>

      {/* Credentials detail grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CredField label="Host" value={response.host} />
        <CredField label="Port" value={String(response.port)} />
        <CredField
          label="Username"
          value={response.username}
          mono
          copyable
        />
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
      <div className="flex items-start gap-3 rounded-lg bg-navy-800/60 border border-purple-500/10 p-3">
        <Shield size={18} className="text-cyan-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-400 leading-relaxed">
          <span className="text-cyan-300 font-medium">TLS required.</span>{" "}
          Connections are encrypted by default. Use the SSL CA certificate above
          for certificate verification. Connect with:{" "}
          <code className="text-purple-300 bg-navy-900 px-1 py-0.5 rounded text-[10px]">
            mysql --ssl-ca=ca.pem -u {response.username} -p -h {response.host} -P {response.port}
          </code>
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-center gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-slate-300 hover:text-slate-100 border border-purple-500/20 hover:border-purple-500/40 bg-navy-800/50 hover:bg-navy-700/50 transition-all duration-200"
        >
          <ChevronLeft size={16} />
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
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div className="glass-card p-3 space-y-1">
      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
        {label}
      </p>
      <div className="flex items-center justify-between gap-2">
        <p
          className={cn(
            "text-sm truncate",
            mono ? "font-mono text-slate-200" : "text-slate-300"
          )}
        >
          {displayValue}
        </p>
        <div className="flex gap-0.5 shrink-0">
          {secret && (
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              className="p-1 rounded text-slate-500 hover:text-slate-200 transition-colors"
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
                "p-1 rounded transition-colors",
                copied
                  ? "text-green-400"
                  : "text-slate-500 hover:text-slate-200"
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

    // Validate name
    if (!name.trim()) {
      setError("Please enter a database name.");
      return;
    }
    if (!isValidDBName(name.trim())) {
      setError(
        "Name must start with a lowercase letter, contain only lowercase letters, numbers, and underscores, and be 3–63 characters."
      );
      return;
    }

    // Check auth
    if (!session?.id) {
      setError("You must be logged in to create a database.");
      return;
    }

    // Postgres is preview — show message but still allow
    if (engine === "postgres") {
      setError("PostgreSQL is in preview and not yet available for provisioning. Please select MySQL.");
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
      <div className="max-w-2xl mx-auto py-8 px-6">
        <CredentialCard response={result} onBack={() => setResult(null)} />
      </div>
    );
  }

  // ── Form state ──────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto py-8 px-6 animate-slide-up">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-100">Create database</h1>
        <p className="text-sm text-slate-400 mt-1">
          Provision a new Vitess-managed database in your chosen region
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8" noValidate>
        {/* Error */}
        {error && (
          <div
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 animate-fade"
            role="alert"
          >
            {error}
          </div>
        )}

        {/* Database name */}
        <div className="glass-card p-5 space-y-3">
          <label
            htmlFor="db-name"
            className="block text-sm font-medium text-slate-300"
          >
            Database name
          </label>
          <div className="relative">
            <Database
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
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
                "w-full rounded-lg bg-navy-800 border pl-10 pr-4 py-2.5",
                "text-sm text-slate-100 placeholder:text-slate-600 font-mono",
                "focus:outline-none focus:ring-2 transition-all duration-200",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                nameError
                  ? "border-red-500/50 focus:ring-red-500/50"
                  : "border-purple-500/20 focus:ring-purple-500/50 focus:border-purple-500/50"
              )}
            />
            {name && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {nameError ? (
                  <Check size={16} className="text-red-400" />
                ) : (
                  <Check size={16} className="text-green-400" />
                )}
              </div>
            )}
          </div>
          {nameError && (
            <p className="text-xs text-red-400">{nameError}</p>
          )}
          <p className="text-xs text-slate-500">
            3–63 lowercase letters, numbers, and underscores. Must start with a
            letter.
          </p>
        </div>

        {/* Engine selector */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-300">Database engine</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ENGINES.map((e) => (
              <button
                key={e.value}
                type="button"
                disabled={e.value === "postgres"}
                onClick={() => setEngine(e.value)}
                className={cn(
                  "glass-card p-4 text-left transition-all duration-200 cursor-pointer",
                  engine === e.value
                    ? "border-purple-500/50 bg-purple-500/10 ring-1 ring-purple-500/30"
                    : "hover:border-purple-500/20",
                  e.value === "postgres" && "opacity-60 cursor-not-allowed"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">{e.icon}</span>
                  <span
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full",
                      e.value === "mysql"
                        ? "bg-green-500/10 text-green-400 border border-green-500/20"
                        : "bg-gold-400/10 text-gold-400 border border-gold-400/20"
                    )}
                  >
                    {e.badge}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-100">
                  {e.label}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {e.description}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Region selector */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-300">Region</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {REGIONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRegion(r.value)}
                className={cn(
                  "glass-card p-4 text-left transition-all duration-200 cursor-pointer",
                  region === r.value
                    ? "border-purple-500/50 bg-purple-500/10 ring-1 ring-purple-500/30"
                    : "hover:border-purple-500/20"
                )}
              >
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-xl">{r.flag}</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-100">
                      {r.label}
                    </p>
                    <p className="text-xs text-purple-400">{r.provider}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  {r.description}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Cost hint */}
        <div className="rounded-lg bg-navy-800/60 border border-purple-500/10 p-4 space-y-1">
          <p className="text-xs font-medium text-cyan-400 uppercase tracking-wider">
            Estimated cost
          </p>
          <p className="text-sm text-slate-300">
            Free for the first 100 MB of storage.{" "}
            <span className="text-purple-300">€0.10/GB/month</span> after that.
            No hidden fees.
          </p>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              "flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold text-white",
              "bg-gradient-to-r from-purple-500 to-purple-400 hover:from-purple-400 hover:to-purple-300",
              "focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all duration-200",
              "shadow-lg shadow-purple-500/20",
              "disabled:opacity-60 disabled:cursor-not-allowed"
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Provisioning…
              </>
            ) : (
              <>
                <Database size={18} />
                Create database
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
