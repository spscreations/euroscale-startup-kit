"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  Eye,
  EyeOff,
  X,
  Calendar,
  Clock,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
  status: "active" | "revoked";
  fullKey?: string;
}

// ── Mock data ───────────────────────────────────────────────────────────────

function mockApiKeys(): ApiKey[] {
  return [
    {
      id: "ak_001",
      name: "Production API",
      prefix: "esk_prod_",
      createdAt: "2026-06-18T12:00:00Z",
      lastUsedAt: "2026-07-02T08:30:00Z",
      status: "active",
    },
    {
      id: "ak_002",
      name: "Staging Integration",
      prefix: "esk_stag_",
      createdAt: "2026-06-25T09:00:00Z",
      lastUsedAt: "2026-07-01T14:15:00Z",
      status: "active",
    },
    {
      id: "ak_003",
      name: "CI/CD Pipeline",
      prefix: "esk_ci_",
      createdAt: "2026-06-20T10:00:00Z",
      lastUsedAt: "2026-06-28T16:45:00Z",
      status: "revoked",
    },
  ];
}

// ── Create Key Modal ───────────────────────────────────────────────────────

interface CreateKeyModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (key: ApiKey) => void;
}

function CreateKeyModal({ open, onClose, onCreated }: CreateKeyModalProps) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [createdKey, setCreatedKey] = useState<ApiKey | null>(null);

  const handleCreate = useCallback(async () => {
    if (!name.trim()) return;
    setCreating(true);

    await new Promise((r) => setTimeout(r, 800));

    const newKey: ApiKey = {
      id: `ak_${Date.now().toString(36)}`,
      name: name.trim(),
      prefix:
        "esk_" +
        name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "_")
          .slice(0, 4) +
        "_",
      createdAt: new Date().toISOString(),
      status: "active",
      fullKey: `esk_${crypto.randomUUID().replace(/-/g, "").slice(0, 40)}`,
    };

    setCreatedKey(newKey);
    setCreating(false);
    onCreated(newKey);
  }, [name, onCreated]);

  const handleCopy = useCallback(async () => {
    if (!createdKey?.fullKey) return;
    try {
      await navigator.clipboard.writeText(createdKey.fullKey);
      setCopied(true);
      toast.success("API key copied to clipboard");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }, [createdKey]);

  const handleClose = useCallback(() => {
    setName("");
    setCreating(false);
    setShowKey(false);
    setCopied(false);
    setCreatedKey(null);
    onClose();
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={handleClose}
      />
      <div className="relative w-full max-w-md animate-slide-up">
        <div className="rounded-xl border border-border-subtle bg-surface-1 p-5 shadow-2xl">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-subtle">
                <Key size={16} className="text-accent-text" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  {createdKey ? "API Key Created" : "Create API Key"}
                </h3>
                <p className="text-xs text-text-muted">
                  {createdKey
                    ? "Save this key — it won't be shown again"
                    : "Generate a new API key for programmatic access"}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
            >
              <X size={16} />
            </button>
          </div>

          {!createdKey ? (
            <>
              <div className="mb-4">
                <label
                  htmlFor="key-name"
                  className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted"
                >
                  Key Name
                </label>
                <input
                  id="key-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Production API, CI/CD Pipeline"
                  className="w-full rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
              </div>

              <div className="mb-5 space-y-2 rounded-lg bg-surface-2 border border-border-subtle p-3">
                <p className="text-xs font-medium text-text-muted">
                  Permissions
                </p>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    defaultChecked
                    disabled
                    className="rounded border-border-default bg-surface-2 accent-accent"
                  />
                  <span className="text-xs text-text-secondary">
                    Full access (read & write)
                  </span>
                </label>
              </div>

              <div className="flex justify-end gap-2.5">
                <button
                  onClick={handleClose}
                  className="rounded-lg border border-border-subtle px-3.5 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-border-default hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!name.trim() || creating}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-colors",
                    name.trim() && !creating
                      ? "bg-accent text-white hover:bg-accent-hover"
                      : "bg-surface-3 text-text-disabled cursor-not-allowed",
                  )}
                >
                  {creating ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus size={14} />
                      Create Key
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-4 rounded-lg border border-warning-subtle bg-warning-subtle p-3">
                <p className="mb-1 text-xs font-medium text-warning-text">
                  ⚠️ Save this key — shown once only
                </p>
                <p className="text-[11px] text-text-muted">
                  You won&apos;t be able to see the full key again. Store it
                  securely.
                </p>
              </div>

              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
                  API Key
                </label>
                <div className="relative">
                  <div className="flex">
                    <input
                      type={showKey ? "text" : "password"}
                      value={createdKey.fullKey}
                      readOnly
                      className="w-full rounded-l-lg border border-border-subtle bg-surface-2 px-3 py-2 font-mono text-xs text-accent-text outline-none"
                    />
                    <button
                      onClick={() => setShowKey(!showKey)}
                      className="border-y border-border-subtle bg-surface-2 px-2.5 py-2 text-text-muted transition-colors hover:text-text-primary"
                      title={showKey ? "Hide key" : "Show key"}
                    >
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                      onClick={handleCopy}
                      className="rounded-r-lg border border-border-subtle bg-surface-2 px-2.5 py-2 text-text-muted transition-colors hover:text-accent-text"
                      title="Copy to clipboard"
                    >
                      {copied ? (
                        <Check size={14} className="text-success" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleClose}
                  className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Revoke Confirm Dialog ──────────────────────────────────────────────────

function RevokeConfirm({
  open,
  keyName,
  onConfirm,
  onCancel,
  revoking,
}: {
  open: boolean;
  keyName: string;
  onConfirm: () => void;
  onCancel: () => void;
  revoking: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-sm animate-slide-up">
        <div className="rounded-xl border border-error-subtle bg-surface-1 p-5 shadow-2xl">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-error-subtle">
              <Trash2 size={16} className="text-error-text" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                Revoke API Key
              </h3>
              <p className="mt-1 text-xs text-text-muted">
                Are you sure you want to revoke{" "}
                <span className="font-medium text-text-secondary">
                  &ldquo;{keyName}&rdquo;
                </span>
                ? Any services using this key will immediately lose access.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2.5">
            <button
              onClick={onCancel}
              className="rounded-lg border border-border-subtle px-3.5 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-border-default hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={revoking}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium text-white transition-colors",
                revoking
                  ? "bg-surface-3 text-text-disabled cursor-not-allowed"
                  : "bg-error hover:bg-error/90",
              )}
            >
              {revoking ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Revoking...
                </>
              ) : (
                <>
                  <Trash2 size={14} />
                  Revoke Key
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main ApiKeys Component ─────────────────────────────────────────────────

interface ApiKeysProps {
  initialKeys?: ApiKey[];
}

export default function ApiKeys({ initialKeys }: ApiKeysProps) {
  const [keys, setKeys] = useState<ApiKey[]>(
    () => initialKeys ?? mockApiKeys(),
  );
  const [showCreate, setShowCreate] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [hidingRevoked, setHidingRevoked] = useState(true);

  const activeKeys = useMemo(
    () => keys.filter((k) => k.status === "active"),
    [keys],
  );
  const revokedKeys = useMemo(
    () => keys.filter((k) => k.status === "revoked"),
    [keys],
  );

  const handleCreated = useCallback((newKey: ApiKey) => {
    setKeys((prev) => [newKey, ...prev]);
  }, []);

  const handleRevoke = useCallback(async () => {
    if (!revokingId) return;
    await new Promise((r) => setTimeout(r, 600));
    setKeys((prev) =>
      prev.map((k) =>
        k.id === revokingId ? { ...k, status: "revoked" as const } : k,
      ),
    );
    setRevokingId(null);
    toast.success("API key revoked");
  }, [revokingId]);

  const revokingKey = revokingId ? keys.find((k) => k.id === revokingId) : null;

  return (
    <div>
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Active Keys
          </p>
          <p className="text-[11px] text-text-disabled">
            {activeKeys.length} key{activeKeys.length !== 1 ? "s" : ""} active
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Plus size={14} />
          Create Key
        </button>
      </div>

      {/* Empty state */}
      {keys.length === 0 && (
        <div className="rounded-lg border border-dashed border-border-subtle py-8 text-center">
          <Key size={28} className="mx-auto mb-2 text-text-disabled" />
          <p className="text-xs text-text-muted">No API keys yet</p>
          <p className="mt-1 text-[11px] text-text-disabled">
            Create a key to access the EuroScale API programmatically
          </p>
        </div>
      )}

      {/* Key List */}
      {keys.length > 0 && (
        <div className="space-y-1.5">
          {activeKeys.map((key) => (
            <ApiKeyRow
              key={key.id}
              apiKey={key}
              onRevoke={() => setRevokingId(key.id)}
            />
          ))}

          {/* Revoked keys toggle */}
          {revokedKeys.length > 0 && (
            <div className="pt-1.5">
              <button
                onClick={() => setHidingRevoked(!hidingRevoked)}
                className="flex items-center gap-1.5 text-[11px] font-medium text-text-muted transition-colors hover:text-text-secondary"
              >
                <Shield size={12} />
                {hidingRevoked
                  ? `Show ${revokedKeys.length} revoked key${revokedKeys.length !== 1 ? "s" : ""}`
                  : "Hide revoked keys"}
              </button>

              {!hidingRevoked && (
                <div className="mt-1.5 space-y-1.5">
                  {revokedKeys.map((key) => (
                    <ApiKeyRow
                      key={key.id}
                      apiKey={key}
                      onRevoke={undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <CreateKeyModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
      />
      <RevokeConfirm
        open={revokingId !== null}
        keyName={revokingKey?.name ?? ""}
        onConfirm={handleRevoke}
        onCancel={() => setRevokingId(null)}
        revoking={false}
      />
    </div>
  );
}

// ── Key Row ────────────────────────────────────────────────────────────────

function ApiKeyRow({
  apiKey,
  onRevoke,
}: {
  apiKey: ApiKey;
  onRevoke?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(apiKey.prefix + "*".repeat(32));
      setCopied(true);
      toast.success("Key prefix copied");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Failed to copy");
    }
  }, [apiKey.prefix]);

  const isRevoked = apiKey.status === "revoked";

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors",
        isRevoked
          ? "bg-surface-2/50 opacity-60"
          : "bg-surface-2 hover:bg-surface-3",
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            isRevoked
              ? "bg-surface-3 text-text-disabled"
              : "bg-accent-subtle text-accent-text",
          )}
        >
          <Key size={13} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-text-primary truncate">
              {apiKey.name}
            </p>
            {isRevoked && (
              <span className="rounded-full bg-error-subtle px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-error-text">
                Revoked
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-text-muted">
            <span className="font-mono text-text-disabled">
              {apiKey.prefix}
              {"*".repeat(32)}
            </span>
            <span className="flex items-center gap-1">
              <Calendar size={10} />
              {formatDate(apiKey.createdAt)}
            </span>
            {apiKey.lastUsedAt && (
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {formatDate(apiKey.lastUsedAt)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={handleCopy}
          className="rounded p-1.5 text-text-muted transition-colors hover:text-accent-text hover:bg-surface-3"
          title="Copy key prefix"
        >
          {copied ? (
            <Check size={13} className="text-success" />
          ) : (
            <Copy size={13} />
          )}
        </button>
        {!isRevoked && onRevoke && (
          <button
            onClick={onRevoke}
            className="rounded p-1.5 text-text-muted transition-colors hover:text-error-text hover:bg-error-subtle"
            title="Revoke key"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
