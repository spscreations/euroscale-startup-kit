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
    dot: "bg-gold-400",
    bg: "bg-gold-400/10",
    text: "text-gold-400",
  },
  ready: {
    label: "Ready",
    dot: "bg-green-400",
    bg: "bg-green-400/10",
    text: "text-green-400",
  },
  deleting: {
    label: "Deleting",
    dot: "bg-orange-400",
    bg: "bg-orange-400/10",
    text: "text-orange-400",
  },
  deleted: {
    label: "Deleted",
    dot: "bg-slate-500",
    bg: "bg-slate-500/10",
    text: "text-slate-400",
  },
  error: {
    label: "Error",
    dot: "bg-red-400",
    bg: "bg-red-400/10",
    text: "text-red-400",
  },
};

function getStatusCfg(status: string | undefined) {
  return statusConfig[status ?? ""] ?? {
    label: status ?? "Unknown",
    dot: "bg-slate-500",
    bg: "bg-slate-500/10",
    text: "text-slate-400",
  };
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
        "glass-card rounded-xl p-5 transition-all duration-200",
        "hover:border-purple-500/30 hover:shadow-lg hover:shadow-purple-500/5",
        "group relative",
      )}
    >
      {/* Top row: name + status + menu */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "flex items-center justify-center w-10 h-10 rounded-lg shrink-0",
              status.bg,
            )}
          >
            <Server size={18} className={cn(status.text)} />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text-primary truncate">
              {database.name}
            </h3>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium mt-0.5",
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

        {/* Action menu */}
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            disabled={isDeleting}
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-lg",
              "text-text-muted hover:text-text-primary hover:bg-navy-600",
              "transition-all duration-150",
              isDeleting && "opacity-50 cursor-not-allowed",
            )}
            aria-label="Database actions"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border border-glass-border bg-navy-800 shadow-xl py-1 animate-fade">
                <button
                  onClick={handleView}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-text-secondary hover:bg-navy-600 hover:text-text-primary transition-colors"
                >
                  <ExternalLink size={15} />
                  View details
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-4 py-2.5 text-sm transition-colors",
                    "text-red-400 hover:bg-red-500/10 hover:text-red-300",
                    isDeleting && "opacity-50 cursor-not-allowed",
                  )}
                >
                  {isDeleting ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Trash2 size={15} />
                  )}
                  {isDeleting ? "Deleting…" : "Delete database"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <MapPin size={14} className="shrink-0" />
          {getRegionLabel(database.region)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays size={14} className="shrink-0" />
          {database.createdAt
            ? formatDate(database.createdAt)
            : "—"}
        </span>
      </div>

      {/* Bottom: quick action bar */}
      <div className="mt-4 pt-3 border-t border-glass-border flex items-center justify-between">
        <span className="text-xs font-mono text-text-muted tracking-tight">
          {database.engine?.toUpperCase() ?? "MYSQL"}
        </span>
        <button
          onClick={handleView}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
            "text-purple-400 hover:text-purple-300 hover:bg-purple-500/10",
            "transition-all duration-150",
          )}
        >
          View details
          <ExternalLink size={13} />
        </button>
      </div>
    </div>
  );
}
