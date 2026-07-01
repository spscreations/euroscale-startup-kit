"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiClient, ApiError } from "@/lib/api";
import { API_BASE_URL, SESSION_DURATION_MS } from "@/lib/constants";

// ── Shape of a logged-in user ──────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name?: string;
}

export interface Session {
  token: string;
  user: User;
  expiresAt: number;
}

// ── Context type ───────────────────────────────────────────────────────────

export interface AuthContextValue {
  /** The full session object (null when logged out). */
  session: Session | null;
  /** Convenience alias for `session?.user ?? null`. */
  user: User | null;
  /** True while the initial session is being hydrated from localStorage. */
  isLoading: boolean;
  /** True when a valid, non-expired session exists. */
  isAuthenticated: boolean;
  /** The raw JWT / bearer token (null when logged out). */
  token: string | null;
  /** Authenticate with email + password. Throws on failure. */
  login: (email: string, password: string) => Promise<void>;
  /** Destroy the session and clear stored state. */
  logout: () => void;
}

// ── Context + Provider ─────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

function loadSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("euroscale_session");
    if (!raw) return null;
    const session: Session = JSON.parse(raw);
    // Immediately discard expired sessions
    if (Date.now() >= session.expiresAt) {
      localStorage.removeItem("euroscale_session");
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem("euroscale_session");
    return null;
  }
}

function saveSession(session: Session): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("euroscale_session", JSON.stringify(session));
}

function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("euroscale_session");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ── Hydrate from localStorage on mount ────────────────────────────────
  useEffect(() => {
    const existing = loadSession();
    setSession(existing);
    setIsLoading(false);
  }, []);

  // ── Keep apiClient token in sync with current session ─────────────────
  useEffect(() => {
    apiClient.setTokenGetter(() => session?.token ?? null);
  }, [session]);

  // ── login ─────────────────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      let message = "Login failed";
      try {
        const body = await res.json();
        message = body.message ?? message;
      } catch {
        // keep default message
      }
      throw new ApiError(message, res.status);
    }

    const data = await res.json();
    const newSession: Session = {
      token: data.token,
      user: data.user,
      expiresAt:
        Date.now() +
        (data.expires_in_seconds ?? SESSION_DURATION_MS / 1000) * 1000,
    };

    saveSession(newSession);
    setSession(newSession);
  }, []);

  // ── logout ────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  // ── Derived values ────────────────────────────────────────────────────
  const isAuthenticated = session != null;
  const token = session?.token ?? null;
  const user = session?.user ?? null;

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        isLoading,
        isAuthenticated,
        token,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Access the auth context from any client component.
 *
 * @throws if used outside of `<AuthProvider>`.
 *
 * @example
 * ```tsx
 * const { session, isLoading, login, logout } = useAuth();
 * ```
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }
  return ctx;
}

export default AuthContext;
