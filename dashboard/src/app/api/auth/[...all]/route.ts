import { getAuth } from "@/lib/auth-server";

// Lazy auth handler — resolves Better Auth instance on each request.
// Prevents crashing during `next build` when DB env vars aren't set.
export async function GET(req: Request) {
  const auth = getAuth()!;
  return auth.handler(req);
}
export async function POST(req: Request) {
  const auth = getAuth()!;
  return auth.handler(req);
}
