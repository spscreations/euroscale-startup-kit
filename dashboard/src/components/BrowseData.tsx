"use client";

import { useState, useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  Database,
  Table,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRightIcon,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSchemaDatabases } from "@/hooks/useSchemaDatabases";
import { useTables } from "@/hooks/useTables";
import { useColumns } from "@/hooks/useColumns";
import { usePreviewTable } from "@/hooks/usePreviewTable";

interface BrowseDataProps {
  userId: string;
}

type PageSize = 10 | 25 | 50;
const PAGE_SIZE_OPTIONS: PageSize[] = [10, 25, 50];

// ── Reusable Skeleton ────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-md bg-surface-2", className)} />
  );
}

// ── Inline Table Detail (columns + preview) ──────────────────────────────────

function TableDetail({
  userId,
  database,
  table,
}: {
  userId: string;
  database: string;
  table: string;
}) {
  const {
    data: columnsData,
    isLoading: columnsLoading,
    error: columnsError,
  } = useColumns({ userId, database, table });

  const {
    data: previewData,
    isLoading: previewLoading,
    error: previewError,
  } = usePreviewTable({ userId, database, table, limit: 10 });

  const isLoading = columnsLoading || previewLoading;
  const error = columnsError || previewError;

  return (
    <div className="mt-2 border-t border-border-subtle pt-3">
      {/* Columns section */}
      <div className="mb-4">
        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
          Columns
        </h4>
        {columnsLoading ? (
          <div className="space-y-1.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : columnsError ? (
          <div className="flex items-center gap-2 text-sm text-error-text bg-error-subtle rounded-md px-3 py-2">
            <AlertCircle size={14} />
            Failed to load columns
          </div>
        ) : !columnsData?.columns?.length ? (
          <p className="text-xs text-text-muted">No columns found.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border-subtle">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-2">
                  <th className="text-left px-3 py-1.5 font-medium text-text-secondary">
                    Name
                  </th>
                  <th className="text-left px-3 py-1.5 font-medium text-text-secondary">
                    Type
                  </th>
                  <th className="text-left px-3 py-1.5 font-medium text-text-secondary">
                    Nullable
                  </th>
                  <th className="text-left px-3 py-1.5 font-medium text-text-secondary">
                    Key
                  </th>
                  <th className="text-left px-3 py-1.5 font-medium text-text-secondary">
                    Default
                  </th>
                  <th className="text-left px-3 py-1.5 font-medium text-text-secondary">
                    Extra
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {columnsData.columns.map((col) => (
                  <tr
                    key={col.name}
                    className="hover:bg-surface-2/50 transition-colors"
                  >
                    <td className="px-3 py-1.5 font-mono text-text-primary">
                      {col.name}
                    </td>
                    <td className="px-3 py-1.5 text-text-secondary">
                      {col.dataType}
                    </td>
                    <td className="px-3 py-1.5 text-text-muted">
                      {col.isNullable}
                    </td>
                    <td className="px-3 py-1.5">
                      {col.columnKey ? (
                        <span className="inline-flex items-center rounded-full bg-accent-subtle px-1.5 py-px text-[10px] font-medium text-accent-text">
                          {col.columnKey}
                        </span>
                      ) : (
                        <span className="text-text-disabled">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-text-muted font-mono text-[11px] max-w-[120px] truncate">
                      {col.columnDefault || (
                        <span className="text-text-disabled italic">
                          NULL
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-text-muted">
                      {col.extra || (
                        <span className="text-text-disabled">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Preview section */}
      <div>
        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
          Preview (first 10 rows)
        </h4>
        {previewLoading ? (
          <div className="space-y-1.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : previewError ? (
          <div className="flex items-center gap-2 text-sm text-error-text bg-error-subtle rounded-md px-3 py-2">
            <AlertCircle size={14} />
            Failed to load preview
          </div>
        ) : !previewData?.rows?.length ? (
          <p className="text-xs text-text-muted">
            Table is empty or no rows returned.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border-subtle">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-2">
                  {previewData.columns.map((col) => (
                    <th
                      key={col}
                      className="text-left px-3 py-1.5 font-mono font-medium text-text-secondary whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {previewData.rows.map((row, ri) => (
                  <tr
                    key={ri}
                    className="hover:bg-surface-2/50 transition-colors"
                  >
                    {row.values.map((val, ci) => (
                      <td
                        key={ci}
                        className="px-3 py-1.5 text-text-primary font-mono text-[11px] max-w-[200px] truncate"
                        title={val}
                      >
                        {val === "" ? (
                          <span className="text-text-disabled italic">
                            (empty)
                          </span>
                        ) : val === null ? (
                          <span className="text-text-disabled italic">
                            NULL
                          </span>
                        ) : (
                          val
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {previewData?.approximateTotal !== undefined && (
          <p className="text-[10px] text-text-muted mt-1.5">
            ~{previewData.approximateTotal.toString()} total rows in table
          </p>
        )}
      </div>

      {error && !isLoading && (
        <div className="flex items-center gap-2 text-sm text-error-text bg-error-subtle rounded-md px-3 py-2 mt-3">
          <AlertCircle size={14} />
          Failed to load table detail
        </div>
      )}
    </div>
  );
}

// ── Pagination Bar ───────────────────────────────────────────────────────────

function PaginationBar({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2 py-2">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 0}
        className={cn(
          "flex items-center justify-center w-7 h-7 rounded-md transition-colors",
          page <= 0
            ? "text-text-disabled cursor-not-allowed"
            : "text-text-secondary hover:text-text-primary hover:bg-surface-2",
        )}
        aria-label="Previous page"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="text-xs text-text-muted tabular-nums min-w-[60px] text-center">
        {page + 1} / {totalPages}
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages - 1}
        className={cn(
          "flex items-center justify-center w-7 h-7 rounded-md transition-colors",
          page >= totalPages - 1
            ? "text-text-disabled cursor-not-allowed"
            : "text-text-secondary hover:text-text-primary hover:bg-surface-2",
        )}
        aria-label="Next page"
      >
        <ChevronRightIcon size={16} />
      </button>
    </div>
  );
}

// ── Page Size Selector ───────────────────────────────────────────────────────

function PageSizeSelector({
  value,
  onChange,
}: {
  value: PageSize;
  onChange: (size: PageSize) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value) as PageSize)}
      className="text-xs rounded-md border border-border-subtle bg-surface-1 text-text-secondary px-2 py-1 focus:outline-none focus:border-accent hover:border-border-default transition-colors cursor-pointer"
    >
      {PAGE_SIZE_OPTIONS.map((size) => (
        <option key={size} value={size}>
          {size} per page
        </option>
      ))}
    </select>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function BrowseData({ userId }: BrowseDataProps) {
  // Database-level state
  const [dbPage, setDbPage] = useState(0);
  const [dbPageSize, setDbPageSize] = useState<PageSize>(25);
  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(new Set());
  const [selectedTable, setSelectedTable] = useState<{
    database: string;
    table: string;
  } | null>(null);

  // Per-database table page state
  const [tablePages, setTablePages] = useState<Record<string, number>>({});

  // Fetch databases
  const {
    data: dbData,
    isLoading: dbLoading,
    error: dbError,
    refetch: refetchDbs,
  } = useSchemaDatabases({ userId, page: dbPage, pageSize: dbPageSize });

  const databases = dbData?.databases ?? [];
  const dbTotal = dbData?.total ?? 0;
  const totalDbPages = Math.max(1, Math.ceil(dbTotal / dbPageSize));

  // Handlers
  const toggleDb = useCallback((db: string) => {
    setExpandedDbs((prev) => {
      const next = new Set(prev);
      if (next.has(db)) {
        next.delete(db);
        // Clear selected table if it was in this database
        setSelectedTable((cur) =>
          cur?.database === db ? null : cur,
        );
      } else {
        next.add(db);
      }
      return next;
    });
  }, []);

  const handleSelectTable = useCallback(
    (database: string, table: string) => {
      setSelectedTable((prev) =>
        prev?.database === database && prev?.table === table
          ? null
          : { database, table },
      );
    },
    [],
  );

  const setTablePage = useCallback((db: string, page: number) => {
    setTablePages((prev) => ({ ...prev, [db]: page }));
  }, []);

  const handleDbPageChange = useCallback((page: number) => {
    setDbPage(page);
    // Close all expanded databases and reset selections on page change
    setExpandedDbs(new Set());
    setSelectedTable(null);
    setTablePages({});
  }, []);

  // Guard: no userId
  if (!userId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-text-muted">
          Sign in to browse databases.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 md:py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">
            Browse Data
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Explore databases, tables, and preview data through vtgate.
          </p>
        </div>
        <PageSizeSelector value={dbPageSize} onChange={setDbPageSize} />
      </div>

      {/* Loading state */}
      {dbLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-border-subtle bg-surface-1 p-4"
            >
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-32 mt-2" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {dbError && !dbLoading && (
        <div className="rounded-lg border border-error-subtle bg-error-subtle/10 p-6 text-center">
          <AlertCircle
            size={32}
            className="mx-auto mb-3 text-error-text"
          />
          <p className="text-sm font-medium text-error-text mb-1">
            Failed to load databases
          </p>
          <p className="text-xs text-text-muted mb-3">
            {dbError?.message ?? "An unexpected error occurred."}
          </p>
          <button
            onClick={() => refetchDbs()}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover transition-colors"
          >
            <Loader2 size={12} className="animate-spin hidden" />
            Try again
          </button>
        </div>
      )}

      {/* Empty state */}
      {!dbLoading && !dbError && databases.length === 0 && (
        <div className="rounded-lg border border-border-subtle bg-surface-1 p-8 text-center">
          <Database
            size={32}
            className="mx-auto mb-3 text-text-disabled"
          />
          <p className="text-sm font-medium text-text-secondary mb-1">
            No databases found
          </p>
          <p className="text-xs text-text-muted">
            No databases are accessible through vtgate for this user.
          </p>
        </div>
      )}

      {/* Database list */}
      {!dbLoading && !dbError && databases.length > 0 && (
        <>
          {/* Database pagination top */}
          {totalDbPages > 1 && (
            <PaginationBar
              page={dbPage}
              totalPages={totalDbPages}
              onPageChange={handleDbPageChange}
            />
          )}

          <div className="space-y-2">
            {databases.map((db) => {
              const isExpanded = expandedDbs.has(db);
              const tablePage = tablePages[db] ?? 0;

              return (
                <div
                  key={db}
                  className="rounded-lg border border-border-subtle bg-surface-1 overflow-hidden"
                >
                  {/* Database header (accordion trigger) */}
                  <button
                    onClick={() => toggleDb(db)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/50 transition-colors"
                  >
                    <span className="text-text-muted shrink-0">
                      {isExpanded ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                    </span>
                    <Database size={16} className="text-accent-text shrink-0" />
                    <span className="text-sm font-medium text-text-primary truncate">
                      {db}
                    </span>
                  </button>

                  {/* Expanded tables panel */}
                  {isExpanded && (
                    <TablesPanel
                      userId={userId}
                      database={db}
                      tablePage={tablePage}
                      onTablePageChange={(p) => setTablePage(db, p)}
                      selectedTable={selectedTable}
                      onSelectTable={handleSelectTable}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Database pagination bottom */}
          {totalDbPages > 1 && (
            <div className="mt-3">
              <PaginationBar
                page={dbPage}
                totalPages={totalDbPages}
                onPageChange={handleDbPageChange}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Tables Panel (rendered inside an expanded database) ──────────────────────

function TablesPanel({
  userId,
  database,
  tablePage,
  onTablePageChange,
  selectedTable,
  onSelectTable,
}: {
  userId: string;
  database: string;
  tablePage: number;
  onTablePageChange: (page: number) => void;
  selectedTable: { database: string; table: string } | null;
  onSelectTable: (database: string, table: string) => void;
}) {
  const [tablePageSize] = useState<PageSize>(25);

  const {
    data: tablesData,
    isLoading: tablesLoading,
    error: tablesError,
    refetch: refetchTables,
  } = useTables({
    userId,
    database,
    page: tablePage,
    pageSize: tablePageSize,
  });

  const tables = tablesData?.tables ?? [];
  const tablesTotal = tablesData?.total ?? 0;
  const totalTablePages = Math.max(
    1,
    Math.ceil(tablesTotal / tablePageSize),
  );

  return (
    <div className="border-t border-border-subtle bg-surface-2/30 px-4 py-3">
      {/* Loading */}
      {tablesLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {tablesError && !tablesLoading && (
        <div className="flex items-center gap-2 text-sm text-error-text bg-error-subtle rounded-md px-3 py-2">
          <AlertCircle size={14} />
          <span>Failed to load tables</span>
          <button
            onClick={() => refetchTables()}
            className="ml-auto text-xs underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty */}
      {!tablesLoading && !tablesError && tables.length === 0 && (
        <div className="py-4 text-center">
          <Table size={20} className="mx-auto mb-1.5 text-text-disabled" />
          <p className="text-xs text-text-muted">
            No tables found in this database.
          </p>
        </div>
      )}

      {/* Table list */}
      {!tablesLoading && !tablesError && tables.length > 0 && (
        <>
          {totalTablePages > 1 && (
            <PaginationBar
              page={tablePage}
              totalPages={totalTablePages}
              onPageChange={onTablePageChange}
            />
          )}

          <div className="space-y-1">
            {tables.map((table) => {
              const isSelected =
                selectedTable?.database === database &&
                selectedTable?.table === table;

              return (
                <div key={table}>
                  <button
                    onClick={() => onSelectTable(database, table)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors",
                      isSelected
                        ? "bg-accent-subtle text-accent-text"
                        : "text-text-secondary hover:text-text-primary hover:bg-surface-2",
                    )}
                  >
                    <Table size={14} className="shrink-0" />
                    <span className="text-sm font-mono truncate">
                      {table}
                    </span>
                    {isSelected && (
                      <Search size={12} className="ml-auto shrink-0" />
                    )}
                  </button>

                  {/* Selected table detail */}
                  {isSelected && (
                    <div className="ml-7 mr-1 mb-2 rounded-md border border-border-subtle bg-surface-1 px-3 py-3">
                      <TableDetail
                        userId={userId}
                        database={database}
                        table={table}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {totalTablePages > 1 && (
            <div className="mt-2">
              <PaginationBar
                page={tablePage}
                totalPages={totalTablePages}
                onPageChange={onTablePageChange}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
