import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { GetDatabaseResponse } from "@/lib/proto/types";

/**
 * Fetches metadata for a single database (no credentials).
 * Disabled when `databaseId` is falsy.
 */
export function useDatabase(databaseId: string | undefined) {
  return useQuery<GetDatabaseResponse>({
    queryKey: ["database", databaseId],
    queryFn: () => apiClient.getDatabase(databaseId!),
    enabled: !!databaseId,
  });
}
