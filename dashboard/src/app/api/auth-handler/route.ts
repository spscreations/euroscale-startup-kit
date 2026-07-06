// Self-contained Better Auth handler. Imported at module level only if
// dynamically require'd — avoids turbopack chunk resolution issues.
// Route: /api/auth-handler (via rewrite from /api/better-auth/*)

const BASE = "/api/better-auth";

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}

async function handle(req: Request) {
  try {
    const { getAuth } = await import("@/lib/auth-server");
    const auth = getAuth()!;
    return auth.handler(req);
  } catch (e) {
    console.error("[auth] handler error:", e);
    return new Response(
      JSON.stringify({ error: "Authentication service unavailable" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
