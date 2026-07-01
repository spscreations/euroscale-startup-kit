"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiClient, ApiError } from "@/lib/api";
import { API_BASE_URL, SESSION_DURATION_MS } from "@/lib/constants";

// ── Session shape ───────────────────────────────────────────────────────────

export interface UserSession {
  id: string;
  email: string;
  name?: string;
  token: string;
  expiresAt: number;
}

interface AuthState {
  session: UserSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "euroscale_session";

function loadSession(): UserSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session: UserSession = JSON.parse(raw);
    if (Date.now() > session.expiresAt) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function persist(session: UserSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function clear() {
  localStorage.removeItem(STORAGE_KEY);
}

/** Synchronous check — usable outside React (e.g. AuthGuard). */
export function isAuthenticated(): boolean {
  return loadSession() !== null;
}

// ── Context ────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<UserSession | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage
  useEffect(() => {
    const existing = loadSession();
    setSession(existing);
    setHydrated(true);
  }, []);

  // Wire token into apiClient whenever session changes
  useEffect(() => {
    apiClient.setTokenGetter(() => session?.token ?? null);
  }, [session]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      let message = "Login failed";
      try { const body = await res.json(); message = body.message ?? message; } catch {}
      throw new ApiError(message, res.status);
    }

    const data = await res.json();
    const newSession: UserSession = {
      id: data.user?.id ?? "",
      name: data.user?.name ?? "",
      email: data.user?.email ?? email,
      token: data.token ?? "",
      expiresAt: Date.now() + (data.expires_in_seconds ?? SESSION_DURATION_MS / 1000) * 1000,
    };
    persist(newSession);
    setSession(newSession);
  }, []);

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      if (!res.ok) {
        let message = "Signup failed";
        try { const body = await res.json(); message = body.message ?? message; } catch {}
        throw new ApiError(message, res.status);
      }
      // Auto-login after signup
      await login(email, password);
    },
    [login],
  );

  const logout = useCallback(() => {
    setSession(null);
    clear();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      isLoading: !hydrated,
      isAuthenticated: session !== null,
      login,
      signup,
      logout,
    }),
    [session, hydrated, login, signup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) throw new Error("useAuth must be used within an <AuthProvider>");
  return ctx;
}
