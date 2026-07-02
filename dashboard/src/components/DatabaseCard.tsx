"use client";

import { useState, useCallback } from "react";
import {
  Server,
  MapPin,
  CalendarDays,
  ExternalLink,
  Trash2,
  Loader2,
  MoreHorizontal,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import type { Database } from "@/lib/proto/euroscale/v1/database_pb";

interface DatabaseCardProps {
  database: Database;
  onDelete: (databaseId: string) => void;
  onView: (databaseId: string) => void;
  isDeleting?: boolean;
}

const statusConfig: Record<
  string,
  { label: string; dot: string; bg: string; text: string }
> = {
  creating: {
    label: "Creating",
    dot: "bg-warning",
    bg: "bg-warning-subtle",
    text: "text-warning-text",
  },
  ready: {
    label: "Ready",
    dot: "bg-success",
    bg: "bg-success-subtle",
    text: "text-success-text",
  },
  deleting: {
    label: "Deleting",
    dot: "bg-warning",
    bg: "bg-warning-subtle",
    text: "text-warning-text",
  },
  deleted: {
    label: "Deleted",
    dot: "bg-text-disabled",
    bg: "bg-surface-3",
    text: "text-text-disabled",
  },
  error: {
    label: "Error",
    dot: "bg-error",
    bg: "bg-error-subtle",
    text: "text-error-text",
  },
};

function getStatusCfg(status: string | undefined) {
  return (
    statusConfig[status ?? ""] ?? {
      label: status ?? "Unknown",
      dot: "bg-text-disabled",
      bg: "bg-surface-3",
      text: "text-text-disabled",
    }
  );
}

const regionLabels: Record<string, string> = {
  nuremberg: "Nuremberg, EU",
  helsinki: "Helsinki, FI",
};

function getRegionLabel(region: string | undefined) {
  return regionLabels[region ?? ""] ?? region ?? "—";
}

export default function DatabaseCard({
  database,
  onDelete,
  onView,
  isDeleting,
}: DatabaseCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const status = getStatusCfg(database.status);

  const handleDelete = useCallback(() => {
    setMenuOpen(false);
    onDelete(database.databaseId);
  }, [database.databaseId, onDelete]);

  const handleView = useCallback(() => {
    setMenuOpen(false);
    onView(database.databaseId);
  }, [database.databaseId, onView]);

  return (
    <div
      className={cn(
        "rounded-lg border border-border-subtle bg-surface-1 hover:border-border-default transition-colors",
        "group relative",
      )}
    >
      {/* Top row: icon + name + status + menu */}
      <div className="flex items-start justify-between p-4 pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-md shrink-0",
              status.bg,
            )}
          >
            <Server size={16} className={cn(status.text)} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-text-primary truncate">
                {database.name}
              </h3>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-px text-[10px] font-medium uppercase tracking-wider shrink-0",
                  status.bg,
                  status.text,
                )}
              >
                <span
                  className={cn(
                    "inline-block h-1.5 w-1.5 rounded-full",
                    status.dot,
                  )}
                />
                {status.label}
              </span>
            </div>
          </div>
        </div>

        {/* Action menu */}
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            disabled={isDeleting}
            className={cn(
              "flex items-center justify-center w-7 h-7 rounded-md",
              "text-text-muted hover:text-text-primary hover:bg-surface-2",
              "transition-colors opacity-0 group-hover:opacity-100",
              isDeleting && "opacity-50 cursor-not-allowed",
            )}
            aria-label="Database actions"
          >
            <MoreHorizontal size={15} />
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 z-20 w-40 rounded-lg border border-border-subtle bg-surface-2 shadow-xl py-1 animate-fade-in">
                <button
                  onClick={handleView}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-surface-3 hover:text-text-primary transition-colors"
                >
                  <ExternalLink size={14} />
                  View details
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors",
                    "text-error-text hover:bg-error-subtle",
                    isDeleting && "opacity-50 cursor-not-allowed",
                  )}
                >
                  {isDeleting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  {isDeleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-3 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1">
          <MapPin size={12} className="shrink-0" />
          {getRegionLabel(database.region)}
        </span>
        <span className="inline-flex items-center gap-1">
          <CalendarDays size={12} className="shrink-0" />
          {database.createdAt ? formatDate(database.createdAt) : "—"}
        </span>
      </div>

      {/* Bottom bar */}
      <div className="px-4 py-2.5 border-t border-border-subtle flex items-center justify-between">
        <span className="text-[11px] font-mono text-text-muted tracking-tight uppercase">
          {database.engine?.toUpperCase() ?? "MYSQL"}
        </span>
        <button
          onClick={handleView}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-accent-text hover:text-accent-hover hover:bg-accent-subtle transition-colors"
        >
          View details
          <ExternalLink size={11} />
        </button>
      </div>
    </div>
  );
}
