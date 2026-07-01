"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { databaseKeys } from "@/hooks/useDatabases";
import type { Database } from "@/lib/proto/types";

export interface UseDatabaseResult {
  /** The database metadata (null while loading or if missing). */
  database: Database | null;
  /** Whether the initial fetch is in flight. */
  isLoading: boolean;
  /** Whether a background refetch is in flight. */
  isFetching: boolean;
  /** Whether the last fetch errored. */
  isError: boolean;
  /** Error object if the last fetch failed. */
  error: Error | null;
  /** Manually refetch. */
  refetch: () => void;
}

/**
 * Fetch a single database by ID.
 * Disabled when id is falsy.
 */
export function useDatabase(id: string | undefined): UseDatabaseResult {
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery<Database>({
    queryKey: databaseKeys.detail(id!),
    queryFn: async () => {
      const res = await api.getDatabase({ database_id: id! });
      return res.database;
    },
    enabled: !!id,
    staleTime: 30_000,
  });

  return {
    database: data ?? null,
    isLoading,
    isFetching,
    isError,
    error: error as Error | null,
    refetch,
  };
}
