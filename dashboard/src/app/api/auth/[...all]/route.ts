import { getAuth } from "@/lib/auth-server";

export async function GET(req: Request) { const auth = await getAuth(); return auth.handler(req); }
export async function POST(req: Request) { const auth = await getAuth(); return auth.handler(req); }
