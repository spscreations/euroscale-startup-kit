import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.API_BASE_URL || "http://euroscale-api:50051";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const path = req.nextUrl.searchParams.get("path") || "";

    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": req.headers.get("x-api-key") || "",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to proxy API request", details: String(err) },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
