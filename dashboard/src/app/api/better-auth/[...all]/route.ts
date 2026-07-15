import { getAuth } from "@/lib/auth-server";

export async function GET(req: Request) {
  try {
    const auth = getAuth()!;
    return await auth.handler(req);
  } catch (e) {
    // SECURITY: log message only — stacks can include request context.
    console.error("[auth:GET]", e instanceof Error ? e.message : "unknown error");
    return new Response(JSON.stringify({ error: "Auth error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function POST(req: Request) {
  const start = Date.now();
  try {
    // SECURITY: never log request/response bodies — they can contain passwords,
    // session tokens, and other credentials.
    const auth = getAuth()!;
    return await auth.handler(req);
  } catch (e) {
    console.error(
      "[auth:POST:error]",
      Date.now() - start,
      "ms",
      e instanceof Error ? e.message : "unknown error",
    );
    return new Response(JSON.stringify({ error: "Auth error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
