import { useQuery } from "@connectrpc/connect-query";
import { useAuth } from "@/lib/auth";
import { listDatabases } from "@/lib/proto/euroscale/v1/database-DatabaseService_connectquery";

/**
 * Fetches all databases for the currently authenticated user.
 * Polls every 30 seconds for near-real-time updates.
 */
export function useDatabases() {
  const { session } = useAuth();

  return useQuery(
    listDatabases,
    session?.id ? { userId: session.id } : undefined,
    {
      enabled: !!session?.id,
      refetchInterval: 30_000,
    },
  );
}
