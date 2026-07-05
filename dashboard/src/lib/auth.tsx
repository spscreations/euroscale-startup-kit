"use client";

import { useCallback, useMemo } from "react";
import { authClient } from "@/lib/auth-client";

// ── Session shape ───────────────────────────────────────────────────────────

export interface UserSession {
  id: string;
  email: string;
  name?: string;
}

interface AuthState {
  session: UserSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * Wraps Better Auth's React hooks into the existing `useAuth` API
 * so components don't need to change their call signatures.
 */
export function useAuth(): AuthState {
  const { data, isPending } = authClient.useSession();

  const session: UserSession | null = data
    ? {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name ?? undefined,
      }
    : null;

  const login = useCallback(async (email: string, password: string) => {
    const result = await authClient.signIn.email({ email, password });
    if (result.error) {
      throw new Error(result.error.message ?? "Login failed");
    }
  }, []);

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      const result = await authClient.signUp.email({
        name,
        email,
        password,
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Signup failed");
      }
      // Better Auth signs the user in automatically on successful sign-up,
      // so no separate login call is needed.
    },
    [],
  );

  const logout = useCallback(() => {
    authClient.signOut();
  }, []);

  return useMemo<AuthState>(
    () => ({
      session,
      isLoading: isPending,
      isAuthenticated: !!session,
      login,
      signup,
      logout,
    }),
    [session, isPending, login, signup, logout],
  );
}

/**
 * Synchronous session check for route guards that need a
 * quick memo-friendly check. Prefer `useAuth()` in components.
 */
export { authClient };
