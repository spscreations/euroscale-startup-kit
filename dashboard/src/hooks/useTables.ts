import { useQuery } from "@connectrpc/connect-query";
import { listTables } from "@/lib/proto/euroscale/v1/metadata-MetadataService_connectquery";

/**
 * Fetches tables in a given database visible to the user.
 * Disabled when `userId` or `database` is falsy.
 */
export function useTables(
  params:
    | { userId: string; database: string; page?: number; pageSize?: number }
    | undefined,
) {
  return useQuery(
    listTables,
    params
      ? {
          userId: params.userId,
          database: params.database,
          page: params.page ?? 0,
          pageSize: params.pageSize ?? 50,
        }
      : undefined,
    { enabled: !!params?.userId && !!params?.database },
  );
}
