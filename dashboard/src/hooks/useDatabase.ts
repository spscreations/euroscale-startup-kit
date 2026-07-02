import { useQuery } from "@connectrpc/connect-query";
import { getDatabase } from "@/lib/proto/euroscale/v1/database-DatabaseService_connectquery";

/**
 * Fetches metadata for a single database (no credentials).
 * Disabled when `databaseId` is falsy.
 */
export function useDatabase(databaseId: string | undefined) {
  return useQuery(
    getDatabase,
    databaseId ? { databaseId } : undefined,
    { enabled: !!databaseId },
  );
}
