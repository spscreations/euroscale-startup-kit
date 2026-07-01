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
import { API_BASE_URL, SESSION_DURATION_MS } from "@/lib/constants";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface Session {
  id: string;
  name: string;
  email: string;
  token: string;
  expiresAt: number;
}

interface AuthState {
  session: Session | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

/* -------------------------------------------------------------------------- */
/*  Context                                                                   */
/* -------------------------------------------------------------------------- */

const AuthContext = createContext<AuthState | undefined>(undefined);

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const SESSION_KEY = "euroscale_session";

function loadSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session: Session = JSON.parse(raw);
    if (Date.now() > session.expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function persistSession(session: Session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

/* -------------------------------------------------------------------------- */
/*  Provider                                                                  */
/* -------------------------------------------------------------------------- */

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount (avoids hydration mismatch)
  useEffect(() => {
    setSession(loadSession());
    setHydrated(true);
  }, []);

  const logout = useCallback(() => {
    setSession(null);
    clearSession();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE_URL}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? "Invalid credentials");
    }

    const data = await res.json();
    const newSession: Session = {
      id: data.user?.id ?? "",
      name: data.user?.name ?? "",
      email: data.user?.email ?? email,
      token: data.token ?? "",
      expiresAt: Date.now() + SESSION_DURATION_MS,
    };

    persistSession(newSession);
    setSession(newSession);
  }, []);

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await fetch(`${API_BASE_URL}/v1/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Signup failed");
      }

      // Auto-login after signup
      await login(email, password);
    },
    [login],
  );

  const value = useMemo<AuthState>(
    () => ({
      session,
      isLoading: !hydrated,
      login,
      signup,
      logout,
    }),
    [session, hydrated, login, signup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* -------------------------------------------------------------------------- */
/*  Hook                                                                      */
/* -------------------------------------------------------------------------- */

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }
  return ctx;
}
