"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Database, ListDatabasesResponse } from "@/lib/proto/types";
import { PAGINATION } from "@/lib/constants";

// ── Query Key Factory ──────────────────────────────────────────────────────

export const databaseKeys = {
  /** All databases for the current user. */
  all: ["databases"] as const,
  /** A specific database by ID. */
  detail: (id: string) => ["databases", id] as const,
};

// ── Hook ───────────────────────────────────────────────────────────────────

export interface UseDatabasesResult {
  /** List of databases (empty array while loading or on error). */
  databases: Database[];
  /** Total count of databases for this user. */
  total: number;
  /** Whether the initial fetch is in flight. */
  isLoading: boolean;
  /** Whether a background refetch is in flight. */
  isFetching: boolean;
  /** Whether the last fetch errored. */
  isError: boolean;
  /** Error object if the last fetch failed. */
  error: Error | null;
  /** Token for the next page (empty string if no more). */
  nextPageToken: string;
  /** Manually refetch. */
  refetch: () => void;
}

/**
 * Fetch all databases for the authenticated user.
 * Polls every 30 seconds so newly provisioned DBs appear automatically.
 */
export function useDatabases(): UseDatabasesResult {
  const { session } = useAuth();

  const { data, isLoading, isFetching, isError, error, refetch } =
    useQuery<ListDatabasesResponse>({
      queryKey: databaseKeys.all,
      queryFn: () =>
        api.listDatabases({
          user_id: session!.user_id,
          page_size: PAGINATION.MAX_PAGE_SIZE,
        }),
      enabled: !!session?.user_id,
      refetchInterval: 30_000, // poll every 30s
      staleTime: 30_000,
    });

  return {
    databases: data?.databases ?? [],
    total: data?.total ?? 0,
    isLoading,
    isFetching,
    isError,
    error: error as Error | null,
    nextPageToken: data?.next_page_token ?? "",
    refetch,
  };
}
