import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-server";

const API_BASE = "https://api.euroscale.app";
const API_KEY = process.env.EUROSCALE_API_KEY || "";

async function proxyRequest(req: NextRequest, pathSegments: string[]) {
  const apiPath = "/" + pathSegments.join("/");
  const queryString = req.nextUrl.searchParams.toString();
  const url = `${API_BASE}${apiPath}${queryString ? "?" + queryString : ""}`;

  let userId: string | undefined;
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    userId = session?.user?.id;
  } catch {
    // Continue without user ID
  }

  const headers: Record<string, string> = {};
  const ct = req.headers.get("content-type");
  if (ct) headers["Content-Type"] = ct;
  headers["Authorization"] = `Bearer ${API_KEY}`;
  if (userId) headers["X-User-ID"] = userId;

  let body: ArrayBuffer | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.arrayBuffer();
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: req.method,
      headers,
      body,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "REST proxy error", details: String(err) },
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxyRequest(req, path);
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxyRequest(req, path);
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxyRequest(req, path);
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxyRequest(req, path);
}
