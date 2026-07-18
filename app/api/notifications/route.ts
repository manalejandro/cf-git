import { getCloudflareContext, json, unauthorized } from "@/lib/cf";
import { getNotifications, getActorById } from "@/lib/db";
import { getSessionActor } from "@/lib/auth";

export async function GET(request: Request) {
  const { env } = getCloudflareContext();
  const db = env.DB;

  const token = getBearerToken(request);
  if (!token) return unauthorized();
  const session = await getSessionActor(db, token);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "30", 10);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

  const notifications = await getNotifications(db, session.id, limit, offset);

  const enriched = await Promise.all(
    notifications.map(async (n) => {
      const actor = await getActorById(db, n.accountId);
      return {
        ...n,
        account: actor ? {
          id: actor.id,
          username: actor.username,
          displayName: actor.displayName,
          avatarUrl: actor.avatarUrl,
        } : null,
      };
    })
  );

  return json(enriched);
}

function getBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? request.headers.get("Authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}
