import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-server";

const API_BASE = "https://api.euroscale.app";
const API_KEY = process.env.EUROSCALE_API_KEY || "";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const servicePath = path.join("/");

  let userId: string | undefined;
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });
    userId = session?.user?.id;
  } catch {
    // Continue without user ID
  }

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
