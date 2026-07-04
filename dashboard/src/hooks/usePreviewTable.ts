import { useQuery } from "@connectrpc/connect-query";
import { previewTable } from "@/lib/proto/euroscale/v1/metadata-MetadataService_connectquery";

/**
 * Fetches the first N rows of a table for quick inspection.
 * Disabled when `userId`, `database`, or `table` is falsy.
 */
export function usePreviewTable(
  params:
    | {
        userId: string;
        database: string;
        table: string;
        limit?: number;
      }
    | undefined,
) {
  return useQuery(
    previewTable,
    params
      ? {
          userId: params.userId,
          database: params.database,
          table: params.table,
          limit: params.limit ?? 10,
        }
      : undefined,
    { enabled: !!params?.userId && !!params?.database && !!params?.table },
  );
}
