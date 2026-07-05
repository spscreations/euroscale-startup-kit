import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-server";

const API_BASE = "https://api.euroscale.app";
const API_KEY = process.env.EUROSCALE_API_KEY || "";

/**
 * BFF proxy for gRPC/Connect API calls.
 *
 * Browser → POST /api/grpc/{service}/{method}
 *   → This handler looks up the Better Auth session, adds the
 *     server-side API key + user ID, and forwards to the real API.
 *
 * Supports both JSON (application/connect+json) and binary
 * (application/connect+proto) request/response formats.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const servicePath = path.join("/");

  // ── Look up the Better Auth session ──────────────────────────────────
  let userId: string | undefined;
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });
    userId = session?.user?.id;
  } catch {
    // Session lookup failed — continue without a user ID.
    // The real API will reject unauthenticated requests if required.
  }

  // ── Forward the request ─────────────────────────────────────────────
  const headers: Record<string, string> = {};
  const ct = req.headers.get("content-type");
  if (ct) headers["Content-Type"] = ct;
  headers["Authorization"] = `Bearer ${API_KEY}`;
  if (userId) headers["X-User-ID"] = userId;

  const body = await req.arrayBuffer();

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/${servicePath}`, {
      method: "POST",
      headers,
      body,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "API proxy error", details: String(err) },
      { status: 502 },
    );
  }

  const responseBody = await response.arrayBuffer();
  const responseHeaders: Record<string, string> = {};
  const responseCt = response.headers.get("content-type");
  if (responseCt) responseHeaders["Content-Type"] = responseCt;

  return new NextResponse(responseBody, {
    status: response.status,
    headers: responseHeaders,
  });
}
