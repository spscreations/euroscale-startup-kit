import { useQuery } from "@connectrpc/connect-query";
import { useAuth } from "@/lib/auth";
import { getUsage } from "@/lib/proto/euroscale/v1/database-DatabaseService_connectquery";

/**
 * Fetches tier, limits, and current usage for the authenticated user.
 * Polls every 60 seconds.
 */
export function useUsage() {
  const { session } = useAuth();

  const result = useQuery(
    getUsage,
    session?.id ? { userId: session.id } : undefined,
    {
      enabled: !!session?.id,
      refetchInterval: 60_000,
    },
  );

  // Re-export refetch so callers can force-refresh after payment redirects
  return { ...result, refetch: result.refetch };
}
