export const APP_NAME = "EuroScale";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.euroscale.io";

export const RPC_BASE_URL =
  process.env.NEXT_PUBLIC_RPC_BASE_URL || "https://api.euroscale.io/rpc";

export const DASHBOARD_URL =
  process.env.NEXT_PUBLIC_DASHBOARD_URL || "https://app.euroscale.io";

export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 25,
  MAX_PAGE_SIZE: 100,
} as const;
