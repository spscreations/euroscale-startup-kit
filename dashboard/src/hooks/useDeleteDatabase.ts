import { useMutation } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { deleteDatabase, listDatabases } from "@/lib/proto/euroscale/v1/database-DatabaseService_connectquery";

/**
 * Drops a database and removes all associated credentials.
 * The mutation input should be `{ databaseId: string }`.
 */
export function useDeleteDatabase() {
  const queryClient = useQueryClient();

  return useMutation(deleteDatabase, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [listDatabases] });
      queryClient.refetchQueries({ queryKey: [listDatabases] });
    },
  });
}
