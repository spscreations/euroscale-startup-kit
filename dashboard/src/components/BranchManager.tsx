"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { GitBranch, GitBranchPlus, ExternalLink, Trash2, Loader2 } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { useDatabases } from "@/hooks/useDatabases";
import { useCreateDatabase } from "@/hooks/useCreateDatabase";
import { useDeleteDatabase } from "@/hooks/useDeleteDatabase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { connectErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type BranchManagerProps = {
  databaseId: string;
  region: string;
};

function statusBadge(status: string) {
  const normalized = status.toLowerCase();
  switch (normalized) {
    case "ready":
      return { label: "Ready", variant: "default" as const };
    case "creating":
      return { label: "Creating", variant: "secondary" as const };
    default:
      return { label: status, variant: "secondary" as const };
  }
}

export default function BranchManager({ databaseId, region }: BranchManagerProps) {
  const router = useRouter();
  const { session } = useAuth();
  const { data, isLoading, isError, refetch } = useDatabases();
  const createMutation = useCreateDatabase();
  const deleteMutation = useDeleteDatabase();

  const [showCreate, setShowCreate] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const databases = data?.databases ?? [];
  const branches = databases.filter(
    (db) => db.databaseId !== databaseId
  );

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!branchName.trim() || !session?.id) return;

      try {
        await createMutation.mutateAsync({
          name: branchName.trim(),
          engine: "mysql",
          region,
          userId: session.id,
          parentDatabaseId: databaseId,
        });
        toast.success(`Branch "${branchName.trim()}" created`);
        setShowCreate(false);
        setBranchName("");
        refetch();
      } catch (err: unknown) {
        toast.error(connectErrorMessage(err) || "Failed to create branch")
      }
    },
    [branchName, region, session?.id, databaseId, createMutation, refetch]
  );

  const handleDelete = useCallback(
    async (branchId: string, branchName: string) => {
      setDeletingId(branchId);
      try {
        await deleteMutation.mutateAsync({ databaseId: branchId });
        toast.success(`Branch "${branchName}" deleted`);
        refetch();
      } catch (err: unknown) {
        toast.error(connectErrorMessage(err) || "Failed to delete branch")
      }
      setDeletingId(null);
    },
    [deleteMutation, refetch]
  );

  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border-subtle px-5 py-3.5">
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-2">
            <GitBranch size={16} className="text-text-muted" />
            <CardTitle className="text-sm font-semibold">Branches</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          <p className="text-xs text-text-muted text-center py-4">
            Could not load branches.
            <Button
              variant="link"
              size="sm"
              onClick={() => refetch()}
              className="ml-1 text-accent-text p-0 h-auto"
            >
              Retry
            </Button>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border-subtle px-5 py-3.5 flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch size={16} className="text-accent-text" />
          <CardTitle className="text-sm font-semibold">Branches</CardTitle>
          {branches.length > 0 && (
            <Badge variant="secondary" className="text-[11px] font-mono ml-1">
              {branches.length}
            </Badge>
          )}
        </div>
        <Button
          size="xs"
          onClick={() => setShowCreate(true)}
          className="text-white"
        >
          <GitBranchPlus size={12} className="mr-1" />
          New branch
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        {branches.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <GitBranch size={28} className="text-text-disabled mx-auto" />
            <p className="text-xs text-text-muted">
              No branches yet. Create one to test schema changes safely.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {branches.map((db) => {
              const badge = statusBadge(db.status);
              return (
                <div
                  key={db.databaseId}
                  className="flex items-center justify-between px-5 py-3 hover:bg-surface-2/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div>
                      <p className="text-sm font-medium text-text-primary truncate">
                        {db.name}
                      </p>
                      <p className="text-[11px] text-text-muted">
                        {formatDate(db.createdAt)} · {db.region}
                      </p>
                    </div>
                    <Badge
                      variant={badge.variant}
                      className="uppercase tracking-wider text-[11px] shrink-0"
                    >
                      {badge.label === "Ready" && (
                        <span className="w-1.5 h-1.5 rounded-full bg-success mr-1 inline-block" />
                      )}
                      {badge.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() =>
                        router.push(`/dashboard/${db.databaseId}`)
                      }
                      aria-label={`View branch ${db.name}`}
                    >
                      <ExternalLink size={13} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleDelete(db.databaseId, db.name)}
                      disabled={deletingId === db.databaseId}
                      className={cn(deletingId === db.databaseId && "opacity-50")}
                      aria-label={`Delete branch ${db.name}`}
                    >
                      {deletingId === db.databaseId ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Trash2 size={13} className="text-text-muted hover:text-destructive" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Create branch</DialogTitle>
            <DialogDescription>
              Create a new database branched from this one. Region will match
              the parent ({region}).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label
                htmlFor="branch-name"
                className="block text-xs font-medium text-text-secondary mb-1.5"
              >
                Branch name
              </label>
              <Input
                id="branch-name"
                type="text"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="feat/new-feature"
                required
                disabled={createMutation.isPending}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Letters, numbers, and underscores only.
              </p>
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
                disabled={!branchName.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    <GitBranchPlus size={14} />
                    Create branch
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
