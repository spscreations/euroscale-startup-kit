import { useQuery } from "@tanstack/react-query";

export type MetricPoint = {
  timestamp: number; // unix seconds
  cpuPercent: number;
  diskGb: number;
};

export type GetMetricsResponse = {
  metrics: MetricPoint[];
};

/**
 * Fetches CPU and disk usage metrics for a database from the last 24 hours.
 * Calls the GetMetrics gRPC endpoint through the BFF proxy.
 */
export function useMetrics(databaseId: string | undefined) {
  return useQuery<MetricPoint[]>({
    queryKey: ["metrics", databaseId],
    queryFn: async (): Promise<MetricPoint[]> => {
      if (!databaseId) return [];

      const response = await fetch(
        `/api/grpc/euroscale.v1.DatabaseService/GetMetrics`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ databaseId }),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch metrics: ${response.status}`);
      }

      const data: GetMetricsResponse = await response.json();
      return (data.metrics ?? []).sort(
        (a, b) => a.timestamp - b.timestamp,
      );
    },
    enabled: !!databaseId,
    refetchInterval: 60_000,
  });
}
