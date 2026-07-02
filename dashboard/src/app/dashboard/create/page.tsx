"use client";

import { useState, useMemo, type FormEvent } from "react";
import Link from "next/link";
import {
  Loader2,
  ArrowRight,
  ChevronRight,
  Database,
  MapPin,
  Copy,
  Check,
  AlertTriangle,
  Globe,
  Home,
  Shield,
} from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useCreateDatabase } from "@/hooks/useCreateDatabase";
import type { CreateDatabaseResponse } from "@/lib/proto/euroscale/v1/database_pb";

// ── Constants ───────────────────────────────────────────────────────────────

const ENGINES = [
  {
    value: "mysql",
    label: "MySQL 8.0",
    description: "Vitess-managed MySQL cluster with automatic sharding",
  },
] as const;

const REGIONS = [
  {
    value: "nuremberg",
    label: "Nuremberg",
    flag: "🇩🇪",
    description: "Germany, Hetzner FSN1-DC15",
  },
  {
    value: "helsinki",
    label: "Helsinki",
    flag: "🇫🇮",
    description: "Finland, Hetzner HEL1-DC2",
  },
] as const;

const DB_NAME_RE = /^[a-z][a-z0-9_]{2,29}$/;

// ── Helpers ────────────────────────────────────────────────────────────────

interface FormErrors {
  name?: string;
  engine?: string;
  region?: string;
}

