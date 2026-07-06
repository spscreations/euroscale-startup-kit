"use client";

import { useCallback } from "react";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
  CardAction,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

interface DatabaseCardProps {
  database: Database;
  onDelete: (databaseId: string) => void;
  onView: (databaseId: string) => void;
  isDeleting?: boolean;
}

const statusConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  creating: {
    label: "Creating",
    variant: "secondary",
  },
  ready: {
    label: "Ready",
    variant: "default",
  },
  deleting: {
    label: "Deleting",
    variant: "secondary",
  },
  deleted: {
    label: "Deleted",
    variant: "outline",
  },
  error: {
    label: "Error",
    variant: "destructive",
  },
};

function getStatusCfg(status: string | undefined) {
  return (
    statusConfig[status ?? ""] ?? {
      label: status ?? "Unknown",
      variant: "outline" as const,
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
  const status = getStatusCfg(database.status);

  const handleDelete = useCallback(() => {
    onDelete(database.databaseId);
  }, [database.databaseId, onDelete]);

  const handleView = useCallback(() => {
    onView(database.databaseId);
  }, [database.databaseId, onView]);

  return (
    <Card className="group hover:border-border-default transition-colors">
      {/* Top row: icon + name + status + menu */}
      <CardHeader className="flex-row items-start justify-between gap-2 pb-1">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-md shrink-0",
              status.variant === "default" && "bg-success-subtle text-success-text",
              status.variant === "secondary" && "bg-warning-subtle text-warning-text",
              status.variant === "destructive" && "bg-error-subtle text-error-text",
              status.variant === "outline" && "bg-surface-3 text-text-disabled",
            )}
          >
            <Server size={16} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold text-text-primary truncate">
                {database.name}
              </CardTitle>
              <Badge variant={status.variant} className="text-[10px] uppercase tracking-wider">
                {status.label}
              </Badge>
            </div>
          </div>
        </div>

        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger
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
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4}>
              <DropdownMenuItem onClick={handleView}>
                <ExternalLink size={14} />
                View details
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
                {isDeleting ? "Deleting…" : "Delete"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>

      {/* Metadata row */}
      <CardContent className="pb-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
          <span className="inline-flex items-center gap-1">
            <MapPin size={12} className="shrink-0" />
            {getRegionLabel(database.region)}
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays size={12} className="shrink-0" />
            {database.createdAt ? formatDate(database.createdAt) : "—"}
          </span>
        </div>
      </CardContent>

      {/* Bottom bar */}
      <CardFooter>
        <span className="text-[11px] font-mono text-text-muted tracking-tight uppercase">
          {database.engine?.toUpperCase() ?? "MYSQL"}
        </span>
        <Button
          variant="ghost"
          size="xs"
          onClick={handleView}
          className="text-accent-text hover:text-accent-hover ml-auto"
        >
          View details
          <ExternalLink size={11} />
        </Button>
      </CardFooter>
    </Card>
  );
}
