import { useMutation } from "@connectrpc/connect-query";
import { setAutoscale } from "@/lib/proto/euroscale/v1/database-DatabaseService_connectquery";

/**
 * Hook to enable/disable autoscale for a database via the SetAutoscale RPC.
 * Returns a useMutation hook configured with the setAutoscale method.
 *
 * Usage:
 *   const { mutate, isPending } = useSetAutoscale();
 *   mutate({ databaseId: "abc", enabled: true, thresholdPercent: 80, incrementPercent: 20 });
 */
export function useSetAutoscale() {
  return useMutation(setAutoscale);
}
