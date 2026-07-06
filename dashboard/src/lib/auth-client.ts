import { createAuthClient } from "better-auth/react";

// Better Auth client — basePath must match the route location.
// Moved from /api/auth to /api/better-auth due to Next.js 16 routing issue.
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BASE_URL || "https://euroscale.app",
  basePath: "/api/better-auth",
});
