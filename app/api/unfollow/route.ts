import { getCloudflareContext, json, badRequest, unauthorized } from "@/lib/cf";
import { getActorById, getFollow, deleteFollow, updateActorCounts } from "@/lib/db";
import { getSessionActor } from "@/lib/auth";
import { generateId, buildUndo, buildFollow, keyIRI } from "@/lib/activitypub/utils";
import { deliverToInbox } from "@/lib/activitypub/federation";

export async function POST(request: Request) {
  const { env } = getCloudflareContext();
  const db = env.DB;

  const token = getBearerToken(request);
  if (!token) return unauthorized();
  const session = await getSessionActor(db, token);
  if (!session) return unauthorized();

  const body = await request.json() as Record<string, unknown>;
  const targetId = body.targetId as string;
  if (!targetId) return badRequest("targetId is required");

  const follow = await getFollow(db, session.id, targetId);
  if (!follow) return json({ success: true });

  const isLocal = follow.state === "accepted";

  await deleteFollow(db, session.id, targetId);

  const baseUrl = env.INSTANCE_URL;

  if (isLocal) {
    await updateActorCounts(db, session.id, { followingCount: -1 });
    await updateActorCounts(db, targetId, { followersCount: -1 });
  }

  const target = await getActorById(db, targetId);
  const actor = await getActorById(db, session.id);
  const inbox = target?.inbox ?? `${targetId}/inbox`;
  if (actor?.privateKeyPem && inbox) {
    const followActivity = buildFollow(baseUrl, session.id, targetId, follow.activityId ?? generateId());
    const undoId = generateId();
    const undoActivity = buildUndo(baseUrl, session.id, followActivity, undoId);
    await deliverToInbox(
      inbox,
      undoActivity,
      keyIRI(baseUrl, session.username),
      actor.privateKeyPem
    );
  }

  return json({ success: true });
}

function getBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? request.headers.get("Authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}
