import { useQuery } from "@connectrpc/connect-query";
import { useAuth } from "@/lib/auth";
import { getUsage } from "@/lib/proto/euroscale/v1/database-DatabaseService_connectquery";

/**
 * Fetches tier, limits, and current usage for the authenticated user.
 * Polls every 60 seconds.
 */
export function useUsage() {
  const { session } = useAuth();

  return useQuery(
    getUsage,
    session?.id ? { userId: session.id } : undefined,
    {
      enabled: !!session?.id,
      refetchInterval: 60_000,
    },
  );
}
