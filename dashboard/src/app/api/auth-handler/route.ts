import { getAuth } from "@/lib/auth-server";

// Single handler for all Better Auth actions. Next.js rewrites
// /api/better-auth/* → /api/auth-handler while preserving the
// original URL so Better Auth can dispatch correctly.
export async function GET(req: Request) {
  const auth = getAuth()!;
  return auth.handler(req);
}
export async function POST(req: Request) {
  const auth = getAuth()!;
  return auth.handler(req);
}
