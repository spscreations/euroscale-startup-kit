import type { Transport } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
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

let tokenGetter: TokenGetter | null = null;

/** Register a function that returns the current auth token. */
export function setTokenGetter(getToken: TokenGetter): void {
  tokenGetter = getToken;
}

// ── Transport ───────────────────────────────────────────────────────────────

/**
 * Creates a gRPC-web Transport configured for the EuroScale API.
 *
 * Auth tokens are injected via interceptor, so callers don't need to
 * manage headers manually.
 */
export function createTransport(): Transport {
  return createGrpcWebTransport({
    baseUrl: RPC_BASE_URL,
    interceptors: [
      (next) => async (req) => {
        const token = tokenGetter?.();
        if (token) {
          req.header.set("Authorization", `Bearer ${token}`);
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
