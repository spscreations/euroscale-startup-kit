import { getAuth } from "@/lib/auth-server";

export async function GET(req: Request) {
  try {
    const auth = getAuth()!;
    return await auth.handler(req);
  } catch (e) {
    console.error("[auth:GET]", e instanceof Error ? e.stack : e);
    return new Response(JSON.stringify({ error: "Auth error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function POST(req: Request) {
  const start = Date.now();
  try {
    console.error("[auth:POST:start]", req.url, req.method);
    const auth = getAuth()!;
    const resp = await auth.handler(req);
    const body = await resp.clone().text();
    console.error("[auth:POST:end]", resp.status, body.slice(0, 300));
    return resp;
  } catch (e) {
    console.error("[auth:POST:error]", Date.now() - start, "ms", e instanceof Error ? e.stack : e);
    return new Response(JSON.stringify({ error: "Auth error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
