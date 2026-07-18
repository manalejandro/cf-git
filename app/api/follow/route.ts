import { getCloudflareContext, json, badRequest, unauthorized } from "@/lib/cf";
import { getActorById, getFollow, createFollow, createNotification, updateActorCounts } from "@/lib/db";
import { getSessionActor } from "@/lib/auth";
import { generateId, buildFollow, keyIRI } from "@/lib/activitypub/utils";
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

  const existingFollow = await getFollow(db, session.id, targetId);
  if (existingFollow) return json({ id: existingFollow.id, state: existingFollow.state });

  const baseUrl = env.INSTANCE_URL;
  const followId = generateId();
  const followActivity = buildFollow(baseUrl, session.id, targetId, followId);

  const target = await getActorById(db, targetId);

  if (target && target.isLocal) {
    await createFollow(db, {
      id: followId,
      actorId: session.id,
      targetId,
      state: "accepted",
      activityId: followActivity.id,
    });
    await updateActorCounts(db, session.id, { followingCount: 1 });
    await updateActorCounts(db, targetId, { followersCount: 1 });
    await createNotification(db, {
      id: generateId(),
      type: "follow",
      accountId: session.id,
      targetAccountId: targetId,
    });
  } else {
    await createFollow(db, {
      id: followId,
      actorId: session.id,
      targetId,
      state: "pending",
      activityId: followActivity.id,
    });

    const actor = await getActorById(db, session.id);
    const inbox = target?.inbox ?? `${targetId}/inbox`;
    if (actor?.privateKeyPem && inbox) {
      const result = await deliverToInbox(
        inbox,
        followActivity,
        keyIRI(baseUrl, session.username),
        actor.privateKeyPem
      );
      if (!result.ok) {
        console.error(`[follow] Delivery failed to ${inbox}: status=${result.status} error=${result.error}`);
      }
    }
  }

  return json({ id: followId, state: target?.isLocal ? "accepted" : "pending" }, 201);
}

function getBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? request.headers.get("Authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}
