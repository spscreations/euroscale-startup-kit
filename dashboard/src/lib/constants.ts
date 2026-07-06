export const APP_NAME = "EuroScale";

export const API_BASE_URL = "/api/rest";

/**
 * All gRPC/Connect RPCs are routed through the Next.js BFF proxy
 * at `/api/grpc` instead of calling the API directly from the browser.
 * The proxy adds server-side auth headers (API key + user ID).
 */
export const RPC_BASE_URL = "/api/grpc";

export const DASHBOARD_URL =
  process.env.NEXT_PUBLIC_DASHBOARD_URL || "https://app.euroscale.io";

export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 25,
  MAX_PAGE_SIZE: 100,
} as const;
// CI trigger: bump to v1.1
