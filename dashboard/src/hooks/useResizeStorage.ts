import { useMutation } from "@connectrpc/connect-query";
import { resizeStorage } from "@/lib/proto/euroscale/v1/database-DatabaseService_connectquery";

/**
 * Hook to resize (expand) a database's PVC via the ResizeStorage RPC.
 * Returns a useMutation hook configured with the resizeStorage method.
 *
 * Usage:
 *   const { mutate, isPending } = useResizeStorage();
 *   mutate({ databaseId: "abc", additionalGb: 10 });
 */
export function useResizeStorage() {
  return useMutation(resizeStorage);
}
