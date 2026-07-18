import { getCloudflareContext, json, badRequest, unauthorized, notFound, activityJson } from "@/lib/cf";
import { getRepoByName, getRepoById, getActorById, deleteRepo, deleteObject, getFollowerIds } from "@/lib/db";
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
  const objectId = repo.objectId ?? repoIRI(baseUrl, session.username, repoName);
  const deleteActivity = buildDelete(baseUrl, session.id, objectId, deleteId);

  const followerIds = await getFollowerIds(db, session.id);
  if (followerIds.length > 0 && actorObj.privateKeyPem) {
    const inboxes = await collectFollowerInboxes(followerIds, async (id: string) => {
      const a = await getActorById(db, id);
      if (!a || a.isLocal) return null;
      return { id: a.id, inbox: a.inbox };
    });
    await enqueueDeliveries(
      env.DELIVERY_QUEUE, inboxes, JSON.stringify(deleteActivity),
      session.id, keyIRI(baseUrl, session.username), actorObj.privateKeyPem
    );
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
