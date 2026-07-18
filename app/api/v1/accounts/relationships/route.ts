import { getCloudflareContext, json, unauthorized } from "@/lib/cf";
import { getFollow } from "@/lib/db";
import { getSessionActor } from "@/lib/auth";

export async function GET(request: Request) {
  const { env } = getCloudflareContext();
  const db = env.DB;

  const token = getBearerToken(request);
  if (!token) return unauthorized();
  const session = await getSessionActor(db, token);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const idsStr = url.searchParams.get("ids") ?? "";
  const ids = idsStr.split(",").filter(Boolean);
  if (!ids.length) return json([]);

  const results: Record<string, unknown>[] = [];
  for (const targetId of ids) {
    const follow = await getFollow(db, session.id, targetId);
    results.push({
      id: targetId,
      following: !!follow && follow.state === "accepted",
      requested: !!follow && follow.state === "pending",
    });
  }

  return json(results);
}

function getBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? request.headers.get("Authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}
