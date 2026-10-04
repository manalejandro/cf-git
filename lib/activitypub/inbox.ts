/**
 * Inbox activity processor — handles incoming ActivityPub activities.
 */

import type { D1Database } from "@cloudflare/workers-types";
import type { APActivity, APActor } from "@/lib/types";
import {
  getActorById,
  createFollow,
  updateFollowState,
  deleteFollow,
  updateActorCounts,
  createNotification,
  getFollowByActivityId,
  getFollow,
} from "@/lib/db";
import { buildAccept, generateId } from "./utils";
import { deliverToInbox, fetchRemoteObject } from "./federation";
import { cacheRemoteActor, type LocalSigningKey } from "./signer-key";

interface InboxContext {
  db: D1Database;
  baseUrl: string;
  recipient?: { id: string; username: string; privateKeyPem: string } | null;
  /**
   * The actor that signed the HTTP request (derived from the Signature keyId).
   * Used to reject cross-actor spoofing — see processInboxActivity.
   */
  signingActorId?: string | null;
  signingKey?: LocalSigningKey | null;
}

export async function processInboxActivity(
  activity: APActivity,
  ctx: InboxContext
): Promise<void> {
  const rawType = activity.type as unknown;
  const type = typeof rawType === "string"
    ? rawType.toLowerCase()
    : Array.isArray(rawType)
      ? String(rawType[rawType.length - 1] ?? "").toLowerCase()
      : "";

  const activityActorId = typeof activity.actor === "string"
    ? activity.actor
    : (activity.actor as { id?: string } | undefined)?.id;

  // Anti-spoofing: the HTTP-signature signer must own the activity's `actor`.
  if (ctx.signingActorId && activityActorId && ctx.signingActorId !== activityActorId) {
    return;
  }

  // Replay protection: record the activity id and skip duplicates. Most
  // handlers are idempotent, but replayed Delete/Undo/Update activities can
  // still corrupt counters or state.
  const dedupActorId = activityActorId ?? ctx.signingActorId;
  if (typeof activity.id === "string" && activity.id && dedupActorId) {
    try {
      const dedup = await ctx.db
        .prepare(
          `INSERT OR IGNORE INTO activities (id, type, actor_id, object_id, to_list, cc_list, raw, is_local, delivered)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)`
        )
        .bind(
          activity.id,
          type || "unknown",
          dedupActorId,
          typeof activity.object === "string"
            ? activity.object
            : (activity.object as { id?: string } | undefined)?.id ?? null,
          JSON.stringify(activity.to ?? []),
          JSON.stringify(activity.cc ?? []),
          JSON.stringify(activity)
        )
        .run();
      if ((dedup.meta?.changes ?? 0) === 0) return;
    } catch { /* dedup is best-effort — never block processing */ }
  }

  try {
    switch (type) {
      case "follow": await handleFollow(activity, ctx); break;
      case "accept": await handleAccept(activity, ctx); break;
      case "reject": await handleReject(activity, ctx); break;
      case "undo": await handleUndo(activity, ctx); break;
      case "delete": await handleDelete(activity, ctx); break;
      case "create": await handleCreate(activity, ctx); break;
      case "update": await handleUpdate(activity, ctx); break;
      default:
        console.log(`[inbox] Unhandled activity type: ${type}`);
    }
  } catch (err) {
    console.error(`[inbox] processInboxActivity error for type=${type}: ${err}`);
  }
}

async function handleFollow(activity: APActivity, ctx: InboxContext): Promise<void> {
  const { db, baseUrl, signingKey } = ctx;
  const actorId = typeof activity.actor === "string" ? activity.actor : activity.actor.id;
  const targetId = typeof activity.object === "string" ? activity.object : (activity.object as { id?: string })?.id;

  if (!actorId || !targetId) return;

  // An inbound Follow must target a local actor; anything else is a forwarded
  // copy we cannot act on.
  const target = await getActorById(db, targetId);
  if (!target || !target.isLocal || !target.privateKeyPem) return;

  const existingFollow = await getFollow(db, actorId, targetId);
  if (!existingFollow) {
    await createFollow(db, {
      id: generateId(),
      actorId,
      targetId,
      state: "accepted",
      activityId: activity.id,
    });

    await updateActorCounts(db, actorId, { followingCount: 1 });
    await updateActorCounts(db, targetId, { followersCount: 1 });

    await createNotification(db, {
      id: generateId(),
      type: "follow",
      accountId: actorId,
      targetAccountId: targetId,
    });
  }

  // Always answer with an Accept, even for a re-delivered Follow: the sender
  // may have missed the first one.
  const acceptId = generateId();
  const acceptActivity = buildAccept(baseUrl, targetId, activity, acceptId);

  const follower = await getActorById(db, actorId);
  const followerInbox = follower?.inbox ?? await fetchActorInbox(db, actorId, signingKey);
  if (followerInbox && signingKey?.privateKeyPem) {
    await deliverToInbox(followerInbox, acceptActivity, `${signingKey.id}#main-key`, signingKey.privateKeyPem);
  }
}

