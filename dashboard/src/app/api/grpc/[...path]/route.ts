import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth-server";
import crypto from "crypto";

const API_BASE = "https://api.euroscale.app";

// Sign a JWT matching the Go API's expected claims (user_id, email, role, sub).
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const servicePath = path.join("/");

  let userId: string | undefined;
  let email: string | undefined;
  try {
    const session = await getAuth()!.api.getSession({ headers: req.headers });
    userId = session?.user?.id;
    email = session?.user?.email;
  } catch {}

  const headers: Record<string, string> = {};
  const ct = req.headers.get("content-type");
  if (ct) headers["Content-Type"] = ct;

  // Generate a short-lived JWT signed with the shared BETTER_AUTH_SECRET.
  // The API validates this JWT using the same secret and extracts user_id.
  const jwtSecret = process.env.BETTER_AUTH_SECRET || process.env.EUROSCALE_API_KEY || "";
  if (userId && jwtSecret) {
    headers["Authorization"] = `Bearer ${signJWT(userId, email || userId, "user", jwtSecret)}`;
    headers["x-user-id"] = userId;
  }

  try {
    const response = await fetch(`${API_BASE}/${servicePath}`, { method: "POST", headers, body: await req.arrayBuffer() });
    const responseBody = await response.arrayBuffer();
    const responseHeaders: Record<string, string> = {};
    const responseCt = response.headers.get("content-type");
    if (responseCt) responseHeaders["Content-Type"] = responseCt;
    return new NextResponse(responseBody, { status: response.status, headers: responseHeaders });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 502 });
  }
}
