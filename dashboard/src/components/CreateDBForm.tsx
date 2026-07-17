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

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

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
      <Card className="border-warning-subtle bg-warning-subtle">
        <CardContent className="p-3.5 space-y-1.5">
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
        </CardContent>
      </Card>

      {/* Connection string */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <Label className="text-xs font-medium text-text-secondary">
            Connection string
          </Label>
          <div className="relative">
            <Input
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
              className="font-mono text-xs pr-16 select-all"
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => setShowFullString((v) => !v)}
                title={showFullString ? "Hide credentials" : "Show credentials"}
                aria-label={showFullString ? "Hide credentials" : "Show credentials"}
              >
                {showFullString ? <EyeOff size={14} /> : <Eye size={14} />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => handleCopy(response.connectionString)}
                className={cn(
                  copied && "text-success bg-success-subtle",
                )}
                title="Copy connection string"
                aria-label="Copy connection string"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

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
      <Card>
        <CardContent className="p-3">
          <div className="flex items-start gap-2.5">
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
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-center pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onBack}
          className="min-h-[44px]"
        >
          <ChevronLeft size={14} />
          Create another
        </Button>
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
    <Card>
      <CardContent className="p-2.5 space-y-0.5">
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
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => setRevealed((v) => !v)}
                title={revealed ? "Hide" : "Show"}
                aria-label={revealed ? "Hide" : "Show"}
              >
                {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
              </Button>
            )}
            {copyable && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={handleCopy}
                className={cn(copied && "text-success")}
                title="Copy"
                aria-label="Copy"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
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
        <Card>
          <CardContent className="p-4 space-y-3">
            <Label htmlFor="db-name" className="text-sm font-medium">
              Database name
            </Label>
            <div className="relative">
              <Database
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-disabled pointer-events-none z-10"
              />
              <Input
                id="db-name"
                type="text"
                autoComplete="off"
                autoFocus
                placeholder="my_production_db"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSubmitting}
                className={cn(
                  "pl-9 pr-10 font-mono",
                  nameError
                    ? "border-error focus-visible:ring-error"
                    : "border-border-subtle focus-visible:border-accent focus-visible:ring-accent",
                )}
              />
              {name && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {nameError ? (
                    <AlertTriangle size={14} className="text-error" />
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
          </CardContent>
        </Card>

        {/* Engine selector */}
        <div className="space-y-2.5">
          <Label className="text-sm font-medium">Database engine</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ENGINES.map((e) => {
              const isSelected = engine === e.value;
              const isDisabled = e.value === "postgres";

              return (
                <Button
                  key={e.value}
                  type="button"
                  variant="outline"
                  disabled={isDisabled}
                  onClick={() => setEngine(e.value)}
                  className={cn(
                    "h-auto flex-col items-start gap-1 p-3.5",
                    isSelected
                      ? "border-accent bg-accent-subtle hover:bg-accent-subtle"
                      : "border-border-subtle bg-surface-1 hover:border-border-default",
                    isDisabled && "opacity-50 cursor-not-allowed",
                  )}
                >
                  <div className="flex items-center justify-between w-full mb-1.5">
                    <span className="text-sm font-semibold text-text-primary">
                      {e.label}
                    </span>
                    <Badge
                      variant={e.value === "mysql" ? "default" : "secondary"}
                      className="text-[10px] font-semibold uppercase tracking-wider"
                    >
                      {e.badge}
                    </Badge>
                  </div>
                  <p className="text-xs text-text-muted text-left">{e.description}</p>
                </Button>
              );
            })}
          </div>
        </div>

        {/* Region selector */}
        <div className="space-y-2.5">
          <Label className="text-sm font-medium">Region</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {REGIONS.map((r) => {
              const isSelected = region === r.value;

              return (
                <Button
                  key={r.value}
                  type="button"
                  variant="outline"
                  onClick={() => setRegion(r.value)}
                  className={cn(
                    "h-auto flex-col items-start gap-0 p-3.5",
                    isSelected
                      ? "border-accent bg-accent-subtle hover:bg-accent-subtle"
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
                  <p className="text-xs text-text-muted mt-1 text-left">{r.description}</p>
                </Button>
              );
            })}
          </div>
        </div>

        {/* Cost hint */}
        <Card>
          <CardContent className="p-3.5 space-y-1">
            <p className="text-xs font-medium text-accent-text uppercase tracking-wider">
              Estimated cost
            </p>
            <p className="text-sm text-text-secondary">
              Free for the first 100 MB of storage.{" "}
              <span className="text-text-primary">€0.10/GB/month</span> after
              that. No hidden fees.
            </p>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3">
          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}
            className="min-h-[44px]"
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
          </Button>
        </div>
      </form>
    </div>
  );
}
