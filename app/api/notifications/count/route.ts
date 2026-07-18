import { getCloudflareContext, json, unauthorized } from "@/lib/cf";
import { getUnreadNotificationCount } from "@/lib/db";
import { getSessionActor } from "@/lib/auth";

export async function GET(request: Request) {
  const { env } = getCloudflareContext();
  const db = env.DB;

  const token = getBearerToken(request);
  if (!token) return unauthorized();
  const session = await getSessionActor(db, token);
  if (!session) return unauthorized();

  const count = await getUnreadNotificationCount(db, session.id);
  return json({ count });
}

function getBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? request.headers.get("Authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}
