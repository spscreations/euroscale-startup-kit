import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type {
  CreateDatabaseRequest,
  CreateDatabaseResponse,
} from "@/lib/proto/types";

/**
 * Provisions a new Vitess database.
 *
 * The `user_id` is injected automatically from the auth session;
 * callers only need to provide `name`, `engine`, and `region`.
 */
export function useCreateDatabase() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  type CreateInput = Omit<CreateDatabaseRequest, "user_id">;

  return useMutation<CreateDatabaseResponse, Error, CreateInput>({
    mutationFn: (input) =>
      apiClient.createDatabase({ ...input, user_id: user!.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["databases"] });
    },
  });
}
