import { useMutation } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { createDatabase, listDatabases } from "@/lib/proto/euroscale/v1/database-DatabaseService_connectquery";

/**
 * Provisions a new Vitess database.
 *
 * Callers provide the full `CreateDatabaseRequest` including `userId`.
 * Invalidates the databases list on success.
 */
export function useCreateDatabase() {
  const queryClient = useQueryClient();

  return useMutation(createDatabase, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [listDatabases] });
    },
  });
}
