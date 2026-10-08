import { json, badRequest, unauthorized } from "@/lib/cf";
import { getReposByActor, createRepo, getActorById, getRepoById, createObject, createActivity, getFollowerIds, getRepoByName, updateRepoLastSync, updateRepoSize, refreshRepoCommitCount, createCommit, createCommits } from "@/lib/db";
import { getSessionActor } from "@/lib/auth";
import { generateId, buildRepoNote, buildCreate } from "@/lib/activitypub/utils";
import { enqueueDeliveries } from "@/lib/activitypub/queue";
import { collectFollowerInboxes } from "@/lib/activitypub/federation";
import { GitStore } from "@/lib/git/store";
import { fetchExternalRepo } from "@/lib/git/fetch";
import { calculateRepoSize } from "@/lib/git/size";
import { parseCommit } from "@/lib/git/packfile";
import type { CommitMeta } from "@/lib/git/packfile";
import { env } from "cloudflare:workers";

export async function GET(request: Request) {
  const auth = env.DB;

  const token = getBearerToken(request);
  if (!token) return unauthorized();
  const actor = await getSessionActor(auth, token);
  if (!actor) return unauthorized();

  const repos = await getReposByActor(auth, actor.id);
  return json(repos);
}

export async function POST(request: Request) {
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
  let defaultBranch = "main";
  if (isExternal && externalUrl) {
    const store = new GitStore(env.GIT, repoId);
    await store.ensureInitialized();
    const fetchResult = await fetchExternalRepo(externalUrl, store, { backfillMetadata: true });
    if (!fetchResult.ok) {
      return json({ error: `Sync failed: ${fetchResult.error}` }, 500);
    }
    if (fetchResult.sizeBytes !== undefined) {
      fetchedSize = fetchResult.sizeBytes;
    } else if (fetchResult.sizeDelta !== undefined) {
      fetchedSize = fetchResult.sizeDelta;
    }
    if (fetchResult.commits) {
      fetchedCommits = fetchResult.commits;
    }
    if (fetchResult.defaultBranch) {
      defaultBranch = fetchResult.defaultBranch;
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
    defaultBranch,
    sizeBytes: fetchedSize || undefined,
  });

  if (isExternal && externalUrl) {
    await updateRepoLastSync(db, repoId);
  }

  // Store commit metadata from external fetch
  if (fetchedCommits.length > 0) {
    await createCommits(db, fetchedCommits.map(({ sha, meta }) => ({
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
    })));
    await refreshRepoCommitCount(db, repoId);
  }

  if (!isExternal) {
    const store = new GitStore(env.GIT, repoId);
    await store.ensureInitialized();
    const commitSha = await store.initEmptyCommit(actor.username, "git@cf-git.com");
    if (commitSha) {
      // Record the initial commit so the repo page/API report it.
      try {
        const obj = await store.readLoose(commitSha);
        if (obj) {
          const meta = parseCommit(obj.raw);
          await createCommit(db, {
            id: `${commitSha}_${repoId}`,
            repoId,
            sha: commitSha,
            treeSha: meta.treeSha,
            parentSha: meta.parentShas[0],
            message: meta.message,
            authorName: meta.authorName,
            authorEmail: meta.authorEmail,
            authoredAt: meta.authoredAt,
            committerName: meta.committerName,
            committerEmail: meta.committerEmail,
            committedAt: meta.committedAt,
            isLocal: 1,
          });
        }
      } catch { /* metadata is best-effort */ }
      await refreshRepoCommitCount(db, repoId);
      const sizeBytes = await calculateRepoSize(store);
      await updateRepoSize(db, repoId, sizeBytes);
    }
  }

  const published = new Date().toISOString();
  const note = buildRepoNote(baseUrl, repoObjId, {
    actorUsername: username,
    repoName: name,
    description: description ?? undefined,
    cloneUrl: cloneUrl ?? undefined,
    defaultBranch,
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

  // Store the object ID on the repo so we can send a Delete later
  await db.prepare("UPDATE repos SET object_id = ? WHERE id = ?").bind(note.id, repoId).run();

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
        actor.id, `${actor.id}#main-key`, actorObj.privateKeyPem
      );
    }
  }

  await db.prepare("UPDATE actors SET repos_count = repos_count + 1, updated_at = datetime('now') WHERE id = ?").bind(actor.id).run();

  // Return the persisted row so size/commit count/branch are accurate.
  const created = await getRepoById(db, repoId);
  return json(created ?? {
    id: repoId, name, description: description ?? null, isPrivate, isExternal,
    externalUrl: externalUrl ?? null, cloneUrl: cloneUrl ?? null,
    defaultBranch, sizeBytes: fetchedSize, commitCount: fetchedCommits.length,
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
