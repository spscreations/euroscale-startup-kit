import { useMutation } from "@connectrpc/connect-query";
import { resizeCompute } from "@/lib/proto/euroscale/v1/database-DatabaseService_connectquery";

/**
 * Hook to resize (expand) a database's CPU allocation via the ResizeCompute RPC.
 * Returns a useMutation hook configured with the resizeCompute method.
 *
 * Usage:
 *   const { mutate, isPending } = useResizeCompute();
 *   mutate({ databaseId: "abc", additionalCu: 4 });
 */
export function useResizeCompute() {
  return useMutation(resizeCompute);
}
