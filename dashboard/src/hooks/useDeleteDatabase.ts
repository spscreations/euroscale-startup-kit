import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { DeleteDatabaseResponse } from "@/lib/proto/types";

/**
 * Drops a database and removes all associated credentials.
 * Accepts a `database_id` string and invalidates the databases list on success.
 */
export function useDeleteDatabase() {
  const queryClient = useQueryClient();

  return useMutation<DeleteDatabaseResponse, Error, string>({
    mutationFn: (databaseId) => apiClient.deleteDatabase(databaseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["databases"] });
    },
  });
}
