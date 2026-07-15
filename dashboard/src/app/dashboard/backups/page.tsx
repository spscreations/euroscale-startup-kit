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
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

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

  // Depend on session?.id (stable string), not the whole session object —
  // auth context may recreate session every render, which would recreate
  // these callbacks and re-fire the effects → infinite loading blink.
  const sessionId = session?.id;

  const fetchBackups = useCallback(async () => {
    if (!selectedDbId || !sessionId) return;
    setBackupsLoading(true);
    setBackupsError(null);
    try {
      const url = `/api/rest/api/v1/backups?database_id=${encodeURIComponent(selectedDbId)}`;
      const res = await fetch(url);
      if (!res.ok) {
        // Stable error UI — do not auto-retry on 401/502 (would loop).
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
  }, [selectedDbId, sessionId]);

  // Fetch on DB selection / session readiness change (stable deps only)
  useEffect(() => {
    if (selectedDbId && sessionId) {
      fetchBackups();
    } else if (!selectedDbId) {
      setBackups([]);
      setBackupsError(null);
    }
  }, [selectedDbId, sessionId, fetchBackups]);

  // ── Fetch restores ─────────────────────────────────────────────────────

  const fetchRestores = useCallback(async () => {
    if (!selectedDbId || !sessionId) return;
    setRestoresLoading(true);
    try {
      const url = `/api/rest/api/v1/restores?database_id=${encodeURIComponent(selectedDbId)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Restores fetch failed (${res.status})`);
      }
      const data = await res.json();
      setRestores((data.restores ?? []).sort(
        (a: RestoreRecord, b: RestoreRecord) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
    } catch {
      // Restore history is non-critical; silent fail (no auto-retry loop)
    } finally {
      setRestoresLoading(false);
    }
  }, [selectedDbId, sessionId]);

  useEffect(() => {
    if (selectedDbId && sessionId) {
      fetchRestores();
    } else if (!selectedDbId) {
      setRestores([]);
    }
  }, [selectedDbId, sessionId, fetchRestores]);

  // ── PITR Restore ───────────────────────────────────────────────────────

  const handleRestore = useCallback(async () => {
    if (!selectedDbId || !pitrTime) return;
    setShowConfirm(false);
    setRestoring(true);
    try {
      const res = await fetch(`/api/rest/api/v1/restore`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
  }, [selectedDbId, pitrTime, fetchRestores]);

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
            <Button
              onClick={() => {
                fetchBackups();
                fetchRestores();
              }}
              disabled={backupsLoading}
              variant="outline"
              size="sm"
            >
              <RefreshCw
                size={13}
                className={cn(backupsLoading && "animate-spin")}
              />
              Refresh
            </Button>
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
          <Select
            value={selectedDbId}
            onValueChange={(value) => { if (value) setSelectedDbId(value); }}
            disabled={dbsLoading || databases.length === 0}
          >
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue placeholder={
                dbsLoading
                  ? "Loading databases…"
                  : databases.length === 0
                    ? "No databases available"
                    : "Select a database"
              } />
            </SelectTrigger>
            <SelectContent>
              {databases.map((db) => (
                <SelectItem key={db.databaseId} value={db.databaseId}>
                  {db.name} ({db.databaseId})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Separator when DB is selected */}
        {selectedDbId && <Separator />}

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
              <Card className="text-center space-y-3 p-6">
                <AlertTriangle size={24} className="mx-auto text-destructive" />
                <div>
                  <p className="text-sm font-medium">
                    Could not load backups
                  </p>
                  <p className="text-xs text-text-muted mt-1">{backupsError}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={fetchBackups}
                >
                  <RefreshCw size={13} />
                  Retry
                </Button>
              </Card>
            )}

            {/* Loading skeleton */}
            {backupsLoading && (
              <Card className="overflow-hidden">
                <div className="animate-pulse">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="flex items-center gap-4 px-4 py-3 border-b border-border-subtle last:border-b-0"
                    >
                      <Skeleton className="h-3.5 w-36" />
                      <Skeleton className="h-3.5 w-12" />
                      <Skeleton className="h-3.5 w-16" />
                      <Skeleton className="h-3.5 w-14" />
                      <Skeleton className="h-3.5 w-20 ml-auto" />
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Empty state */}
            {!backupsLoading && !backupsError && backups.length === 0 && (
              <Card className="py-10 px-6 text-center space-y-2">
                <Database size={28} className="mx-auto text-text-disabled" />
                <p className="text-sm font-medium">
                  No backups available
                </p>
                <p className="text-xs text-text-muted max-w-sm mx-auto">
                  Backups run daily at 2AM UTC. Once backups are created, they will
                  appear here and you can restore to any point within the retention
                  window.
                </p>
              </Card>
            )}

            {/* Backup table */}
            {!backupsLoading && !backupsError && backups.length > 0 && (
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-surface-2">
                      <TableHead>Date / Time</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="hidden sm:table-cell">Keyspace</TableHead>
                      <TableHead className="hidden md:table-cell">Size</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {backups.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono">
                          {formatDateTime(b.time)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={b.type === "full" ? "default" : "secondary"}>
                            {b.type === "full" ? "FULL" : "INCR"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono hidden sm:table-cell">
                          {b.keyspace}
                        </TableCell>
                        <TableCell className="font-mono hidden md:table-cell">
                          {formatBytes(b.size)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              b.status === "completed"
                                ? "default"
                                : b.status === "failed"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {b.status === "completed" && <Check size={10} className="shrink-0 mr-1" />}
                            {b.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
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

            <Card>
              <CardContent className="p-5 space-y-4">
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
                    <Input
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
                      className="[color-scheme:dark]"
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

                  <Button
                    onClick={() => setShowConfirm(true)}
                    disabled={!pitrTime || restoring}
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
                  </Button>
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
                          : 50;
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
              </CardContent>
            </Card>
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
              <Card className="overflow-hidden">
                <div className="animate-pulse">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="flex items-center gap-4 px-4 py-3 border-b border-border-subtle last:border-b-0"
                    >
                      <Skeleton className="h-3.5 w-36" />
                      <Skeleton className="h-3.5 w-36" />
                      <Skeleton className="h-3.5 w-20 ml-auto" />
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Empty state */}
            {!restoresLoading && restores.length === 0 && (
              <Card className="py-8 px-6 text-center">
                <p className="text-xs text-text-muted">
                  No restore operations yet. Use the Point-in-Time Recovery tool
                  above to initiate a restore.
                </p>
              </Card>
            )}

            {/* Restore table */}
            {!restoresLoading && restores.length > 0 && (
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-surface-2">
                      <TableHead>Date requested</TableHead>
                      <TableHead>Target time</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {restores.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono">
                          {formatDateTime(r.created_at)}
                        </TableCell>
                        <TableCell className="font-mono">
                          {formatDateTime(r.restore_timestamp)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              r.status === "completed"
                                ? "default"
                                : r.status === "failed"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {r.status === "in-progress" && (
                              <Loader2
                                size={10}
                                className="animate-spin shrink-0 mr-1"
                              />
                            )}
                            {r.status === "completed" && (
                              <Check size={10} className="shrink-0 mr-1" />
                            )}
                            {r.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </section>
        )}
      </main>

      {/* Confirmation dialog */}
      <Dialog open={showConfirm} onOpenChange={(v) => !v && setShowConfirm(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Point-in-Time Recovery</DialogTitle>
            <DialogDescription>
              This will restore{" "}
              <span className="font-medium">{selectedDb?.name}</span>{" "}
              to{" "}
              <span className="font-medium font-mono">
                {pitrTime ? formatDateTime(new Date(pitrTime).toISOString()) : ""}
              </span>
              .
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs text-destructive font-medium">
            Current data will be lost. This action cannot be undone.
          </p>
          <p className="text-xs text-text-muted">
            Are you sure you want to proceed?
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirm(false)}
              disabled={restoring}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRestore}
              disabled={restoring}
            >
              {restoring ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Restoring…
                </>
              ) : (
                "Proceed"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
