import { createAuthClient } from "better-auth/react";

// Better Auth client — basePath is rewritten by next.config.ts
// to /api/auth-handler while preserving the original URL.
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BASE_URL || "https://euroscale.app",
  basePath: "/api/better-auth",
});
