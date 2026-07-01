"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { databaseKeys } from "@/hooks/useDatabases";
import type {
  CreateDatabaseRequest,
  CreateDatabaseResponse,
} from "@/lib/proto/types";

export interface UseCreateDatabaseResult {
  /** Trigger database creation. */
  createDatabase: (
    input: Omit<CreateDatabaseRequest, "user_id">
  ) => Promise<CreateDatabaseResponse>;
  /** Whether the mutation is in flight. */
  isPending: boolean;
  /** Whether the last mutation succeeded. */
  isSuccess: boolean;
  /** Whether the last mutation errored. */
  isError: boolean;
  /** Error object if the last mutation failed. */
  error: Error | null;
  /** The response from the last successful mutation. */
  data: CreateDatabaseResponse | undefined;
  /** Reset mutation state. */
  reset: () => void;
}

/**
 * Create a new database.
 * On success, invalidates the databases list so it refetches.
 */
export function useCreateDatabase(): UseCreateDatabaseResult {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation<CreateDatabaseResponse, Error, Omit<CreateDatabaseRequest, "user_id">>({
    mutationFn: (input) =>
      api.createDatabase({
        ...input,
        user_id: session!.user_id,
      }),
    onSuccess: () => {
      // Invalidate the list so the new DB appears
      queryClient.invalidateQueries({ queryKey: databaseKeys.all });
    },
  });

  return {
    createDatabase: mutation.mutateAsync,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    error: mutation.error,
    data: mutation.data,
    reset: mutation.reset,
  };
}
