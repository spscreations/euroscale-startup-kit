import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth-server";

const API_BASE = "https://api.euroscale.app";
const API_KEY = process.env.EUROSCALE_API_KEY || "";

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const servicePath = path.join("/");

  let userId: string | undefined;
  try {
    const session = await getAuth()!.api.getSession({ headers: req.headers });
    userId = session?.user?.id;
  } catch {}

  const headers: Record<string, string> = {};
  const ct = req.headers.get("content-type");
  if (ct) headers["Content-Type"] = ct;
  headers["x-api-key"] = API_KEY;
  if (userId) headers["x-user-id"] = userId;

  try {
    const response = await fetch(`${API_BASE}/${servicePath}`, { method: "POST", headers, body: await req.arrayBuffer() });
    const responseBody = await response.arrayBuffer();
    const responseHeaders: Record<string, string> = {};
    const responseCt = response.headers.get("content-type");
    if (responseCt) responseHeaders["Content-Type"] = responseCt;
    return new NextResponse(responseBody, { status: response.status, headers: responseHeaders });
  } catch {
    // Do not leak internal error details to the client
    return NextResponse.json({ error: "Internal server error" }, { status: 502 });
  }
}
