import type { Transport } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";

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

/**
 * Extracts a user-friendly error message from a Connect error.
 * Connect errors surface the gRPC code name as the message by default
 * (e.g. "unknown", "resource_exhausted"). This extracts the actual
 * server-provided message when available.
 */
export function connectErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    // ConnectError from @connectrpc/connect stores the server message
    // in a 'rawMessage' or 'details' property.
    const ce = err as Error & { rawMessage?: string; details?: Array<{ debug?: { detail?: string } }> };
    if (ce.rawMessage) return ce.rawMessage;
    if (ce.details?.[0]?.debug?.detail) return ce.details[0].debug.detail;
    // Strip "[unknown]" prefix if present (code name wrapping)
    const msg = ce.message.replace(/^\[.*?\]\s*/, "");
    if (msg && msg !== "unknown") return msg;
    return ce.message;
  }
  return String(err);
}

// ── Transport ───────────────────────────────────────────────────────────────

/**
 * Creates a Connect transport configured for the EuroScale API
 * through the BFF proxy at `/api/grpc`.
 *
 * Instead of the browser calling the API directly, all gRPC/Connect
 * calls go through Next.js server routes. The server-side proxy adds
 * the API key and user ID from the Better Auth session.
 *
 * Uses the Connect protocol (application/connect+json) over HTTP/1.1.
 */
export function createTransport(): Transport {
  return createConnectTransport({
    baseUrl: "/api/grpc",
    useBinaryFormat: false,
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
