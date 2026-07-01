import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { RotateCredentialsResponse } from "@/lib/proto/types";

/**
 * Rotates credentials for an existing database, invalidating the old ones.
 * Accepts a `database_id` string and invalidates the database detail query on success.
 */
export function useRotateCredentials() {
  const queryClient = useQueryClient();

  return useMutation<RotateCredentialsResponse, Error, string>({
    mutationFn: (databaseId) => apiClient.rotateCredentials(databaseId),
    onSuccess: (_data, databaseId) => {
      queryClient.invalidateQueries({ queryKey: ["database", databaseId] });
    },
  });
}
