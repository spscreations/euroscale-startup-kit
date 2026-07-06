import { getAuth } from "@/lib/auth-server";

export async function GET(req: Request) {
  try {
    const auth = getAuth()!;
    const resp = await auth.handler(req);
    return resp;
  } catch (e) {
    console.error("[auth:GET]", e instanceof Error ? e.message : String(e));
    return new Response(JSON.stringify({ error: "Auth handler error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function POST(req: Request) {
  try {
    const auth = getAuth()!;
    const resp = await auth.handler(req);
    // Log 404s from Better Auth for debugging
    if (resp.status === 404) {
      const body = await resp.clone().text();
      console.error("[auth:POST:404]", req.url, body.slice(0, 200));
    }
    return resp;
  } catch (e) {
    console.error("[auth:POST]", e instanceof Error ? e.message : String(e));
    return new Response(JSON.stringify({ error: "Auth handler error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
