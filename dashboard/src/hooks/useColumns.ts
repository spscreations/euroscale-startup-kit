import { useQuery } from "@connectrpc/connect-query";
import { listColumns } from "@/lib/proto/euroscale/v1/metadata-MetadataService_connectquery";

/**
 * Fetches column metadata for a table.
 * Disabled when `userId`, `database`, or `table` is falsy.
 */
export function useColumns(
  params:
    | {
        userId: string;
        database: string;
        table: string;
        page?: number;
        pageSize?: number;
      }
    | undefined,
) {
  return useQuery(
    listColumns,
    params
      ? {
          userId: params.userId,
          database: params.database,
          table: params.table,
          page: params.page ?? 0,
          pageSize: params.pageSize ?? 50,
        }
      : undefined,
    { enabled: !!params?.userId && !!params?.database && !!params?.table },
  );
}
