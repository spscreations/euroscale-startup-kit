import type { Transport } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { RPC_BASE_URL } from "@/lib/constants";

// ── Error Types ─────────────────────────────────────────────────────────────

export class ApiError extends Error {
  public readonly status: number;
  public readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

// ── Auth Interceptor ────────────────────────────────────────────────────────

type TokenGetter = () => string | null;
type UserIdGetter = () => string | null;

let tokenGetter: TokenGetter | null = null;
let userIdGetter: UserIdGetter | null = null;

/** Register a function that returns the current auth token. */
export function setTokenGetter(getToken: TokenGetter): void {
  tokenGetter = getToken;
}

/** Register a function that returns the current user ID. */
export function setUserIdGetter(getUserId: UserIdGetter): void {
  userIdGetter = getUserId;
}

// ── Transport ───────────────────────────────────────────────────────────────

/**
 * Creates a Connect transport configured for the EuroScale API.
 *
 * Uses the Connect protocol (application/connect+json) which works
 * over HTTP/1.1 and does not require a gRPC-web proxy. The server
 * serves both auth endpoints and Connect RPCs on the same port.
 *
 * Auth tokens are injected via interceptor, so callers don't need to
 * manage headers manually.
 */
export function createTransport(): Transport {
  return createConnectTransport({
    baseUrl: RPC_BASE_URL,
    // Use binary (application/connect+proto) for better performance.
    // Falls back to JSON when binary is not supported.
    useBinaryFormat: true,
    fetch: (url, init) => {
      // Add CORS mode for cross-origin requests from the browser.
      return fetch(url, { ...init, mode: "cors" });
    },
    interceptors: [
      (next) => async (req) => {
        const token = tokenGetter?.();
        if (token) {
          req.header.set("Authorization", `Bearer ${token}`);
        }
        const userId = userIdGetter?.();
        if (userId) {
          req.header.set("X-User-ID", userId);
        }
        return next(req);
      },
    ],
  });
}

/**
 * Shared transport singleton. Lazily constructed on first access.
 * Use this when passing `transport` to connect-query hooks outside
 * a `<TransportProvider>` tree, or call `createTransport()` directly.
 */
let sharedTransport: Transport | undefined;
export function getTransport(): Transport {
  if (!sharedTransport) {
    sharedTransport = createTransport();
  }
  return sharedTransport;
}
