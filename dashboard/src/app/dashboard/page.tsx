"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  RefreshCw,
  Loader2,
  AlertTriangle,
  DatabaseIcon,
  X,
  Server,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import AuthGuard from "@/components/AuthGuard";
import StatsCards from "@/components/StatsCards";
import DatabaseCard from "@/components/DatabaseCard";
import { useDatabases } from "@/hooks/useDatabases";
import { useDeleteDatabase } from "@/hooks/useDeleteDatabase";
import { useCreateDatabase } from "@/hooks/useCreateDatabase";
import { useAuth } from "@/lib/auth";
import toast from "react-hot-toast";

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
  const deleteMutation = useDeleteDatabase();
  const createMutation = useCreateDatabase();

  const databases = data?.databases ?? [];
  const totalDatabases = data?.total ?? databases.length;
  const readyCount = databases.filter((db) => db.status === "ready").length;

  // Delete handler with confirmation
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

  // Create database dialog
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
    <div className="min-h-screen bg-navy-900">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-glass-border bg-navy-900/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold tracking-tight">
                <span className="gradient-text">EuroScale</span>
              </h1>
              <span className="hidden sm:inline-flex items-center rounded-full bg-navy-700 px-3 py-0.5 text-xs font-medium text-text-muted">
                Dashboard
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => refetch()}
                disabled={isLoading}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium",
                  "text-text-secondary hover:text-text-primary hover:bg-navy-700",
                  "transition-all duration-150 border border-glass-border",
                  isLoading && "opacity-50 cursor-not-allowed",
                )}
                aria-label="Refresh databases"
              >
                <RefreshCw
                  size={15}
                  className={cn(isLoading && "animate-spin")}
                />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              <button
                onClick={() => setShowCreate(true)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white",
                  "bg-gradient-to-r from-purple-500 to-purple-400",
                  "hover:from-purple-400 hover:to-purple-300",
                  "transition-all duration-150 shadow-lg shadow-purple-500/20",
                )}
              >
                <Plus size={16} />
                <span className="hidden sm:inline">New Database</span>
                <span className="sm:hidden">New</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fade">
        {/* Stats cards */}
        <StatsCards
          totalDatabases={totalDatabases}
          activeConnections={readyCount}
          storageUsed={databases.length > 0 ? `${databases.length * 256} MB` : "—"}
          isLoading={isLoading}
        />

        {/* Error state */}
        {isError && (
          <div className="glass-card rounded-xl p-8 text-center space-y-3 animate-fade">
            <AlertTriangle
              size={32}
              className="mx-auto text-gold-400"
            />
            <p className="text-text-secondary text-sm">
              {error instanceof Error
                ? error.message
                : "Failed to load databases. Please try again."}
            </p>
            <button
              onClick={() => refetch()}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium",
                "text-purple-400 hover:text-purple-300 hover:bg-purple-500/10",
                "transition-all duration-150",
              )}
            >
              <RefreshCw size={15} />
              Retry
            </button>
          </div>
        )}

        {/* Loading state */}
        {isLoading && !isError && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="glass-card rounded-xl p-5 animate-pulse space-y-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-navy-600" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 w-32 rounded bg-navy-600" />
                    <div className="h-3 w-20 rounded bg-navy-600" />
                  </div>
                </div>
                <div className="h-3 w-48 rounded bg-navy-600" />
                <div className="h-px bg-navy-600" />
                <div className="flex justify-between">
                  <div className="h-3 w-16 rounded bg-navy-600" />
                  <div className="h-3 w-24 rounded bg-navy-600" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && databases.length === 0 && (
          <div className="glass-card rounded-xl p-12 text-center space-y-4 animate-slide-up">
            <DatabaseIcon
              size={48}
              className="mx-auto text-text-muted"
            />
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                No databases yet
              </h2>
              <p className="text-sm text-text-muted mt-1 max-w-md mx-auto">
                Create your first database to get started with
                Vitess-powered MySQL on sovereign EU
                infrastructure.
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-semibold text-white",
                "bg-gradient-to-r from-purple-500 to-purple-400",
                "hover:from-purple-400 hover:to-purple-300",
                "transition-all duration-150 shadow-lg shadow-purple-500/20",
              )}
            >
              <Plus size={16} />
              Create your first database
            </button>
          </div>
        )}

        {/* Database list */}
        {!isLoading && !isError && databases.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">
                Databases
              </h2>
              <span className="text-xs text-text-muted font-mono">
                {totalDatabases} total
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-navy-900/70 backdrop-blur-sm"
            onClick={() => !createMutation.isPending && setShowCreate(false)}
          />

          {/* Dialog */}
          <div className="relative w-full max-w-md glass-card rounded-xl p-6 md:p-8 animate-slide-up shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-text-primary">
                New Database
              </h2>
              <button
                onClick={() => setShowCreate(false)}
                disabled={createMutation.isPending}
                className="text-text-muted hover:text-text-primary transition-colors"
                aria-label="Close dialog"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-5">
              <div>
                <label
                  htmlFor="db-name"
                  className="block text-sm font-medium text-text-secondary mb-1.5"
                >
                  Database name
                </label>
                <input
                  id="db-name"
                  type="text"
                  value={newDbName}
                  onChange={(e) => setNewDbName(e.target.value)}
                  placeholder="my-database"
                  required
                  disabled={createMutation.isPending}
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
                  Must be a valid MySQL identifier. Lowercase letters,
                  numbers, and hyphens only.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Region
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: "nuremberg", label: "Nuremberg, EU" },
                    { value: "helsinki", label: "Helsinki, FI" },
                  ].map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setNewDbRegion(r.value)}
                      disabled={createMutation.isPending}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-4 py-3 text-sm transition-all duration-150",
                        newDbRegion === r.value
                          ? "border-purple-500/50 bg-purple-500/10 text-purple-300"
                          : "border-glass-border bg-navy-800 text-text-secondary hover:border-purple-500/30 hover:text-text-primary",
                        createMutation.isPending && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <MapPin size={15} className="shrink-0" />
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={!newDbName.trim() || createMutation.isPending}
                className={cn(
                  "w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white",
                  "bg-gradient-to-r from-purple-500 to-purple-400",
                  "hover:from-purple-400 hover:to-purple-300",
                  "transition-all duration-150 shadow-lg shadow-purple-500/20",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    <Server size={16} />
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
