import { useQuery } from "@connectrpc/connect-query";
import { listSchemaDatabases } from "@/lib/proto/euroscale/v1/metadata-MetadataService_connectquery";

/**
 * Fetches databases visible to the authenticated user through vtgate.
 * Disabled when `userId` is falsy.
 */
export function useSchemaDatabases(
  params:
    | { userId: string; page?: number; pageSize?: number }
    | undefined,
) {
  return useQuery(
    listSchemaDatabases,
    params
      ? {
          userId: params.userId,
          page: params.page ?? 0,
          pageSize: params.pageSize ?? 25,
        }
      : undefined,
    { enabled: !!params?.userId },
  );
}
