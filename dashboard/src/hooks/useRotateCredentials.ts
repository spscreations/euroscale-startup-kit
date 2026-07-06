import { useMutation } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { getDatabase, rotateCredentials } from "@/lib/proto/euroscale/v1/database-DatabaseService_connectquery";
import type { RotateCredentialsResponse } from "@/lib/proto/euroscale/v1/database_pb";

/**
 * Rotates credentials for an existing database, invalidating the old ones.
 * Invalidates the database detail query on success.
 *
 * The mutation input should be `{ databaseId: string }`.
 * On success, returns the full `RotateCredentialsResponse` containing
 * `connectionString`, `username`, `password`, `sslCaPem`, `host`, and `port`.
 */
export function useRotateCredentials() {
  const queryClient = useQueryClient();

  return useMutation(rotateCredentials, {
    onSuccess: (data: RotateCredentialsResponse) => {
      queryClient.invalidateQueries({ queryKey: [getDatabase] });
      return data;
    },
  });
}
