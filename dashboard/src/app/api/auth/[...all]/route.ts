import { getAuth } from "@/lib/auth-server";

export async function GET(req: Request) {
  const a = await getAuth();
  return a.handler(req);
}
export async function POST(req: Request) {
  const a = await getAuth();
  return a.handler(req);
}
