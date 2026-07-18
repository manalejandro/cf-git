import { getCloudflareContext, json, unauthorized, notFound } from "@/lib/cf";
import { markNotificationRead } from "@/lib/db";
import { getSessionActor } from "@/lib/auth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { env } = getCloudflareContext();
  const db = env.DB;
  const { id } = await params;

  const token = getBearerToken(request);
  if (!token) return unauthorized();
  const session = await getSessionActor(db, token);
  if (!session) return unauthorized();

  await markNotificationRead(db, id);
  return json({ success: true });
}

function getBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? request.headers.get("Authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}
