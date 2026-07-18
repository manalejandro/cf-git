import { getCloudflareContext, json, badRequest, unauthorized, activityJson } from "@/lib/cf";
import { getReposByActor, createRepo, getActorById, createObject, createActivity, getFollowerIds, getRepoByName, updateRepoLastSync, updateRepoSize, createCommit } from "@/lib/db";
import { getSessionActor } from "@/lib/auth";
import { generateId, buildRepoNote, buildCreate, repoIRI, actorIRI, followersIRI, keyIRI } from "@/lib/activitypub/utils";
import { enqueueDeliveries } from "@/lib/activitypub/queue";
import { collectFollowerInboxes } from "@/lib/activitypub/federation";
import { PUBLIC_ADDRESS } from "@/lib/activitypub/vocab";
import { GitStore } from "@/lib/git/store";
import { fetchExternalRepo } from "@/lib/git/fetch";
import type { CommitMeta } from "@/lib/git/packfile";

export async function GET(request: Request) {
  const { env } = getCloudflareContext();
  const auth = env.DB;

  const token = getBearerToken(request);
  if (!token) return unauthorized();
  const actor = await getSessionActor(auth, token);
  if (!actor) return unauthorized();

  const repos = await getReposByActor(auth, actor.id);
  return json(repos);
}

export async function POST(request: Request) {
  const { env } = getCloudflareContext();
  const db = env.DB;

  const token = getBearerToken(request);
  if (!token) return unauthorized();
  const actor = await getSessionActor(db, token);
  if (!actor) return unauthorized();

  const body = await request.json() as Record<string, unknown>;
  const name = (body.name as string)?.trim();
  if (!name) return badRequest("Repository name is required");
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(name)) {
    return badRequest("Name must be alphanumeric with hyphens/underscores, 1-100 characters");
  }

  const actorObj = await getActorById(db, actor.id);
  if (!actorObj) return unauthorized();

  const description = (body.description as string) ?? null;
  const isPrivate = body.isPrivate ? 1 : 0;
  const isExternal = body.isExternal ? 1 : 0;
  const externalUrl = (body.externalUrl as string) ?? null;
  const cloneUrl = (body.cloneUrl as string) ?? null;

  const existing = await getRepoByName(db, actor.id, name);
  if (existing) return badRequest("You already have a repository with this name");

  const repoId = generateId();
  const repoObjId = generateId();
  const baseUrl = env.INSTANCE_URL;
  const username = actor.username;

  // For external repos, try fetching remote data before creating DB entry
  let fetchedSize = 0;
  let fetchedCommits: { sha: string; meta: CommitMeta }[] = [];
  if (isExternal && externalUrl) {
    const store = new GitStore(env.GIT, repoId);
    await store.ensureInitialized();
    const fetchResult = await fetchExternalRepo(externalUrl, store);
    if (!fetchResult.ok) {
      return json({ error: `Sync failed: ${fetchResult.error}` }, 500);
    }
    if (fetchResult.sizeBytes !== undefined) {
      fetchedSize = fetchResult.sizeBytes;
    }
    if (fetchResult.commits) {
      fetchedCommits = fetchResult.commits;
    }
  }

  await createRepo(db, {
    id: repoId,
    name,
    description: description ?? undefined,
    actorId: actor.id,
    isPrivate,
    isExternal,
    externalUrl: externalUrl ?? undefined,
    cloneUrl: cloneUrl ?? undefined,
    sizeBytes: fetchedSize || undefined,
  });

  if (isExternal && externalUrl) {
    await updateRepoLastSync(db, repoId);
  }

  // Store commit metadata from external fetch
  if (fetchedCommits.length > 0) {
    for (const { sha, meta } of fetchedCommits) {
      try {
        await createCommit(db, {
          id: `${sha}_${repoId}`,
          repoId,
          sha,
          treeSha: meta.treeSha,
          parentSha: meta.parentShas[0],
          message: meta.message,
          authorName: meta.authorName,
          authorEmail: meta.authorEmail,
          authoredAt: meta.authoredAt,
          committerName: meta.committerName,
          committerEmail: meta.committerEmail,
          committedAt: meta.committedAt,
          isLocal: 0,
        });
      } catch { /* ignore duplicate */ }
    }
    try {
      await db.prepare("UPDATE repos SET commit_count = ?, updated_at = datetime('now') WHERE id = ?").bind(fetchedCommits.length, repoId).run();
    } catch { /* ignore */ }
  }

  if (!isExternal) {
    const store = new GitStore(env.GIT, repoId);
    await store.ensureInitialized();
    const commitSha = await store.initEmptyCommit(actor.username, "git@cf-git.com");
    if (commitSha) {
      const sizeBytes = await store.calculateSize();
      await updateRepoSize(db, repoId, sizeBytes);
    }
  }

  const published = new Date().toISOString();
  const note = buildRepoNote(baseUrl, repoObjId, {
    actorUsername: username,
    repoName: name,
    description: description ?? undefined,
    cloneUrl: cloneUrl ?? undefined,
    defaultBranch: "main",
    published,
  });

  await createObject(db, {
    id: note.id,
    type: "Note",
    actorId: actor.id,
    content: note.content,
    visibility: isPrivate ? "private" : "public",
    url: note.url,
    published,
    local: true,
    raw: JSON.stringify(note),
  });

  const activityId = generateId();
  const create = buildCreate(baseUrl, actor.id, note, activityId);

  await createActivity(db, {
    id: create.id,
    type: "Create",
    actorId: actor.id,
    objectId: note.id,
    toList: (create.to ?? []).join(","),
    ccList: (create.cc ?? []).join(","),
    raw: JSON.stringify(create),
    isLocal: true,
  });

    const followerIds = await getFollowerIds(db, actor.id);
  if (followerIds.length > 0) {
    const inboxes = await collectFollowerInboxes(followerIds, async (id: string) => {
      const a = await getActorById(db, id);
      if (!a || a.isLocal) return null;
      return { id: a.id, inbox: a.inbox };
    });
    if (actorObj.privateKeyPem) {
      await enqueueDeliveries(
        env.DELIVERY_QUEUE, inboxes, JSON.stringify(create),
        repoIRI(baseUrl, username, name), keyIRI(baseUrl, username), actorObj.privateKeyPem
      );
    }
  }

  await db.prepare("UPDATE actors SET repos_count = repos_count + 1, updated_at = datetime('now') WHERE id = ?").bind(actor.id).run();

  return json({
    id: repoId, name, description: description ?? null, isPrivate, isExternal,
    externalUrl: externalUrl ?? null, cloneUrl: cloneUrl ?? null,
    defaultBranch: "main", sizeBytes: 0, commitCount: 0,
    starCount: 0, forkCount: 0, lastSyncAt: null,
    published, updatedAt: published,
  }, 201);
}

function getBearerToken(request?: Request): string | null {
  const req = request ?? new Request("http://localhost");
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}
