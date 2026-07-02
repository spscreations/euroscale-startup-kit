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
  prefix: string; // First 8 chars of the key for identification
  createdAt: string; // ISO date string
  lastUsedAt?: string; // ISO date string
  status: "active" | "revoked";
  /** The full key — only shown once after creation */
  fullKey?: string;
}

// ── Mock data (will be replaced with real API data) ────────────────────────

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

    // Simulate API call
    await new Promise((r) => setTimeout(r, 800));

    const newKey: ApiKey = {
      id: `ak_${Date.now().toString(36)}`,
      name: name.trim(),
      prefix: "esk_" + name.trim().toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 4) + "_",
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
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-navy-900/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg animate-slide-up">
        <div className="glass-card border-purple-500/20 p-6">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/15">
                <Key size={18} className="text-purple-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-text-primary">
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
              className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-navy-700 hover:text-text-primary"
            >
              <X size={18} />
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
                  className="w-full rounded-lg border border-glass-border bg-navy-700/50 px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 outline-none transition-colors focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
              </div>

              <div className="mb-6 space-y-2 rounded-lg bg-navy-800/50 p-3">
                <p className="text-xs font-medium text-text-muted">Permissions</p>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    defaultChecked
                    disabled
                    className="rounded border-glass-border bg-navy-700 text-purple-500 outline-none focus:ring-purple-500/20"
                  />
                  <span className="text-sm text-text-secondary">Full access (read & write)</span>
                </label>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={handleClose}
                  className="rounded-lg border border-glass-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-purple-500/30 hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!name.trim() || creating}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
                    name.trim() && !creating
                      ? "bg-purple-500 text-white hover:bg-purple-400"
                      : "bg-navy-600 text-text-muted cursor-not-allowed"
                  )}
                >
                  {creating ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      Create Key
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Key revealed once */}
              <div className="mb-4 rounded-lg border border-gold-400/30 bg-gold-500/10 p-3">
                <p className="mb-1 text-xs font-medium text-gold-400">
                  ⚠️ Save this key — shown once only
                </p>
                <p className="text-xs text-text-muted">
                  You won't be able to see the full key again. Store it securely.
                </p>
              </div>

              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
                  API Key
                </label>
                <div className="relative">
                  <div className="flex items-center gap-0">
                    <input
                      type={showKey ? "text" : "password"}
                      value={createdKey.fullKey}
                      readOnly
                      className="w-full rounded-l-lg border border-glass-border bg-navy-700/50 px-3 py-2.5 font-mono text-sm text-cyan-300 outline-none"
                    />
                    <button
                      onClick={() => setShowKey(!showKey)}
                      className="border-b border-t border-glass-border bg-navy-700/50 px-2.5 py-2.5 text-text-muted transition-colors hover:text-text-primary"
                      title={showKey ? "Hide key" : "Show key"}
                    >
                      {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button
                      onClick={handleCopy}
                      className="rounded-r-lg border border-glass-border bg-navy-700/50 px-2.5 py-2.5 text-text-muted transition-colors hover:text-purple-400"
                      title="Copy to clipboard"
                    >
                      {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleClose}
                  className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-purple-400"
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

interface RevokeConfirmProps {
  open: boolean;
  keyName: string;
  onConfirm: () => void;
  onCancel: () => void;
  revoking: boolean;
}

function RevokeConfirm({ open, keyName, onConfirm, onCancel, revoking }: RevokeConfirmProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-navy-900/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-sm animate-slide-up">
        <div className="glass-card border-red-500/20 p-6">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/15">
              <Trash2 size={18} className="text-red-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-text-primary">Revoke API Key</h3>
              <p className="mt-1 text-sm text-text-muted">
                Are you sure you want to revoke{" "}
                <span className="font-medium text-text-secondary">"{keyName}"</span>?
                Any services using this key will immediately lose access.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={onCancel}
              className="rounded-lg border border-glass-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-purple-500/30 hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={revoking}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-all",
                revoking
                  ? "bg-navy-600 text-text-muted cursor-not-allowed"
                  : "bg-red-500 hover:bg-red-400"
              )}
            >
              {revoking ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Revoking...
                </>
              ) : (
                <>
                  <Trash2 size={16} />
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
  /** Optionally inject keys from parent (e.g. from a real API) */
  initialKeys?: ApiKey[];
}

