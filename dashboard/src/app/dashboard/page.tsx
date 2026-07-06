"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  RefreshCw,
  Loader2,
  Database,
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
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

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

  // Delete confirmation dialog state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    databaseId: string;
    name: string;
  } | null>(null);

  const handleDeleteRequest = useCallback(
    (databaseId: string) => {
      const db = databases.find((d) => d.databaseId === databaseId);
      const name = db?.name ?? databaseId;
      setDeleteConfirm({ databaseId, name });
    },
    [databases],
  );

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteConfirm) return;
    const { databaseId } = deleteConfirm;
    setDeletingId(databaseId);
    deleteMutation.mutate(
      { databaseId },
      {
        onSuccess: () => {
          toast.success(`Database "${deleteConfirm.name}" deleted`);
          setDeletingId(null);
          setDeleteConfirm(null);
        },
        onError: (err: Error) => {
          toast.error(err.message || "Failed to delete database");
          setDeletingId(null);
          setDeleteConfirm(null);
        },
      },
    );
  }, [deleteConfirm, deleteMutation]);

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
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
              className="text-text-secondary hover:text-text-primary"
              aria-label="Refresh databases"
            >
              <RefreshCw
                size={13}
                className={cn(isLoading && "animate-spin")}
              />
              Refresh
            </Button>

            <Button
              size="sm"
              onClick={() => setShowCreate(true)}
              className="text-white"
            >
              <Plus size={14} />
              New database
            </Button>
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
            <Button
              variant="link"
              size="sm"
              onClick={() => refetch()}
              className="text-accent-text hover:text-accent-hover"
            >
              <RefreshCw size={13} />
              Retry
            </Button>
          </div>
        )}

        {/* Loading state */}
        {isLoading && !isError && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="rounded-lg border border-border-subtle bg-surface-1 p-4 space-y-3"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="w-8 h-8 rounded-md" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-2.5 w-16" />
                  </div>
                </div>
                <Skeleton className="h-2.5 w-40" />
                <div className="border-t border-border-subtle pt-3 flex justify-between">
                  <Skeleton className="h-2.5 w-14" />
                  <Skeleton className="h-2.5 w-20" />
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
            <Button
              size="sm"
              onClick={() => setShowCreate(true)}
              className="text-white"
            >
              <Plus size={14} />
              Create your first database
            </Button>
          </div>
        )}

        {/* Database list */}
        {!isLoading && !isError && databases.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                All databases
              </h2>
              <Badge variant="outline" className="text-[11px] font-mono">
                {totalDatabases} total
              </Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {databases.map((db) => (
                <DatabaseCard
                  key={db.databaseId}
                  database={db}
                  onDelete={handleDeleteRequest}
                  onView={handleView}
                  isDeleting={deletingId === db.databaseId}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Create Database Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>New database</DialogTitle>
            <DialogDescription>
              Create a Vitess-powered MySQL database on sovereign EU
              infrastructure.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label
                htmlFor="db-name"
                className="block text-xs font-medium text-text-secondary mb-1.5"
              >
                Database name
              </label>
              <Input
                id="db-name"
                type="text"
                value={newDbName}
                onChange={(e) => setNewDbName(e.target.value)}
                placeholder="my_database"
                required
                disabled={createMutation.isPending}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
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

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowCreate(false)}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!newDbName.trim() || createMutation.isPending}
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
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirm(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete database</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteConfirm?.name}
              &rdquo;? This action cannot be undone. All data in this database
              will be permanently lost.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteConfirm(null)}
              disabled={deletingId !== null}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteConfirm}
              disabled={deletingId !== null}
            >
              {deletingId === deleteConfirm?.databaseId ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
