import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-server";

const API_BASE = "https://api.euroscale.app";
const API_KEY = process.env.EUROSCALE_API_KEY || "";

async function proxy(req: NextRequest, segs: string[]) {
  const qs = req.nextUrl.searchParams.toString();
  const url = `${API_BASE}/${segs.join("/")}${qs ? "?" + qs : ""}`;

  let userId: string | undefined;
  try { const ses = await auth.api.getSession({ headers: req.headers }); userId = ses?.user?.id; } catch {}

  const headers: Record<string, string> = {};
  const ct = req.headers.get("content-type");
  if (ct) headers["Content-Type"] = ct;
  headers["Authorization"] = `Bearer ${API_KEY}`;
  if (userId) headers["X-User-ID"] = userId;

  const body = req.method !== "GET" && req.method !== "HEAD" ? await req.arrayBuffer() : undefined;
  try {
    const resp = await fetch(url, { method: req.method, headers, body });
    const respBody = await resp.arrayBuffer();
    const respH: Record<string, string> = {};
    const rct = resp.headers.get("content-type");
    if (rct) respH["Content-Type"] = rct;
    return new NextResponse(respBody, { status: resp.status, headers: respH });
  } catch {
    // Do not leak internal error details to the client
    return NextResponse.json({ error: "Internal server error" }, { status: 502 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) { const { path } = await params; return proxy(req, path); }
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) { const { path } = await params; return proxy(req, path); }
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) { const { path } = await params; return proxy(req, path); }
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) { const { path } = await params; return proxy(req, path); }
