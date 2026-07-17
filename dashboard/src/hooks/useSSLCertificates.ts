import { useQuery } from "@connectrpc/connect-query";
import { getSSLCertificates } from "@/lib/proto/euroscale/v1/database-DatabaseService_connectquery";

/**
 * Fetches SSL client certificates for a database.
 * Returns caCert, clientCert, and clientKey PEM strings.
 * Disabled when `databaseId` is falsy.
 */
export function useSSLCertificates(databaseId: string | undefined) {
  return useQuery(
    getSSLCertificates,
    databaseId ? { databaseId } : undefined,
    { enabled: !!databaseId },
  );
}