function validate(form: { name: string; engine: string; region: string }): FormErrors {
  const errors: FormErrors = {};
  if (!DB_NAME_RE.test(form.name)) {
    errors.name = "Lowercase letters, numbers, and underscores only (3–30 characters, no spaces).";
  }
  if (!form.engine) {
    errors.engine = "Please select a database engine.";
  }
  if (!form.region) {
    errors.region = "Please select a deployment region.";
  }
  return errors;
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function CreateDatabasePage() {
  const { session } = useAuth();
  const { mutateAsync, isPending } = useCreateDatabase();

  const [name, setName] = useState("");
  const [engine, setEngine] = useState("mysql");
  const [region, setRegion] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [result, setResult] = useState<CreateDatabaseResponse | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const fieldErrors = useMemo(() => validate({ name, engine, region }), [name, engine, region]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});

    const v = validate({ name, engine, region });
    if (Object.keys(v).length > 0) {
      setErrors(v);
      return;
    }

    try {
      const res = await mutateAsync({
        name,
        engine,
        region,
        userId: session?.id ?? "",
      });
      setResult(res);
      toast.success("Database created successfully!");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to create database. Please try again.";
      toast.error(message);
    }
  }

  function handleCopy(text: string, field: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedField(field);
        toast.success("Copied!");
        setTimeout(() => setCopiedField(null), 2000);
      })
      .catch(() => {
        toast.error("Failed to copy.");
      });
  }

  // ── Success view ─────────────────────────────────────────────────────────

  if (result) {
    return (
      <main className="min-h-screen bg-navy-900">
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-6 animate-slide-up">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-slate-500" aria-label="Breadcrumb">
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 hover:text-slate-300 transition-colors"
            >
              <Home size={14} />
              Dashboard
            </Link>
            <ChevronRight size={14} />
            <span className="text-slate-300">New Database</span>
          </nav>

          {/* Success header */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-400/10 border border-green-400/20">
              <Check size={20} className="text-green-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-100">
                Database <span className="gradient-text">{name}</span> created
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Status: <span className="text-green-400 capitalize">{result.status}</span>
              </p>
            </div>
          </div>

          {/* Credentials card */}
          <div className="glass-card p-6 md:p-8 space-y-5">
            {/* Warning banner */}
            <div className="flex items-start gap-3 rounded-lg border border-gold-400/20 bg-gold-400/5 p-4">
              <AlertTriangle size={20} className="text-gold-400 shrink-0 mt-0.5" />
              <p className="text-sm text-gold-300 font-medium">
                Save these credentials — they won&apos;t be shown again.
              </p>
            </div>

            {/* Connection string */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Connection String
              </label>
              <div className="flex items-stretch rounded-lg overflow-hidden border border-purple-500/20 group">
                <code className="flex-1 block bg-navy-800 px-4 py-3 text-sm text-slate-200 font-mono break-all select-all">
                  {result.connectionString}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopy(result.connectionString, "connectionString")}
                  className="flex items-center gap-1.5 bg-navy-700 hover:bg-navy-600 px-3 py-2 text-xs font-medium text-slate-300 hover:text-slate-100 transition-colors border-l border-purple-500/20 shrink-0"
                  aria-label="Copy connection string"
                >
                  {copiedField === "connectionString" ? (
                    <Check size={14} className="text-green-400" />
                  ) : (
                    <Copy size={14} />
                  )}
                  {copiedField === "connectionString" ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            {/* Credential details grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CredentialRow
                label="Username"
                value={result.username}
                onCopy={() => handleCopy(result.username, "username")}
                copied={copiedField === "username"}
              />
              <CredentialRow
                label="Password"
                value={result.password}
                masked
                onCopy={() => handleCopy(result.password, "password")}
                copied={copiedField === "password"}
              />
              <CredentialRow
                label="Host"
                value={result.host}
                onCopy={() => handleCopy(result.host, "host")}
                copied={copiedField === "host"}
              />
              <CredentialRow
                label="Port"
                value={String(result.port)}
                onCopy={() => handleCopy(String(result.port), "port")}
                copied={copiedField === "port"}
              />
            </div>

            {/* SSL CA PEM */}
            {result.sslCaPem && (
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  SSL CA Certificate
                </label>
                <div className="relative">
                  <pre className="bg-navy-800 border border-purple-500/20 rounded-lg p-4 text-xs text-slate-400 font-mono max-h-32 overflow-y-auto">
                    {result.sslCaPem}
                  </pre>
                  <button
                    type="button"
                    onClick={() => handleCopy(result.sslCaPem, "sslCaPem")}
                    className="absolute top-2 right-2 p-1.5 rounded-md bg-navy-700 hover:bg-navy-600 text-slate-400 hover:text-slate-200 transition-colors border border-purple-500/10"
                    aria-label="Copy SSL CA certificate"
                  >
                    {copiedField === "sslCaPem" ? (
                      <Check size={14} className="text-green-400" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="flex flex-wrap gap-3 text-xs text-slate-500 pt-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-navy-800 border border-purple-500/10">
                <Database size={12} />
                {result.engine}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-navy-800 border border-purple-500/10">
                <MapPin size={12} />
                {result.region}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-navy-800 border border-purple-500/10">
                <Shield size={12} />
                SSL enforced
              </span>
            </div>
          </div>

          {/* Go to Dashboard */}
          <div className="flex justify-center">
            <Link
              href="/dashboard"
              className={cn(
                "inline-flex items-center gap-2 rounded-lg py-2.5 px-6 text-sm font-semibold text-white",
                "bg-gradient-to-r from-purple-500 to-purple-400 hover:from-purple-400 hover:to-purple-300",
                "focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all duration-200 shadow-lg shadow-purple-500/20"
              )}
            >
              <Home size={18} />
              Go to Dashboard
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // ── Form view ────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-navy-900">
      {/* Ambient background blobs */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-purple-500/5 blur-[100px]" />
        <div className="absolute bottom-1/4 left-1/3 w-[300px] h-[300px] rounded-full bg-cyan-400/5 blur-[80px]" />
      </div>

      <div className="relative max-w-2xl mx-auto px-4 py-8 space-y-6 animate-slide-up">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-500" aria-label="Breadcrumb">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 hover:text-slate-300 transition-colors"
          >
            <Home size={14} />
            Dashboard
          </Link>
          <ChevronRight size={14} />
          <span className="text-slate-300">New Database</span>
        </nav>

        {/* Heading */}
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            <span className="gradient-text">Create Database</span>
          </h1>
          <p className="text-sm text-slate-400 mt-2">
            Provision a new Vitess-managed MySQL database in your chosen region.
          </p>
        </div>

        {/* Form card */}
        <div
          className={cn(
            "glass-card p-6 md:p-8 animate-fade relative",
            isPending && "opacity-60 pointer-events-none"
          )}
        >
          {isPending && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-navy-900/40 rounded-xl">
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={32} className="animate-spin text-purple-400" />
                <p className="text-sm font-medium text-slate-300">Provisioning database…</p>
                <p className="text-xs text-slate-500">This may take a moment</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            {/* Database Name */}
            <div>
              <label htmlFor="dbName" className="block text-sm font-semibold text-slate-300 mb-1.5">
                Database Name
              </label>
              <div className="relative">
                <Database
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                />
                <input
                  id="dbName"
                  type="text"
                  autoComplete="off"
                  placeholder="my_app_db"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  className={cn(
                    "w-full rounded-lg bg-navy-800 border pl-10 pr-4 py-2.5",
                    "text-sm text-slate-100 placeholder:text-slate-600",
                    "focus:outline-none focus:ring-2 focus:ring-purple-500/50",
                    "transition-all duration-200",
                    errors.name
                      ? "border-red-500/40 focus:border-red-500/40 focus:ring-red-500/30"
                      : "border-purple-500/20 focus:border-purple-500/50"
                  )}
                />
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Lowercase letters, numbers, underscores — 3 to 30 characters. Must start with a
                letter.
              </p>
              {errors.name && (
                <p className="mt-1 text-xs text-red-400 animate-fade" role="alert">
                  {errors.name}
                </p>
              )}
            </div>

            {/* Engine selector */}
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Database Engine
              </label>
              <div className="space-y-2">
                {ENGINES.map((opt) => {
                  const selected = engine === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setEngine(opt.value);
                        if (errors.engine) setErrors((prev) => ({ ...prev, engine: undefined }));
                      }}
                      className={cn(
                        "w-full flex items-start gap-3 rounded-lg border p-4 text-left transition-all duration-200",
                        selected
                          ? "border-purple-400/40 bg-purple-500/10 shadow-sm shadow-purple-500/10"
                          : "border-purple-500/15 bg-navy-800/60 hover:border-purple-500/30 hover:bg-navy-800"
                      )}
                    >
                      <div
                        className={cn(
                          "flex items-center justify-center w-9 h-9 rounded-lg shrink-0 transition-colors",
                          selected
                            ? "bg-purple-500/20 text-purple-400"
                            : "bg-navy-700 text-slate-400"
                        )}
                      >
                        <Database size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span
                          className={cn(
                            "text-sm font-semibold",
                            selected ? "text-purple-300" : "text-slate-200"
                          )}
                        >
                          {opt.label}
                        </span>
                        <p className="text-xs text-slate-500 mt-0.5">{opt.description}</p>
                      </div>
                      {selected && (
                        <Check size={18} className="text-purple-400 shrink-0 mt-1.5" />
                      )}
                    </button>
                  );
                })}
              </div>
              {errors.engine && (
                <p className="mt-1 text-xs text-red-400 animate-fade" role="alert">
                  {errors.engine}
                </p>
              )}
            </div>

            {/* Region selector */}
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Deployment Region
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {REGIONS.map((opt) => {
                  const selected = region === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setRegion(opt.value);
                        if (errors.region) setErrors((prev) => ({ ...prev, region: undefined }));
                      }}
                      className={cn(
                        "flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all duration-200",
                        selected
                          ? "border-purple-400/40 bg-purple-500/10 shadow-sm shadow-purple-500/10"
                          : "border-purple-500/15 bg-navy-800/60 hover:border-purple-500/30 hover:bg-navy-800"
                      )}
                    >
                      <div className="flex items-center gap-2.5 w-full">
                        <span className="text-xl">{opt.flag}</span>
                        <span
                          className={cn(
                            "text-sm font-semibold",
                            selected ? "text-purple-300" : "text-slate-200"
                          )}
                        >
                          {opt.label}
                        </span>
                        {selected && (
                          <Check size={16} className="text-purple-400 ml-auto shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-slate-500">{opt.description}</p>
                    </button>
                  );
                })}
              </div>
              {errors.region && (
                <p className="mt-1 text-xs text-red-400 animate-fade" role="alert">
                  {errors.region}
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isPending || Object.keys(fieldErrors).length > 0}
              className={cn(
                "w-full flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold text-white",
                "bg-gradient-to-r from-purple-500 to-purple-400 hover:from-purple-400 hover:to-purple-300",
                "focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all duration-200 shadow-lg shadow-purple-500/20",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isPending ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Creating database…
                </>
              ) : (
                <>
                  Create Database
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-600">
          <Globe size={12} className="inline mr-1" />
          EU sovereign infrastructure &bull; GDPR by architecture
        </p>
      </div>
    </main>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function CredentialRow({
  label,
  value,
  masked = false,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  masked?: boolean;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
        {label}
      </label>
      <div className="flex items-stretch rounded-lg overflow-hidden border border-purple-500/15">
        <code className="flex-1 block bg-navy-800 px-4 py-2.5 text-sm text-slate-200 font-mono break-all">
          {masked ? "••••••••••••••••••••••••••••••••••••••••••••••••" : value}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="flex items-center gap-1.5 bg-navy-700 hover:bg-navy-600 px-3 py-2 text-xs font-medium text-slate-300 hover:text-slate-100 transition-colors border-l border-purple-500/15 shrink-0"
          aria-label={`Copy ${label.toLowerCase()}`}
        >
          {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
