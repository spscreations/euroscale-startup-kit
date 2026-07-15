import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth-server";
import crypto from "crypto";

const API_BASE = "https://api.euroscale.app";

function signJWT(userId: string, email: string, role: string, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      user_id: userId,
      email,
      role,
      sub: userId,
      iss: "euroscale",
      aud: ["euroscale-api"],
      iat: now,
      exp: now + 300,
      nbf: now,
    })
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

async function proxy(req: NextRequest, segs: string[]) {
  const qs = req.nextUrl.searchParams.toString();
  const url = `${API_BASE}/${segs.join("/")}${qs ? "?" + qs : ""}`;

  let userId: string | undefined;
  let email: string | undefined;

  // Try Better Auth session first.
  try { const ses = await getAuth()!.api.getSession({ headers: req.headers }); userId = ses?.user?.id; email = ses?.user?.email; } catch {}

  // Fallback: try to find the auth cookie directly if session failed.
  // This handles the case where getSession() doesn't work after a cross-domain redirect
  // but the browser still sends the cookie.
  if (!userId) {
    try {
      const cookieHeader = req.headers.get("cookie") || "";
      if (cookieHeader.includes("__Secure-better-auth.session_token")) {
        const cookies = cookieHeader.split(";").map(c => c.trim());
        for (const cookie of cookies) {
          if (cookie.startsWith("__Secure-better-auth.session_token=")) {
            const sessionToken = cookie.substring("__Secure-better-auth.session_token=".length);
            // Try getting the session again using just the cookie header directly.
            // Construct a headers object with only the session cookie to avoid conflicts.
            const ses = await getAuth()!.api.getSession({
              headers: new Headers({ cookie: `__Secure-better-auth.session_token=${sessionToken}` }),
            });
            userId = ses?.user?.id;
            email = ses?.user?.email;
            break;
          }
        }
      }
    } catch {}
  }

  const headers: Record<string, string> = {};
  const ct = req.headers.get("content-type");
  if (ct) headers["Content-Type"] = ct;

  const jwtSecret = process.env.BETTER_AUTH_SECRET || process.env.EUROSCALE_API_KEY || "";
  if (userId && jwtSecret) {
    headers["Authorization"] = `Bearer ${signJWT(userId, email || userId, "user", jwtSecret)}`;
    headers["x-user-id"] = userId;
  }

  const body = req.method !== "GET" && req.method !== "HEAD" ? await req.arrayBuffer() : undefined;
  try {
    const resp = await fetch(url, { method: req.method, headers, body });
    // SECURITY: do not forward upstream 5xx bodies (may contain internal details).
    if (resp.status >= 500) {
      return NextResponse.json({ error: "Upstream error" }, { status: resp.status });
    }
    const respBody = await resp.arrayBuffer();
    const respH: Record<string, string> = {};
    const rct = resp.headers.get("content-type");
    if (rct) respH["Content-Type"] = rct;
    return new NextResponse(respBody, { status: resp.status, headers: respH });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 502 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) { const { path } = await params; return proxy(req, path); }
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) { const { path } = await params; return proxy(req, path); }
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) { const { path } = await params; return proxy(req, path); }
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) { const { path } = await params; return proxy(req, path); }
