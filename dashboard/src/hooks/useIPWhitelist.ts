import { useQuery, useMutation } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import {
  getIPWhitelist,
  addIPWhitelistEntry,
  removeIPWhitelistEntry,
} from "@/lib/proto/euroscale/v1/database-DatabaseService_connectquery";

/**
 * Manages the IP whitelist for a database.
 * Returns entries, loading state, and mutation helpers.
 */
export function useIPWhitelist(databaseId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery(
    getIPWhitelist,
    databaseId ? { databaseId } : undefined,
    { enabled: !!databaseId },
  );

  const addMutation = useMutation(addIPWhitelistEntry, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [getIPWhitelist] });
    },
  });

  const removeMutation = useMutation(removeIPWhitelistEntry, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [getIPWhitelist] });
    },
  });

  return {
    entries: query.data?.entries ?? [],
    isLoading: query.isLoading,
    error: query.error,
    addEntry: async (cidr: string, description: string) => {
      await addMutation.mutateAsync({
        databaseId: databaseId ?? "",
        cidr,
        description,
      });
    },
    removeEntry: async (cidr: string) => {
      await removeMutation.mutateAsync({
        databaseId: databaseId ?? "",
        cidr,
      });
    },
    isAdding: addMutation.isPending,
    isRemoving: removeMutation.isPending,
  };
}
