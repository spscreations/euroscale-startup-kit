import { useMutation } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { getDatabase, rotateCredentials } from "@/lib/proto/euroscale/v1/database-DatabaseService_connectquery";

/**
 * Rotates credentials for an existing database, invalidating the old ones.
 * Invalidates the database detail query on success.
 * The mutation input should be `{ databaseId: string }`.
 */
export function useRotateCredentials() {
  const queryClient = useQueryClient();

  return useMutation(rotateCredentials, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [getDatabase] });
    },
  });
}
