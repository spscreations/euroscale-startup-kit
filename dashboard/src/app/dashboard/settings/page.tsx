"use client";

import { useState, useCallback } from "react";
import {
  User,
  Key,
  Bell,
  Trash2,
  Plus,
  Copy,
  EyeOff,
  Eye,
  X,
  Loader2,
  Shield,
  Server,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import toast from "react-hot-toast";

// ── Types ────────────────────────────────────────────────────────────────────

interface ApiKey {
  id: string;
  name: string;
  key: string;
  created: Date;
  lastUsed: Date | null;
  revealed: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function maskKey(key: string): string {
  if (key.length <= 10) return key;
  return `sk_${"*".repeat(key.length - 7)}${key.slice(-3)}`;
}

function getInitials(name: string | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function timeAgo(date: Date | null): string {
  if (!date) return "Never";
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ── Mock API keys ────────────────────────────────────────────────────────────

const mockKeys: ApiKey[] = [
  {
    id: "1",
    name: "Production",
    key: "sk_prod_8a7b3c2d1e4f5a6b7c8d9e0f1a2b3c4d",
    created: new Date("2026-06-15"),
    lastUsed: new Date(),
    revealed: false,
  },
  {
    id: "2",
    name: "Staging",
    key: "sk_stag_2b4d6f8h0j1l3n5p7r9t1v3x5z7a9c",
    created: new Date("2026-06-20"),
    lastUsed: new Date(Date.now() - 3600000),
    revealed: false,
  },
];

// ── Notification toggles ─────────────────────────────────────────────────────

interface Toggle {
  id: string;
  label: string;
  description: string;
}

const toggles: Toggle[] = [
  {
    id: "backup",
    label: "Backup notifications",
    description: "Get notified when database backups complete or fail.",
  },
  {
    id: "billing",
    label: "Billing alerts",
    description: "Receive alerts about upcoming invoices and payment issues.",
  },
  {
    id: "updates",
    label: "Product updates",
    description: "Stay informed about new features and improvements.",
  },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { session } = useAuth();

  // ── Profile ───────────────────────────────────────────────────────

  const [editLoading, setEditLoading] = useState(false);
  const handleEditProfile = useCallback(() => {
    setEditLoading(true);
    setTimeout(() => {
      setEditLoading(false);
      toast("Profile editing coming soon", { icon: "🚧" });
    }, 300);
  }, []);

  // ── API Keys ──────────────────────────────────────────────────────

  const [apiKeys, setApiKeys] = useState<ApiKey[]>(mockKeys);
  const [showGenerate, setShowGenerate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const handleGenerateKey = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!newKeyName.trim()) return;
      setGenerating(true);
      setTimeout(() => {
        const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
        let suffix = "";
        for (let i = 0; i < 32; i++)
          suffix += chars.charAt(Math.floor(Math.random() * chars.length));
        const key: ApiKey = {
          id: crypto.randomUUID?.() ?? String(Date.now()),
          name: newKeyName.trim(),
          key: `sk_eusc_${suffix}`,
          created: new Date(),
          lastUsed: null,
          revealed: true,
        };
        setApiKeys((prev) => [key, ...prev]);
        setNewKeyName("");
        setShowGenerate(false);
        setGenerating(false);
        toast.success(`API key "${key.name}" created`);
      }, 800);
    },
    [newKeyName],
  );

  const handleRevokeKey = useCallback(
    (keyId: string) => {
      const key = apiKeys.find((k) => k.id === keyId);
      if (!key) return;
      if (
        !window.confirm(
          `Revoke "${key.name}"?\n\nThis cannot be undone. Any services using this key will lose access immediately.`,
        )
      )
        return;
      setRevokingId(keyId);
      setTimeout(() => {
        setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
        setRevokingId(null);
        toast.success(`"${key.name}" revoked`);
      }, 400);
    },
    [apiKeys],
  );

  const handleCopyKey = useCallback((key: string) => {
    navigator.clipboard
      .writeText(key)
      .then(() => toast.success("API key copied to clipboard"))
      .catch(() => toast.error("Failed to copy"));
  }, []);

  const handleToggleReveal = useCallback((keyId: string) => {
    setApiKeys((prev) =>
      prev.map((k) => (k.id === keyId ? { ...k, revealed: !k.revealed } : k)),
    );
  }, []);

  // ── Notifications ─────────────────────────────────────────────────

  const [enabledToggles, setEnabledToggles] = useState<Set<string>>(
    () => new Set(toggles.map((t) => t.id)),
  );

  const handleToggle = useCallback(
    (id: string) => {
      setEnabledToggles((prev) => {
        const next = new Set(prev);
        const enabled = !prev.has(id);
        if (enabled) next.add(id);
        else next.delete(id);
        const t = toggles.find((t) => t.id === id);
        if (t) toast(`${t.label} ${enabled ? "enabled" : "disabled"}`, { icon: enabled ? "🔔" : "🔕" });
        return next;
      });
    },
    [],
  );

  // ── Danger zone ───────────────────────────────────────────────────

  const [deleteLoading, setDeleteLoading] = useState(false);
  const handleDeleteAccount = useCallback(() => {
    if (
      !window.confirm(
        "Delete your account?\n\nThis is irreversible. All databases, API keys, and data will be permanently deleted within 30 days.",
      )
    )
      return;
    if (!window.confirm("Final confirmation: type DELETE to confirm.")) return;
    setDeleteLoading(true);
    setTimeout(() => {
      setDeleteLoading(false);
      toast.error("Account deletion is not yet implemented.");
    }, 1000);
  }, []);

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fade">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="gradient-text">Settings</span>
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Manage your profile, API keys, and account preferences.
          </p>
        </div>

        {/* ── 1. Profile ─────────────────────────────────────────── */}

        <section className="glass-card p-6 space-y-5">
          <div className="flex items-center gap-1.5">
            <User size={18} className="text-purple-400" />
            <h2 className="text-lg font-semibold text-text-primary">Profile</h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-cyan-400 flex items-center justify-center text-xl font-bold text-white shrink-0 shadow-lg shadow-purple-500/20">
              {getInitials(session?.name)}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-lg font-semibold text-text-primary truncate">
                {session?.name ?? "User"}
              </p>
              <p className="text-sm text-text-muted truncate">
                {session?.email ?? "—"}
              </p>
            </div>
            <button
              onClick={handleEditProfile}
              disabled={editLoading}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium",
                "border border-glass-border text-text-secondary",
                "hover:text-purple-300 hover:border-purple-500/30 hover:bg-purple-500/10",
                "transition-all duration-200",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {editLoading ? <Loader2 size={15} className="animate-spin" /> : "Edit"}
            </button>
          </div>
        </section>

        {/* ── 2. API Keys ────────────────────────────────────────── */}

        <section className="glass-card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Key size={18} className="text-purple-400" />
              <h2 className="text-lg font-semibold text-text-primary">API Keys</h2>
            </div>
            <button
              onClick={() => setShowGenerate(true)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white",
                "bg-gradient-to-r from-purple-500 to-purple-400",
                "hover:from-purple-400 hover:to-purple-300",
                "transition-all duration-150 shadow-lg shadow-purple-500/20",
              )}
            >
              <Plus size={15} />
              Generate New Key
            </button>
          </div>

          {apiKeys.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <Shield size={36} className="mx-auto text-text-muted" />
              <p className="text-sm text-text-muted">No API keys yet</p>
              <p className="text-xs text-text-muted/70">
                Generate an API key to access EuroScale programmatically.
              </p>
              <button
                onClick={() => setShowGenerate(true)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium",
                  "text-purple-400 hover:text-purple-300 hover:bg-purple-500/10",
                  "transition-all duration-150",
                )}
              >
                <Plus size={15} />
                Create your first key
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className={cn(
                    "rounded-lg border border-glass-border bg-navy-800/50 p-4",
                    "transition-all duration-200",
                    revokingId === key.id && "opacity-50",
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div>
                        <p className="text-sm font-semibold text-text-primary flex items-center gap-2">
                          {key.name}
                          {key.lastUsed === null && (
                            <span className="inline-flex items-center rounded-full bg-gold-400/10 px-2 py-0.5 text-[10px] font-medium text-gold-400">
                              New
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="text-xs font-mono text-text-muted bg-navy-700 rounded px-2 py-0.5">
                            {key.revealed ? key.key : maskKey(key.key)}
                          </code>
                          <button
                            onClick={() => handleCopyKey(key.key)}
                            className="shrink-0 p-1 rounded text-text-muted hover:text-purple-400 hover:bg-purple-500/10 transition-all duration-150"
                            title="Copy to clipboard"
                          >
                            <Copy size={13} />
                          </button>
                          <button
                            onClick={() => handleToggleReveal(key.id)}
                            className="shrink-0 p-1 rounded text-text-muted hover:text-purple-400 hover:bg-purple-500/10 transition-all duration-150"
                            title={key.revealed ? "Hide key" : "Reveal full key"}
                          >
                            {key.revealed ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-text-muted">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays size={12} />
                          Created {key.created.toLocaleDateString()}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Server size={12} />
                          Last used {timeAgo(key.lastUsed)}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleRevokeKey(key.id)}
                      disabled={revokingId === key.id}
                      className={cn(
                        "shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
                        "text-red-400 border border-red-400/20",
                        "hover:bg-red-500/10 hover:border-red-400/40 hover:text-red-300",
                        "transition-all duration-150",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                      )}
                    >
                      {revokingId === key.id ? (
                        <>
                          <Loader2 size={12} className="animate-spin" /> Revoking…
                        </>
                      ) : (
                        <>
                          <Trash2 size={12} /> Revoke
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── 3. Notifications ────────────────────────────────────── */}

        <section className="glass-card p-6 space-y-5">
          <div className="flex items-center gap-1.5">
            <Bell size={18} className="text-purple-400" />
            <h2 className="text-lg font-semibold text-text-primary">Notifications</h2>
          </div>

          <div className="space-y-4">
            {toggles.map((toggle) => {
              const on = enabledToggles.has(toggle.id);
              return (
                <div key={toggle.id} className="flex items-center justify-between gap-4 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary">{toggle.label}</p>
                    <p className="text-xs text-text-muted mt-0.5">{toggle.description}</p>
                  </div>
                  <button
                    onClick={() => handleToggle(toggle.id)}
                    role="switch"
                    aria-checked={on}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-all duration-200",
                      "focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-navy-900",
                      on ? "bg-purple-500" : "bg-navy-600",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 mt-px",
                        on ? "translate-x-[22px]" : "translate-x-[2px]",
                      )}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── 4. Danger Zone ──────────────────────────────────────── */}

        <section className="glass-card p-6 space-y-5 border-red-400/20 hover:border-red-400/30">
          <div className="flex items-center gap-1.5">
            <Trash2 size={18} className="text-red-400" />
            <h2 className="text-lg font-semibold text-red-400">Danger Zone</h2>
          </div>

          <p className="text-sm text-text-muted">
            Once you delete your account, there is no going back. Please be certain.
          </p>

          <button
            onClick={handleDeleteAccount}
            disabled={deleteLoading}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold",
              "bg-red-500/10 text-red-400 border border-red-400/20",
              "hover:bg-red-500/20 hover:border-red-400/40 hover:text-red-300",
              "transition-all duration-200",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {deleteLoading ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Deleting…
              </>
            ) : (
              <>
                <Trash2 size={15} /> Delete Account
              </>
            )}
          </button>
        </section>
      </div>

      {/* ── Generate Key Modal ────────────────────────────────────── */}

      {showGenerate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-navy-900/70 backdrop-blur-sm"
            onClick={() => !generating && setShowGenerate(false)}
          />
          <div className="relative w-full max-w-md glass-card rounded-xl p-6 md:p-8 animate-slide-up shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-text-primary">Generate API Key</h2>
              <button
                onClick={() => setShowGenerate(false)}
                disabled={generating}
                className="text-text-muted hover:text-text-primary transition-colors"
                aria-label="Close dialog"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleGenerateKey} className="space-y-5">
              <div>
                <label htmlFor="key-name" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Key name
                </label>
                <input
                  id="key-name"
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="Production key"
                  required
                  disabled={generating}
                  autoFocus
                  className={cn(
                    "w-full rounded-lg bg-navy-800 border border-glass-border",
                    "px-4 py-2.5 text-sm text-text-primary",
                    "placeholder:text-text-muted",
                    "focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50",
                    "transition-all duration-200",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                />
                <p className="mt-1.5 text-xs text-text-muted">
                  Give your key a descriptive name to identify its purpose.
                </p>
              </div>

              <button
                type="submit"
                disabled={!newKeyName.trim() || generating}
                className={cn(
                  "w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white",
                  "bg-gradient-to-r from-purple-500 to-purple-400",
                  "hover:from-purple-400 hover:to-purple-300",
                  "transition-all duration-150 shadow-lg shadow-purple-500/20",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {generating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Plus size={16} /> Generate key
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
