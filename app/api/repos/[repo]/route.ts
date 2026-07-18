import { getCloudflareContext, json, badRequest, unauthorized, notFound, activityJson } from "@/lib/cf";
import { getRepoByName, getRepoById, getActorById, deleteRepo, deleteObject, getFollowerIds, getObjectsByRepo } from "@/lib/db";
import { getSessionActor } from "@/lib/auth";
import { generateId, buildDelete, repoIRI, keyIRI } from "@/lib/activitypub/utils";
import { enqueueDeliveries } from "@/lib/activitypub/queue";
import { collectFollowerInboxes } from "@/lib/activitypub/federation";
import { PUBLIC_ADDRESS } from "@/lib/activitypub/vocab";

export async function GET(request: Request, { params }: { params: Promise<{ repo: string }> }) {
  const { env } = getCloudflareContext();
  const db = env.DB;
  const { repo: repoName } = await params;

  const url = new URL(request.url);
  const actorParam = url.searchParams.get("actor");

  if (actorParam) {
    const actor = await getActorById(db, actorParam);
    if (!actor) return notFound("Actor not found");
    const repo = await getRepoByName(db, actor.id, repoName);
    if (!repo) return notFound("Repository not found");
    if (repo.isPrivate) return notFound("Repository not found");
    return json(repo);
  }

  const token = getBearerToken(request);
  if (!token) return unauthorized();
  const session = await getSessionActor(db, token);
  if (!session) return unauthorized();

  const repo = await getRepoByName(db, session.id, repoName);
  if (!repo) return notFound("Repository not found");

  return json(repo);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ repo: string }> }) {
  const { env } = getCloudflareContext();
  const db = env.DB;
  const { repo: repoName } = await params;

  const token = getBearerToken(request);
  if (!token) return unauthorized();
  const session = await getSessionActor(db, token);
  if (!session) return unauthorized();

  const repo = await getRepoByName(db, session.id, repoName);
  if (!repo) return notFound("Repository not found");
  if (repo.actorId !== session.id) return unauthorized();

  const actorObj = await getActorById(db, session.id);
  if (!actorObj) return unauthorized();

  const baseUrl = env.INSTANCE_URL;
  const deleteId = generateId();
  // Find the repo's federated object ID - either stored or look up by URL
  let objectId = repo.objectId;
  if (!objectId) {
    const { results } = await db
      .prepare("SELECT id FROM objects WHERE actor_id = ? AND type = 'Note' AND url = ?")
      .bind(session.id, `${baseUrl}/${session.username}/${repoName}`)
      .all<{ id: string }>();
    if (results.length > 0) objectId = results[0].id;
  }

  // Build and send Delete activities for each federated commit note
  const noteObjects = await getObjectsByRepo(db, session.id, repoName);
  const allDeleteActivities: { objId: string; activity: any }[] = [];
  for (const note of noteObjects) {
    try {
      const parsed = note.raw ? JSON.parse(note.raw) : null;
      const noteId = parsed?.id ?? note.id;
      allDeleteActivities.push({
        objId: note.id,
        activity: buildDelete(baseUrl, session.id, noteId, generateId()),
      });
    } catch { /* skip */ }
  }

  const followerIds = await getFollowerIds(db, session.id);
  if (followerIds.length > 0 && actorObj.privateKeyPem) {
    const inboxes = await collectFollowerInboxes(followerIds, async (id: string) => {
      const a = await getActorById(db, id);
      if (!a || a.isLocal) return null;
      return { id: a.id, inbox: a.inbox };
    });
    // Send Delete for the repo object
    const repoDelete = buildDelete(baseUrl, session.id, objectId, deleteId);
    await enqueueDeliveries(
      env.DELIVERY_QUEUE, inboxes, JSON.stringify(repoDelete),
      session.id, keyIRI(baseUrl, session.username), actorObj.privateKeyPem
    );
    // Send Delete for each commit note
    for (const { objId, activity } of allDeleteActivities) {
      await enqueueDeliveries(
        env.DELIVERY_QUEUE, inboxes, JSON.stringify(activity),
        session.id, keyIRI(baseUrl, session.username), actorObj.privateKeyPem
      );
    }
  }

  // Clean up locally
  for (const { objId } of allDeleteActivities) {
    await deleteObject(db, objId);
  }
  if (repo.objectId) {
    await deleteObject(db, repo.objectId);
  }
  await deleteRepo(db, repo.id);
  await db.prepare("UPDATE actors SET repos_count = MAX(0, repos_count - 1), updated_at = datetime('now') WHERE id = ?").bind(session.id).run();

  return json({ success: true });
}

function getBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? request.headers.get("Authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}
