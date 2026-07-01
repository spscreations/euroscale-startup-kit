"use client";

import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { RotateCredentialsResponse } from "@/lib/proto/types";

export interface UseRotateCredentialsResult {
  /** Rotate credentials for a given database. Returns new creds ONCE. */
  rotateCredentials: (
    databaseId: string
  ) => Promise<RotateCredentialsResponse>;
  /** Whether the mutation is in flight. */
  isPending: boolean;
  /** Whether the last mutation succeeded. */
  isSuccess: boolean;
  /** Whether the last mutation errored. */
  isError: boolean;
  /** Error object if the last mutation failed. */
  error: Error | null;
  /** The response from the last successful mutation (contains one-time credentials). */
  data: RotateCredentialsResponse | undefined;
  /** Reset mutation state. */
  reset: () => void;
}

/**
 * Rotate database credentials.
 * Returns new username, password, and connection string ONCE.
 * Does not invalidate the database list since metadata is unchanged.
 */
export function useRotateCredentials(): UseRotateCredentialsResult {
  const mutation = useMutation<RotateCredentialsResponse, Error, string>({
    mutationFn: (databaseId) =>
      api.rotateCredentials({ database_id: databaseId }),
  });

  return {
    rotateCredentials: mutation.mutateAsync,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    error: mutation.error,
    data: mutation.data,
    reset: mutation.reset,
  };
}
