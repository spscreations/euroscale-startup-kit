"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  RefreshCw,
  Loader2,
  Database,
  X,
  Server,
  MapPin,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import AuthGuard from "@/components/AuthGuard";
import TierCard from "@/components/TierCard";
import StatsCards from "@/components/StatsCards";
import DatabaseCard from "@/components/DatabaseCard";
import { useDatabases } from "@/hooks/useDatabases";
import { useDeleteDatabase } from "@/hooks/useDeleteDatabase";
import { useCreateDatabase } from "@/hooks/useCreateDatabase";
import { useUsage } from "@/hooks/useUsage";
import { useAuth } from "@/lib/auth";
import toast from "react-hot-toast";

/**
 * Format raw storage bytes into a human-readable string.
 * Returns "—" for zero/empty, kB/MB/GB as appropriate.
 */
function formatStorage(bytes: bigint): string {
  const n = Number(bytes);
  if (n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} kB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}

function DashboardContent() {
  const router = useRouter();
  const { session } = useAuth();
  const { data, isLoading, isError, error, refetch } = useDatabases();
  const { data: usageData } = useUsage();
  const deleteMutation = useDeleteDatabase();
  const createMutation = useCreateDatabase();

  const databases = data?.databases ?? [];
  const totalDatabases = data?.total ?? databases.length;
  const readyCount = databases.filter((db) => db.status === "ready").length;

  // REAL data from backend usage tracking
  const usage = usageData?.usage;
  const dbCount = usage?.databaseCount ?? totalDatabases;
  const storageBytes = usage?.storageBytes ?? 0n;
  const storageUsed = formatStorage(storageBytes);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = useCallback(
    (databaseId: string) => {
      const db = databases.find((d) => d.databaseId === databaseId);
      const name = db?.name ?? databaseId;

      if (
        !window.confirm(
          `Are you sure you want to delete "${name}"?\n\nThis action cannot be undone. All data in this database will be permanently lost.`,
        )
      )
        return;

      setDeletingId(databaseId);
      deleteMutation.mutate(
        { databaseId },
        {
          onSuccess: () => {
            toast.success(`Database "${name}" deleted`);
            setDeletingId(null);
          },
          onError: (err: Error) => {
            toast.error(err.message || "Failed to delete database");
            setDeletingId(null);
          },
        },
      );
    },
    [databases, deleteMutation],
  );

  const handleView = useCallback(
    (databaseId: string) => {
      router.push(`/dashboard/${databaseId}`);
    },
    [router],
  );

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [newDbName, setNewDbName] = useState("");
  const [newDbRegion, setNewDbRegion] = useState("nuremberg");

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newDbName.trim() || !session?.id) return;

      createMutation.mutate(
        {
          name: newDbName.trim(),
          engine: "mysql",
          region: newDbRegion,
          userId: session.id,
        },
        {
          onSuccess: () => {
            toast.success(`Database "${newDbName.trim()}" created`);
            setShowCreate(false);
            setNewDbName("");
            setNewDbRegion("nuremberg");
          },
          onError: (err: Error) => {
            toast.error(err.message || "Failed to create database");
          },
        },
      );
    },
    [newDbName, newDbRegion, session?.id, createMutation],
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-border-subtle bg-bg-primary/95 backdrop-blur-sm">
        <div className="flex h-12 items-center justify-between px-6">
          <div>
            <h1 className="text-sm font-semibold text-text-primary">
              Databases
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium",
                "text-text-secondary hover:text-text-primary hover:bg-surface-2",
                "transition-colors border border-border-subtle min-h-[44px]",
                isLoading && "opacity-50 cursor-not-allowed",
              )}
              aria-label="Refresh databases"
            >
              <RefreshCw
                size={13}
                className={cn(isLoading && "animate-spin")}
              />
              Refresh
            </button>

            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold text-white bg-accent hover:bg-accent-hover active:bg-accent-pressed transition-colors min-h-[44px]"
            >
              <Plus size={14} />
              New database
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto px-6 py-6 space-y-6">
        {/* Tier & Usage */}
        <TierCard />

        {/* Stats */}
        <StatsCards
          totalDatabases={dbCount}
          activeConnections={readyCount}
          storageUsed={storageUsed}
          isLoading={isLoading}
        />

        {/* Error state */}
        {isError && (
          <div className="rounded-lg border border-error-subtle bg-surface-1 p-8 text-center space-y-3 animate-fade-in">
            <WifiOff size={28} className="mx-auto text-error-text" />
            <div>
              <p className="text-sm font-medium text-text-primary">
                Could not load databases
              </p>
              <p className="text-xs text-text-muted mt-1">
                {error instanceof Error
                  ? error.message
                  : "Failed to load databases. The API may be unreachable."}
              </p>
            </div>
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-accent-text hover:text-accent-hover hover:bg-accent-subtle transition-colors"
            >
              <RefreshCw size={13} />
              Retry
            </button>
          </div>
        )}

        {/* Loading state */}
        {isLoading && !isError && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="rounded-lg border border-border-subtle bg-surface-1 p-4 animate-pulse space-y-3"
              >
                <div className="flex items-center gap-3">
                  <div className="skeleton w-8 h-8 rounded-md" />
                  <div className="space-y-2 flex-1">
                    <div className="skeleton h-3.5 w-28" />
                    <div className="skeleton h-2.5 w-16" />
                  </div>
                </div>
                <div className="skeleton h-2.5 w-40" />
                <div className="border-t border-border-subtle pt-3 flex justify-between">
                  <div className="skeleton h-2.5 w-14" />
                  <div className="skeleton h-2.5 w-20" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && databases.length === 0 && (
          <div className="rounded-lg border border-border-subtle bg-surface-1 py-12 px-6 text-center space-y-3 animate-fade-in">
            <Database size={36} className="mx-auto text-text-disabled" />
            <div>
              <h2 className="text-sm font-semibold text-text-primary">
                No databases yet
              </h2>
              <p className="text-xs text-text-muted mt-1 max-w-sm mx-auto">
                Create your first database to get started with Vitess-powered
                MySQL on sovereign EU infrastructure.
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-semibold text-white bg-accent hover:bg-accent-hover active:bg-accent-pressed transition-colors"
            >
              <Plus size={14} />
              Create your first database
            </button>
          </div>
        )}

        {/* Database list */}
        {!isLoading && !isError && databases.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                All databases
              </h2>
              <span className="text-[11px] text-text-muted font-mono">
                {totalDatabases} total
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {databases.map((db) => (
                <DatabaseCard
                  key={db.databaseId}
                  database={db}
                  onDelete={handleDelete}
                  onView={handleView}
                  isDeleting={deletingId === db.databaseId}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Create Database Dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => !createMutation.isPending && setShowCreate(false)}
          />

          <div className="relative w-full max-w-full sm:max-w-sm rounded-none sm:rounded-xl border border-border-subtle bg-surface-1 p-5 sm:p-5 shadow-2xl animate-slide-up sm:my-4 min-h-[100dvh] sm:min-h-0 flex flex-col justify-center">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-text-primary">
                New database
              </h2>
              <button
                onClick={() => setShowCreate(false)}
                disabled={createMutation.isPending}
                className="p-2 -mr-2 text-text-muted hover:text-text-primary transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Close dialog"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label
                  htmlFor="db-name"
                  className="block text-xs font-medium text-text-secondary mb-1.5"
                >
                  Database name
                </label>
                <input
                  id="db-name"
                  type="text"
                  value={newDbName}
                  onChange={(e) => setNewDbName(e.target.value)}
                  placeholder="my_database"
                  required
                  disabled={createMutation.isPending}
                  className={cn(
                    "w-full rounded-lg bg-surface-2 border border-border-subtle",
                    "px-3 py-2 text-sm text-text-primary",
                    "placeholder:text-text-disabled",
                    "focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent",
                    "transition-colors",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                />
                <p className="mt-1 text-[11px] text-text-muted">
                  Letters, numbers, and underscores only.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Region
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "nuremberg", label: "Nuremberg" },
                    { value: "helsinki", label: "Helsinki" },
                  ].map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setNewDbRegion(r.value)}
                      disabled={createMutation.isPending}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs transition-colors min-h-[44px]",
                        newDbRegion === r.value
                          ? "border-accent bg-accent-subtle text-accent-text"
                          : "border-border-subtle bg-surface-2 text-text-secondary hover:border-border-default hover:text-text-primary",
                        createMutation.isPending &&
                          "cursor-not-allowed opacity-50",
                      )}
                    >
                      <MapPin size={13} className="shrink-0" />
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={!newDbName.trim() || createMutation.isPending}
                className={cn(
                  "w-full flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold text-white",
                  "bg-accent hover:bg-accent-hover active:bg-accent-pressed",
                  "transition-colors min-h-[44px]",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    <Server size={15} />
                    Create database
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
