import type { APActivity } from "@/lib/types";
import {
  getActorById, createFollow, updateFollowState, deleteFollow,
  updateActorCounts, createNotification, getFollowByActivityId, getFollow
} from "@/lib/db";
import { buildAccept, generateId, buildFollow as buildFollowActivity } from "./utils";
import { deliverToInbox } from "./federation";

interface InboxContext {
  db: D1Database;
  baseUrl: string;
  recipient?: { id: string; username: string; privateKeyPem: string };
  signingKey?: { id: string; privateKeyPem: string };
}

export async function processInboxActivity(
  activity: APActivity,
  ctx: InboxContext
): Promise<void> {
  const { db, baseUrl, recipient, signingKey } = ctx;

  switch (activity.type) {
    case "Follow":
      await handleFollow(activity, db, baseUrl, recipient, signingKey);
      break;
    case "Accept":
      await handleAccept(activity, db);
      break;
    case "Reject":
      await handleReject(activity, db);
      break;
    case "Undo":
      await handleUndo(activity, db);
      break;
    case "Delete":
      await handleDelete(activity, db);
      break;
    case "Create":
      await handleCreate(activity, db);
      break;
    case "Update":
      await handleUpdate(activity, db);
      break;
    default:
      console.log(`[inbox] Unhandled activity type: ${activity.type}`);
  }
}

async function handleFollow(
  activity: APActivity,
  db: D1Database,
  baseUrl: string,
  recipient?: { id: string; username: string; privateKeyPem: string },
  signingKey?: { id: string; privateKeyPem: string }
): Promise<void> {
  const actorId = typeof activity.actor === "string" ? activity.actor : activity.actor.id;
  const targetId = typeof activity.object === "string" ? activity.object : (activity.object as { id?: string })?.id;

  if (!actorId || !targetId) return;

  // Check if the target is local
  const target = await getActorById(db, targetId);
  if (target && target.isLocal && target.privateKeyPem) {
    // Auto-accept local follows
    const followId = generateId();
    const existingFollow = await getFollow(db, actorId, targetId);
    if (existingFollow) return;

    await createFollow(db, {
      id: followId,
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

    // Send Accept
    const acceptId = generateId();
    const acceptActivity = buildAccept(baseUrl, targetId, activity, acceptId);

    if (signingKey?.privateKeyPem) {
      await deliverToInbox(actorId, acceptActivity, `${signingKey.id}#main-key`, signingKey.privateKeyPem);
    }
  } else {
    // Store as pending for remote follow
    const followId = generateId();
    await createFollow(db, {
      id: followId,
      actorId,
      targetId,
      state: "pending",
      activityId: activity.id,
    });

    await createNotification(db, {
      id: generateId(),
      type: "follow",
      accountId: actorId,
      targetAccountId: targetId,
    });
  }
}

async function handleAccept(
  activity: APActivity,
  db: D1Database
): Promise<void> {
  const object = activity.object as APActivity;
  const followActivityId = object.id;
  if (!followActivityId) return;

  const follow = await getFollowByActivityId(db, followActivityId);
  if (!follow) return;

  await updateFollowState(db, follow.id, "accepted");

  const actorId = typeof activity.actor === "string" ? activity.actor : activity.actor.id;
  if (actorId) {
    await updateActorCounts(db, follow.actorId, { followingCount: 1 });
    await createNotification(db, {
      id: generateId(),
      type: "follow_accept",
      accountId: actorId,
      targetAccountId: follow.actorId,
    });
  }
}

async function handleReject(activity: APActivity, db: D1Database): Promise<void> {
  const object = activity.object as APActivity;
  const followActivityId = object.id;
  if (!followActivityId) return;

  const follow = await getFollowByActivityId(db, followActivityId);
  if (!follow) return;

  await updateFollowState(db, follow.id, "rejected");
}

async function handleUndo(activity: APActivity, db: D1Database): Promise<void> {
  const object = activity.object as { type?: string; actor?: string | { id: string }; object?: string | { id: string } };

  if (object.type === "Follow") {
    const actorId = typeof object.actor === "string" ? object.actor : object.actor?.id;
    const targetId = typeof object.object === "string" ? object.object : object.object?.id;
    if (actorId && targetId) {
      const follow = await getFollow(db, actorId, targetId);
      if (follow) {
        await deleteFollow(db, actorId, targetId);
        await updateActorCounts(db, actorId, { followingCount: -1 });
        await updateActorCounts(db, targetId, { followersCount: -1 });
      }
    }
  }
}

async function handleDelete(activity: APActivity, db: D1Database): Promise<void> {
  const objectId = typeof activity.object === "string" ? activity.object : (activity.object as { id?: string })?.id;
  if (objectId) {
    try { await db.prepare("DELETE FROM objects WHERE id = ?").bind(objectId).run(); } catch { /* ignore */ }
  }
}

async function handleCreate(activity: APActivity, db: D1Database): Promise<void> {
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

async function handleUpdate(activity: APActivity, db: D1Database): Promise<void> {
  const object = activity.object as { id?: string; content?: string; published?: string };
  if (object.id) {
    try {
      await db
        .prepare("UPDATE objects SET content = COALESCE(?, content), raw = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(object.content ?? null, JSON.stringify(object), object.id)
        .run();
    } catch { /* ignore */ }
  }
}
