import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ListDatabasesResponse } from "@/lib/proto/types";

/**
 * Fetches all databases for the currently authenticated user.
 * Polls every 30 seconds for near-real-time updates.
 */
export function useDatabases() {
  const { user } = useAuth();

  return useQuery<ListDatabasesResponse>({
    queryKey: ["databases", user?.id],
    queryFn: () => apiClient.listDatabases({ user_id: user!.id }),
    enabled: !!user?.id,
    refetchInterval: 30_000, // poll every 30s
  });
}