async function handleAccept(activity: APActivity, ctx: InboxContext): Promise<void> {
  const { db } = ctx;
  const obj = activity.object as APActivity | string | undefined;
  const followActivityId = typeof obj === "string" ? obj : obj?.id;
  if (!followActivityId) return;

  const follow = await getFollowByActivityId(db, followActivityId);
  if (!follow || follow.state === "accepted") return;

  // Only the followed actor may accept the follow.
  const actorId = typeof activity.actor === "string" ? activity.actor : activity.actor.id;
  if (actorId !== follow.targetId) return;

  await updateFollowState(db, follow.id, "accepted");
  await updateActorCounts(db, follow.actorId, { followingCount: 1 });
  await updateActorCounts(db, follow.targetId, { followersCount: 1 });
  await createNotification(db, {
    id: generateId(),
    type: "follow_accept",
    accountId: actorId,
    targetAccountId: follow.actorId,
  });
}

async function handleReject(activity: APActivity, ctx: InboxContext): Promise<void> {
  const { db } = ctx;
  const obj = activity.object as APActivity | string | undefined;
  const followActivityId = typeof obj === "string" ? obj : obj?.id;
  if (!followActivityId) return;

  const follow = await getFollowByActivityId(db, followActivityId);
  if (!follow) return;

  // Only the followed actor may reject the follow.
  const actorId = typeof activity.actor === "string" ? activity.actor : activity.actor.id;
  if (actorId !== follow.targetId) return;

  await updateFollowState(db, follow.id, "rejected");
  await createNotification(db, {
    id: generateId(),
    type: "follow_reject",
    accountId: actorId,
    targetAccountId: follow.actorId,
  });
}

async function handleUndo(activity: APActivity, ctx: InboxContext): Promise<void> {
  const { db } = ctx;
  const obj = activity.object as { type?: string; actor?: string | { id: string }; object?: string | { id: string } } | undefined;
  if (!obj || typeof obj !== "object") return;

  if (obj.type === "Follow") {
    const actorId = typeof activity.actor === "string" ? activity.actor : activity.actor.id;
    const innerActorId = typeof obj.actor === "string" ? obj.actor : obj.actor?.id;
    // The Undo must be signed by the follower who created the Follow.
    if (!innerActorId || innerActorId !== actorId) return;

    const targetId = typeof obj.object === "string" ? obj.object : obj.object?.id;
    if (targetId) {
      const follow = await getFollow(db, actorId, targetId);
      if (!follow) return;
      await deleteFollow(db, actorId, targetId);
      await updateActorCounts(db, actorId, { followingCount: -1 });
      await updateActorCounts(db, targetId, { followersCount: -1 });
    }
  }
}

async function handleDelete(activity: APActivity, ctx: InboxContext): Promise<void> {
  const { db } = ctx;
  const actorId = typeof activity.actor === "string" ? activity.actor : activity.actor.id;
  const objectId = typeof activity.object === "string" ? activity.object : (activity.object as { id?: string })?.id;
  if (!objectId) return;
  // Only the author may delete their own object.
  try {
    await db.prepare("DELETE FROM objects WHERE id = ? AND actor_id = ?").bind(objectId, actorId).run();
  } catch { /* ignore */ }
}

async function handleCreate(activity: APActivity, ctx: InboxContext): Promise<void> {
  const { db } = ctx;
  const object = activity.object as { id?: string; type?: string; content?: string; published?: string; attributedTo?: string };
  if (!object.id || object.type !== "Note") {
    console.log(`[inbox] Skipping Create with non-Note object type: ${object.type}`);
    return;
  }

  const actorId = typeof activity.actor === "string" ? activity.actor : activity.actor?.id;
  if (!actorId) return;

  if (object.attributedTo && object.attributedTo !== actorId) {
    console.log(`[inbox] Create Note attributedTo mismatch: ${object.attributedTo} !== ${actorId}`);
    return;
  }

  try {
    await db
      .prepare("INSERT OR IGNORE INTO objects (id, type, actor_id, content, published, is_local, raw, updated_at) VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')), 0, ?, datetime('now'))")
      .bind(object.id, "Note", actorId, object.content ?? null, object.published ?? null, JSON.stringify(object))
      .run();
  } catch (err) {
    console.error("[inbox] Failed to store remote Note:", err);
  }
}

async function handleUpdate(activity: APActivity, ctx: InboxContext): Promise<void> {
  const { db } = ctx;
  const object = activity.object as { id?: string; content?: string; published?: string };
  const actorId = typeof activity.actor === "string" ? activity.actor : activity.actor?.id;
  if (object?.id && actorId) {
    try {
      await db
        .prepare("UPDATE objects SET content = COALESCE(?, content), raw = ?, updated_at = datetime('now') WHERE id = ? AND actor_id = ?")
        .bind(object.content ?? null, JSON.stringify(object), object.id, actorId)
        .run();
    } catch { /* ignore */ }
  }
}

/** Resolve a remote actor's inbox, using the cache first and a signed fetch as fallback. */
async function fetchActorInbox(
  db: D1Database,
  actorId: string,
  signingKey?: LocalSigningKey | null
): Promise<string | null> {
  const cached = await getActorById(db, actorId);
  if (cached?.inbox) return cached.inbox;
  try {
    const fetched = (await fetchRemoteObject(
      actorId,
      signingKey ? `${signingKey.id}#main-key` : undefined,
      signingKey?.privateKeyPem
    )) as APActor | null;
    if (fetched?.inbox) {
      await cacheRemoteActor(db, fetched);
      return fetched.inbox;
    }
  } catch { /* ignore */ }
  return null;
}
