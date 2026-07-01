"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { databaseKeys } from "@/hooks/useDatabases";
import type { DeleteDatabaseResponse } from "@/lib/proto/types";

export interface UseDeleteDatabaseResult {
  /** Delete a database by ID. */
  deleteDatabase: (databaseId: string) => Promise<DeleteDatabaseResponse>;
  /** Whether the mutation is in flight. */
  isPending: boolean;
  /** Whether the last mutation succeeded. */
  isSuccess: boolean;
  /** Whether the last mutation errored. */
  isError: boolean;
  /** Error object if the last mutation failed. */
  error: Error | null;
  /** The response from the last successful mutation. */
  data: DeleteDatabaseResponse | undefined;
  /** Reset mutation state. */
  reset: () => void;
}

/**
 * Delete a database.
 * On success, removes the database from the cache and invalidates the list.
 */
export function useDeleteDatabase(): UseDeleteDatabaseResult {
  const queryClient = useQueryClient();

  const mutation = useMutation<DeleteDatabaseResponse, Error, string>({
    mutationFn: (databaseId) =>
      api.deleteDatabase({ database_id: databaseId }),
    onSuccess: (_data, databaseId) => {
      // Remove the individual DB from cache
      queryClient.removeQueries({
        queryKey: databaseKeys.detail(databaseId),
      });
      // Invalidate the list
      queryClient.invalidateQueries({ queryKey: databaseKeys.all });
    },
  });

  return {
    deleteDatabase: mutation.mutateAsync,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    error: mutation.error,
    data: mutation.data,
    reset: mutation.reset,
  };
}
