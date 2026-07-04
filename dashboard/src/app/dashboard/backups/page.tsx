"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Clock,
  Database,
  HardDrive,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  AlertTriangle,
  ChevronDown,
  X,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/utils";
import { API_BASE_URL } from "@/lib/constants";
import { useAuth } from "@/lib/auth";
import { useDatabases } from "@/hooks/useDatabases";
import AuthGuard from "@/components/AuthGuard";
import toast from "react-hot-toast";

// ── Types ──────────────────────────────────────────────────────────────────

interface Backup {
  id: string;
  keyspace: string;
  cell: string;
  type: "full" | "incremental";
  position: string;
  time: string;
  size: number;
  status: string;
}

interface RestoreRecord {
  id: string;
  database_id: string;
  restore_timestamp: string;
  restore_type: string;
  status: "in-progress" | "completed" | "failed";
  created_at: string;
  completed_at?: string;
  error_message?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function toLocalDatetimeValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function BackupsPage() {
  return (
    <AuthGuard>
      <BackupsContent />
    </AuthGuard>
  );
}

function BackupsContent() {
  const { session } = useAuth();
  const { data: dbData, isLoading: dbsLoading } = useDatabases();

  const databases = dbData?.databases ?? [];

  const [selectedDbId, setSelectedDbId] = useState<string>("");
  const selectedDb = databases.find((d) => d.databaseId === selectedDbId);

  // Auto-select first database
  useEffect(() => {
    if (!selectedDbId && databases.length > 0) {
      setSelectedDbId(databases[0]!.databaseId);
    }
  }, [databases, selectedDbId]);

  // Backups state
  const [backups, setBackups] = useState<Backup[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupsError, setBackupsError] = useState<string | null>(null);

  // Restores state
  const [restores, setRestores] = useState<RestoreRecord[]>([]);
  const [restoresLoading, setRestoresLoading] = useState(false);

  // PITR state
  const [pitrTime, setPitrTime] = useState<string>("");
  const [restoring, setRestoring] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // ── Fetch backups ──────────────────────────────────────────────────────

  const fetchBackups = useCallback(async () => {
    if (!selectedDbId || !session?.id || !session?.token) return;
    setBackupsLoading(true);
    setBackupsError(null);
    try {
      const url = `${API_BASE_URL}/api/v1/backups?database_id=${encodeURIComponent(selectedDbId)}&user_id=${encodeURIComponent(session.id)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Backups fetch failed (${res.status})`);
      }
      const data = await res.json();
      setBackups((data.backups ?? []).sort(
        (a: Backup, b: Backup) => new Date(b.time).getTime() - new Date(a.time).getTime()
      ));
    } catch (err) {
      setBackupsError(err instanceof Error ? err.message : "Failed to load backups");
    } finally {
      setBackupsLoading(false);
    }
  }, [selectedDbId, session]);

  // Fetch on DB selection change
  useEffect(() => {
    if (selectedDbId) {
      fetchBackups();
    } else {
      setBackups([]);
      setBackupsError(null);
    }
  }, [selectedDbId, fetchBackups]);

  // ── Fetch restores ─────────────────────────────────────────────────────

  const fetchRestores = useCallback(async () => {
    if (!selectedDbId || !session?.id || !session?.token) return;
    setRestoresLoading(true);
    try {
      const url = `${API_BASE_URL}/api/v1/restores?database_id=${encodeURIComponent(selectedDbId)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Restores fetch failed (${res.status})`);
      }
      const data = await res.json();
      setRestores((data.restores ?? []).sort(
        (a: RestoreRecord, b: RestoreRecord) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
    } catch {
      // Restore history is non-critical; silent fail
    } finally {
      setRestoresLoading(false);
    }
  }, [selectedDbId, session]);

  useEffect(() => {
    if (selectedDbId) {
      fetchRestores();
    } else {
      setRestores([]);
    }
  }, [selectedDbId, fetchRestores]);

  // ── PITR Restore ───────────────────────────────────────────────────────

  const handleRestore = useCallback(async () => {
    if (!selectedDbId || !pitrTime || !session?.token) return;
    setShowConfirm(false);
    setRestoring(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/restore`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          database_id: selectedDbId,
          restore_timestamp: new Date(pitrTime).toISOString(),
          restore_type: "pitr",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Restore failed (${res.status})`);
      }
      toast.success("Point-in-Time Recovery started");
      fetchRestores();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setRestoring(false);
    }
  }, [selectedDbId, pitrTime, session, fetchRestores]);

  // ── Backup coverage range ──────────────────────────────────────────────

  const coverage = useMemo(() => {
    if (backups.length === 0) return null;
    const times = backups.map((b) => new Date(b.time).getTime()).sort((a, b) => a - b);
    return { earliest: new Date(times[0]!), latest: new Date(times[times.length - 1]!) };
  }, [backups]);

  // ── Determine if still loading initial state ───────────────────────────

  const isInitialLoading = dbsLoading || (selectedDbId && backupsLoading);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border-subtle bg-bg-primary/95 backdrop-blur-sm">
        <div className="flex h-12 items-center justify-between px-6">
          <div>
            <h1 className="text-sm font-semibold text-text-primary">
              Point-in-Time Recovery
            </h1>
          </div>
          {selectedDbId && (
            <button
              onClick={() => {
                fetchBackups();
                fetchRestores();
              }}
              disabled={backupsLoading}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium",
                "text-text-secondary hover:text-text-primary hover:bg-surface-2",
                "transition-colors border border-border-subtle min-h-[44px]",
                backupsLoading && "opacity-50 cursor-not-allowed",
              )}
              aria-label="Refresh backups"
            >
              <RefreshCw
                size={13}
                className={cn(backupsLoading && "animate-spin")}
              />
              Refresh
            </button>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto px-6 py-6 space-y-6">
        {/* Description */}
        <p className="text-sm text-text-muted max-w-2xl">
          Restore your database to any point in time within the backup retention window.
          Select a database below to view its backup timeline and initiate a
          point-in-time recovery.
        </p>

        {/* Database selector */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider">
            Database
          </label>
          <div className="relative w-full max-w-xs">
            <select
              value={selectedDbId}
              onChange={(e) => setSelectedDbId(e.target.value)}
              disabled={dbsLoading || databases.length === 0}
              className={cn(
                "w-full appearance-none rounded-lg border border-border-subtle bg-surface-1",
                "px-3 py-2.5 pr-9 text-sm text-text-primary",
                "focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent",
                "transition-colors cursor-pointer",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {dbsLoading ? (
                <option>Loading databases…</option>
              ) : databases.length === 0 ? (
                <option>No databases available</option>
              ) : (
                databases.map((db) => (
                  <option key={db.databaseId} value={db.databaseId}>
                    {db.name} ({db.databaseId})
                  </option>
                ))
              )}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted"
            />
          </div>
        </div>

        {/* Separator when DB is selected */}
        {selectedDbId && <hr className="border-border-subtle" />}

        {/* Backup timeline */}
        {selectedDbId && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-text-muted" />
              <h2 className="text-sm font-semibold text-text-primary">
                Backup Timeline
              </h2>
              {backups.length > 0 && (
                <span className="text-xs text-text-muted font-mono">
                  ({backups.length} backups)
                </span>
              )}
            </div>

            {/* Error state */}
            {backupsError && (
              <div className="rounded-lg border border-border-subtle bg-surface-1 p-6 text-center space-y-3">
                <AlertTriangle size={24} className="mx-auto text-error-text" />
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    Could not load backups
                  </p>
                  <p className="text-xs text-text-muted mt-1">{backupsError}</p>
                </div>
                <button
                  onClick={fetchBackups}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-accent-text hover:text-accent-hover hover:bg-accent-subtle transition-colors"
                >
                  <RefreshCw size={13} />
                  Retry
                </button>
              </div>
            )}

            {/* Loading skeleton */}
            {backupsLoading && (
              <div className="rounded-lg border border-border-subtle bg-surface-1 overflow-hidden">
                <div className="animate-pulse">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="flex items-center gap-4 px-4 py-3 border-b border-border-subtle last:border-b-0"
                    >
                      <div className="skeleton h-3.5 w-36" />
                      <div className="skeleton h-3.5 w-12" />
                      <div className="skeleton h-3.5 w-16" />
                      <div className="skeleton h-3.5 w-14" />
                      <div className="skeleton h-3.5 w-20 ml-auto" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!backupsLoading && !backupsError && backups.length === 0 && (
              <div className="rounded-lg border border-border-subtle bg-surface-1 py-10 px-6 text-center space-y-2">
                <Database size={28} className="mx-auto text-text-disabled" />
                <p className="text-sm font-medium text-text-primary">
                  No backups available
                </p>
                <p className="text-xs text-text-muted max-w-sm mx-auto">
                  Backups run daily at 2AM UTC. Once backups are created, they will
                  appear here and you can restore to any point within the retention
                  window.
                </p>
              </div>
            )}

            {/* Backup table */}
            {!backupsLoading && !backupsError && backups.length > 0 && (
              <div className="rounded-lg border border-border-subtle bg-surface-1 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border-subtle bg-surface-2">
                        <th className="text-left px-4 py-2.5 font-medium text-text-secondary whitespace-nowrap">
                          Date / Time
                        </th>
                        <th className="text-left px-4 py-2.5 font-medium text-text-secondary whitespace-nowrap">
                          Type
                        </th>
                        <th className="text-left px-4 py-2.5 font-medium text-text-secondary whitespace-nowrap hidden sm:table-cell">
                          Keyspace
                        </th>
                        <th className="text-left px-4 py-2.5 font-medium text-text-secondary whitespace-nowrap hidden md:table-cell">
                          Size
                        </th>
                        <th className="text-left px-4 py-2.5 font-medium text-text-secondary whitespace-nowrap">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {backups.map((b) => (
                        <tr
                          key={b.id}
                          className="hover:bg-surface-2/50 transition-colors"
                        >
                          <td className="px-4 py-3 text-text-primary font-mono whitespace-nowrap">
                            {formatDateTime(b.time)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                                b.type === "full"
                                  ? "bg-blue-500/10 text-blue-400"
                                  : "bg-surface-3 text-text-muted",
                              )}
                            >
                              {b.type === "full" ? "FULL" : "INCR"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-text-secondary whitespace-nowrap font-mono hidden sm:table-cell">
                            {b.keyspace}
                          </td>
                          <td className="px-4 py-3 text-text-secondary whitespace-nowrap font-mono hidden md:table-cell">
                            {formatBytes(b.size)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                                b.status === "completed"
                                  ? "bg-success-subtle text-success-text"
                                  : b.status === "failed"
                                    ? "bg-error-subtle text-error-text"
                                    : "bg-warning-subtle text-warning-text",
                              )}
                            >
                              {b.status === "completed" && (
                                <Check size={10} className="shrink-0" />
                              )}
                              {b.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Coverage indicator */}
            {coverage && (
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <HardDrive size={12} />
                <span>
                  Coverage:{" "}
                  <span className="text-text-secondary font-mono">
                    {formatDateTime(coverage.earliest.toISOString())}
                  </span>{" "}
                  —{" "}
                  <span className="text-text-secondary font-mono">
                    {formatDateTime(coverage.latest.toISOString())}
                  </span>
                </span>
              </div>
            )}
          </section>
        )}

        {/* PITR restore section */}
        {selectedDbId && backups.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <RotateCcw size={16} className="text-text-muted" />
              <h2 className="text-sm font-semibold text-text-primary">
                Restore to Point in Time
              </h2>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface-1 p-5 space-y-4">
              <p className="text-xs text-text-muted">
                Select a date and time within the backup coverage range to restore
                the database to that exact point.
              </p>

              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="flex-1 max-w-xs">
                  <label
                    htmlFor="pitr-datetime"
                    className="block text-xs font-medium text-text-secondary mb-1.5"
                  >
                    Restore point
                  </label>
                  <input
                    id="pitr-datetime"
                    type="datetime-local"
                    value={pitrTime}
                    onChange={(e) => setPitrTime(e.target.value)}
                    min={
                      coverage
                        ? coverage.earliest.toISOString().slice(0, 16)
                        : undefined
                    }
                    max={
                      coverage
                        ? coverage.latest.toISOString().slice(0, 16)
                        : undefined
                    }
                    className={cn(
                      "w-full rounded-lg bg-surface-2 border border-border-subtle",
                      "px-3 py-2.5 text-sm text-text-primary",
                      "focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent",
                      "transition-colors",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      "[color-scheme:dark]",
                    )}
                  />
                  {coverage && (
                    <p className="mt-1 text-[11px] text-text-muted">
                      Available:{" "}
                      {coverage.earliest.toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      —{" "}
                      {coverage.latest.toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={!pitrTime || restoring}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold",
                    "bg-accent text-white hover:bg-accent-hover active:bg-accent-pressed",
                    "transition-colors min-h-[44px]",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  {restoring ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Restoring…
                    </>
                  ) : (
                    <>
                      <RotateCcw size={15} />
                      Restore to this point
                    </>
                  )}
                </button>
              </div>

              {/* Coverage bar */}
              {coverage && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-text-muted">
                    <span>
                      {coverage.earliest.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span>
                      {coverage.latest.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                    {(() => {
                      const range = coverage.latest.getTime() - coverage.earliest.getTime();
                      const pos = pitrTime
                        ? Math.max(
                            0,
                            Math.min(
                              100,
                              ((new Date(pitrTime).getTime() - coverage.earliest.getTime()) /
                                range) *
                                100,
                            ),
                          )
                        : 50; // default to middle
                      return (
                        <>
                          <div
                            className="h-full rounded-full bg-accent/70"
                            style={{ width: "100%" }}
                          />
                          <div
                            className="relative -top-1.5 w-2.5 h-2.5 rounded-full bg-accent border-2 border-bg-primary mx-auto"
                            style={{ marginLeft: `${pos}%` }}
                          />
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Restore history */}
        {selectedDbId && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <History size={16} className="text-text-muted" />
              <h2 className="text-sm font-semibold text-text-primary">
                Restore History
              </h2>
              {restores.length > 0 && (
                <span className="text-xs text-text-muted font-mono">
                  ({restores.length} operations)
                </span>
              )}
            </div>

            {/* Loading skeleton */}
            {restoresLoading && (
              <div className="rounded-lg border border-border-subtle bg-surface-1 overflow-hidden">
                <div className="animate-pulse">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="flex items-center gap-4 px-4 py-3 border-b border-border-subtle last:border-b-0"
                    >
                      <div className="skeleton h-3.5 w-36" />
                      <div className="skeleton h-3.5 w-36" />
                      <div className="skeleton h-3.5 w-20 ml-auto" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!restoresLoading && restores.length === 0 && (
              <div className="rounded-lg border border-border-subtle bg-surface-1 py-8 px-6 text-center">
                <p className="text-xs text-text-muted">
                  No restore operations yet. Use the Point-in-Time Recovery tool
                  above to initiate a restore.
                </p>
              </div>
            )}

            {/* Restore table */}
            {!restoresLoading && restores.length > 0 && (
              <div className="rounded-lg border border-border-subtle bg-surface-1 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border-subtle bg-surface-2">
                        <th className="text-left px-4 py-2.5 font-medium text-text-secondary whitespace-nowrap">
                          Date requested
                        </th>
                        <th className="text-left px-4 py-2.5 font-medium text-text-secondary whitespace-nowrap">
                          Target time
                        </th>
                        <th className="text-left px-4 py-2.5 font-medium text-text-secondary whitespace-nowrap">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {restores.map((r) => (
                        <tr
                          key={r.id}
                          className="hover:bg-surface-2/50 transition-colors"
                        >
                          <td className="px-4 py-3 text-text-primary font-mono whitespace-nowrap">
                            {formatDateTime(r.created_at)}
                          </td>
                          <td className="px-4 py-3 text-text-primary font-mono whitespace-nowrap">
                            {formatDateTime(r.restore_timestamp)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                                r.status === "completed"
                                  ? "bg-success-subtle text-success-text"
                                  : r.status === "failed"
                                    ? "bg-error-subtle text-error-text"
                                    : "bg-warning-subtle text-warning-text",
                              )}
                            >
                              {r.status === "in-progress" && (
                                <Loader2
                                  size={10}
                                  className="animate-spin shrink-0"
                                />
                              )}
                              {r.status === "completed" && (
                                <Check size={10} className="shrink-0" />
                              )}
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Confirmation dialog */}
      {showConfirm && selectedDb && pitrTime && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setShowConfirm(false)}
          />
          <div className="relative w-full max-w-sm rounded-xl border border-border-subtle bg-surface-1 p-6 shadow-2xl animate-slide-up">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning-subtle">
                <AlertTriangle size={18} className="text-warning-text" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-text-primary">
                  Confirm Point-in-Time Recovery
                </h3>
                <p className="mt-2 text-xs text-text-secondary leading-relaxed">
                  This will restore{" "}
                  <span className="font-medium text-text-primary">
                    {selectedDb.name}
                  </span>{" "}
                  to{" "}
                  <span className="font-medium text-text-primary font-mono">
                    {formatDateTime(new Date(pitrTime).toISOString())}
                  </span>
                  .
                </p>
                <p className="mt-1.5 text-xs text-error-text font-medium">
                  Current data will be lost. This action cannot be undone.
                </p>
                <p className="mt-3 text-xs text-text-muted">
                  Are you sure you want to proceed?
                </p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={restoring}
                className={cn(
                  "rounded-lg border border-border-subtle px-4 py-2 text-xs font-medium",
                  "text-text-secondary hover:text-text-primary hover:bg-surface-2",
                  "transition-colors min-h-[44px]",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                Cancel
              </button>
              <button
                onClick={handleRestore}
                disabled={restoring}
                className={cn(
                  "rounded-lg px-4 py-2 text-xs font-semibold text-white",
                  "bg-accent hover:bg-accent-hover active:bg-accent-pressed",
                  "transition-colors min-h-[44px] inline-flex items-center gap-2",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {restoring ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Restoring…
                  </>
                ) : (
                  "Proceed"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