export default function ApiKeys({ initialKeys }: ApiKeysProps) {
  const [keys, setKeys] = useState<ApiKey[]>(() => initialKeys ?? mockApiKeys());
  const [showCreate, setShowCreate] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [hidingRevoked, setHidingRevoked] = useState(true);

  const activeKeys = useMemo(
    () => keys.filter((k) => k.status === "active"),
    [keys]
  );
  const revokedKeys = useMemo(
    () => keys.filter((k) => k.status === "revoked"),
    [keys]
  );

  const handleCreated = useCallback((newKey: ApiKey) => {
    setKeys((prev) => [newKey, ...prev]);
  }, []);

  const handleRevoke = useCallback(async () => {
    if (!revokingId) return;
    // Simulate API call
    await new Promise((r) => setTimeout(r, 600));
    setKeys((prev) =>
      prev.map((k) => (k.id === revokingId ? { ...k, status: "revoked" as const } : k))
    );
    setRevokingId(null);
    toast.success("API key revoked");
  }, [revokingId]);

  const revokingKey = revokingId ? keys.find((k) => k.id === revokingId) : null;

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Active Keys
          </p>
          <p className="text-sm text-text-secondary">
            {activeKeys.length} key{activeKeys.length !== 1 ? "s" : ""} active
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-purple-500 px-3 py-2 text-sm font-medium text-white transition-all hover:bg-purple-400"
        >
          <Plus size={16} />
          Create Key
        </button>
      </div>

      {/* Key List */}
      {keys.length === 0 ? (
        <div className="rounded-lg border border-dashed border-glass-border py-10 text-center">
          <Key size={32} className="mx-auto mb-3 text-text-muted/50" />
          <p className="text-sm text-text-muted">No API keys yet</p>
          <p className="mt-1 text-xs text-text-muted/60">
            Create a key to access the EuroScale API programmatically
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeKeys.map((key) => (
            <ApiKeyRow
              key={key.id}
              apiKey={key}
              onRevoke={() => setRevokingId(key.id)}
            />
          ))}

          {/* Revoked keys toggle */}
          {revokedKeys.length > 0 && (
            <div className="pt-2">
              <button
                onClick={() => setHidingRevoked(!hidingRevoked)}
                className="flex items-center gap-2 text-xs font-medium text-text-muted transition-colors hover:text-text-secondary"
              >
                <Shield size={14} />
                {hidingRevoked
                  ? `Show ${revokedKeys.length} revoked key${revokedKeys.length !== 1 ? "s" : ""}`
                  : "Hide revoked keys"}
              </button>

              {!hidingRevoked && (
                <div className="mt-2 space-y-2">
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
        "flex items-center justify-between rounded-lg px-4 py-3 transition-all",
        isRevoked
          ? "bg-navy-800/30 opacity-60"
          : "bg-navy-800/50 hover:bg-navy-800/70"
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            isRevoked ? "bg-navy-600 text-text-muted" : "bg-purple-500/15 text-purple-400"
          )}
        >
          <Key size={15} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-text-primary truncate">
              {apiKey.name}
            </p>
            {isRevoked && (
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-red-400">
                Revoked
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-text-muted">
            <span className="font-mono text-purple-300/60">
              {apiKey.prefix}{"*".repeat(32)}
            </span>
            <span className="flex items-center gap-1">
              <Calendar size={11} />
              {formatDate(apiKey.createdAt)}
            </span>
            {apiKey.lastUsedAt && (
              <span className="flex items-center gap-1">
                <Clock size={11} />
                Last used {formatDate(apiKey.lastUsedAt)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={handleCopy}
          className="rounded-lg p-2 text-text-muted transition-colors hover:bg-navy-700 hover:text-purple-400"
          title="Copy key prefix"
        >
          {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
        </button>
        {!isRevoked && onRevoke && (
          <button
            onClick={onRevoke}
            className="rounded-lg p-2 text-text-muted transition-colors hover:bg-red-500/10 hover:text-red-400"
            title="Revoke key"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
