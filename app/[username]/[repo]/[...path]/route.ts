import { getCloudflareContext, json, unauthorized, notFound } from "@/lib/cf";
import { getRepoByName, getActorByUsername, createObject, createActivity, getFollowerIds, getActorById } from "@/lib/db";
import { getSessionActor } from "@/lib/auth";
import { GitStore } from "@/lib/git/store";
import { pktLine, pktFlush, parsePktLines, encodeRefAdvert } from "@/lib/git/protocol";
import { generatePackBuffer, parseAndStorePack, parseCommit, CommitMeta } from "@/lib/git/packfile";
import { generateId, buildRepoNote, buildCreate, repoIRI, actorIRI, followersIRI, keyIRI } from "@/lib/activitypub/utils";
import { enqueueDeliveries } from "@/lib/activitypub/queue";
import { collectFollowerInboxes } from "@/lib/activitypub/federation";

function concatU8(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const r = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { r.set(c, off); off += c.length; }
  return r;
}

function getBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? request.headers.get("Authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

async function resolveUserRepo(
  username: string, repoParam: string, hostname: string, db: D1Database
) {
  const repoName = repoParam.replace(/\.git$/i, "");
  const actor = await getActorByUsername(db, username, hostname);
  if (!actor) return null;
  const repo = await getRepoByName(db, actor.id, repoName);
  if (!repo) return null;
  return { repoName, actor, repo };
}

// ─── Upload Pack (clone/fetch) ─────────────────────

async function handleUploadPackRefs(
  store: GitStore
): Promise<Response> {
  const allRefs = await store.listRefs("");
  const refs: { ref: string; sha: string }[] = [];
  for (const r of allRefs) {
    try {
      if (await store.objectExists(r.sha)) {
        refs.push(r);
      }
    } catch {
      // skip refs whose objects can't be checked
    }
  }
  const caps = ["multi_ack_detailed", "thin-pack", "ofs-delta", "agent=cf-git/1.0"];
  const chunks = encodeRefAdvert(refs, "git-upload-pack", caps);

  return new Response(concatU8(chunks), {
    headers: {
      "Content-Type": "application/x-git-upload-pack-advertisement",
      "Cache-Control": "no-cache",

    },
  });
}

async function handleUploadPack(request: Request, store: GitStore): Promise<Response> {
  const body = new Uint8Array(await request.arrayBuffer());
  const pktLines = parsePktLines(body);
  const wants: string[] = [];
  const haves: string[] = [];
  for (const line of pktLines) {
    if (line === "0000") continue;
    const trimmed = line.replace(/\n$/, "").replace(/\0.*$/, "");
    if (trimmed.startsWith("want ")) wants.push(trimmed.split(" ")[1].slice(0, 40));
    if (trimmed.startsWith("have ")) haves.push(trimmed.split(" ")[1].slice(0, 40));
    if (trimmed === "done" || trimmed === "0000") break;
  }

  // Validate all wants exist before generating pack
  const validWants: string[] = [];
  for (const w of wants) {
    if (await store.objectExists(w)) {
      validWants.push(w);
    }
  }
  if (validWants.length === 0) {
    const caps = ["multi_ack_detailed", "thin-pack", "ofs-delta", "agent=cf-git/1.0"];
    const refs = await store.listRefs("");
    const chunks = encodeRefAdvert(refs, "git-upload-pack", caps);
    return new Response(concatU8(chunks), {
      headers: {
        "Content-Type": "application/x-git-upload-pack-advertisement",
        "Cache-Control": "no-cache",
      },
    });
  }

  const packData = await generatePackBuffer(store, validWants, haves);
  const chunks: Uint8Array[] = [];
  if (haves.length === 0) {
    chunks.push(pktLine("NAK\n"));
  }
  chunks.push(pktFlush());
  chunks.push(packData);
  const response = concatU8(chunks);

  return new Response(response, {
    headers: {
      "Content-Type": "application/x-git-upload-pack-result",
      "Cache-Control": "no-cache",
    },
  });
}

// ─── Receive Pack (push) ───────────────────────────

async function handleReceivePackRefs(
  store: GitStore, db: D1Database, request: Request, repo: any
): Promise<Response> {
  const token = getBearerToken(request);
  if (!token) return unauthorized();
  const session = await getSessionActor(db, token);
  if (!session || session.id !== repo.actorId) return unauthorized();

  const allRefs = await store.listRefs("");
  const refs: { ref: string; sha: string }[] = [];
  for (const r of allRefs) {
    if (await store.objectExists(r.sha)) {
      refs.push(r);
    }
  }
  const caps = ["report-status", "delete-refs", "quiet", "agent=cf-git/1.0"];
  const chunks = encodeRefAdvert(refs, "git-receive-pack", caps);

  return new Response(concatU8(chunks), {
    headers: {
      "Content-Type": "application/x-git-receive-pack-advertisement",
      "Cache-Control": "no-cache",
    },
  });
}

async function handleReceivePack(
  request: Request, store: GitStore, db: D1Database, repo: any, repoName: string, actor: any, env: any, username: string
): Promise<Response> {
  const token = getBearerToken(request);
  if (!token) return unauthorized();
  const session = await getSessionActor(db, token);
  if (!session || session.id !== repo.actorId) return unauthorized();

  const data = new Uint8Array(await request.arrayBuffer());
  const { commands, packData } = extractCommands(data);

  const objects = await parseAndStorePack(packData, store);

  // Update refs in R2
  for (const cmd of commands) {
    if (cmd.newSha === "0000000000000000000000000000000000000000") {
      await store.deleteRef(cmd.ref);
    } else {
      await store.writeRef(cmd.ref, cmd.newSha);
    }
  }

  // Update size in D1
  try {
    const sizeBytes = await store.calculateSize();
    await db.prepare("UPDATE repos SET size_bytes = ?, updated_at = datetime('now') WHERE id = ?").bind(sizeBytes, repo.id).run();
  } catch { /* ignore */ }

  // Update D1 metadata
  const commits: { sha: string; meta: CommitMeta }[] = [];
  for (const obj of objects) {
    if (obj.type !== "commit") continue;
    const meta = parseCommit(obj.raw);
    commits.push({ sha: obj.sha, meta });
    try {
      await db.prepare(
        `INSERT OR IGNORE INTO repo_commits (id, repo_id, sha, tree_sha, parent_sha, message, author_name, author_email, authored_at, committer_name, committer_email, committed_at, is_local)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
      ).bind(
        `${obj.sha}_${repo.id}`, repo.id,
        obj.sha, meta.treeSha,
        meta.parentShas[0] || null, meta.message,
        meta.authorName, meta.authorEmail, meta.authoredAt,
        meta.committerName, meta.committerEmail, meta.committedAt
      ).run();
    } catch { /* ignore */ }
  }

  if (commits.length > 0) {
    try {
      await db.prepare(
        "UPDATE repos SET commit_count = commit_count + ?, updated_at = datetime('now') WHERE id = ?"
      ).bind(commits.length, repo.id).run();
    } catch { /* ignore */ }
  }

  // Federation: create ActivityPub objects and deliver
  if (commits.length > 0) {
    await federatePush(db, env, actor, repo, repoName, username, commits);
  }

  const reportLines = commands.map(c => `ok ${c.ref}`);
  const response = concatU8([
    ...reportLines.map(l => pktLine(`${l}\n`)),
    pktFlush(),
  ]);

  return new Response(response, {
    headers: {
      "Content-Type": "application/x-git-receive-pack-result",
      "Cache-Control": "no-cache",
    },
  });
}

function extractCommands(data: Uint8Array): {
  commands: { ref: string; oldSha: string; newSha: string }[];
  packData: Uint8Array;
} {
  let pos = 0;
  const commands: { ref: string; oldSha: string; newSha: string }[] = [];

  while (pos + 4 <= data.length) {
    const hexLen = new TextDecoder().decode(data.slice(pos, pos + 4));
    if (hexLen === "0000") { pos += 4; break; }
    const len = parseInt(hexLen, 16);
    if (len <= 4 || pos + len > data.length) break;
    const line = new TextDecoder().decode(data.slice(pos + 4, pos + len)).trim();
    pos += len;
    if (line.includes(" ")) {
      const parts = line.split(" ");
      if (parts.length >= 3) {
        const ref = parts[2].replace(/\0.*$/, "").trim();
        commands.push({ oldSha: parts[0], newSha: parts[1], ref });
      }
    }
  }

  return { commands, packData: data.slice(pos) };
}

// ─── Federation ─────────────────────────────────────

async function federatePush(
  db: D1Database, env: any, actor: any, repo: any,
  repoName: string, username: string,
  commits: { sha: string; meta: CommitMeta }[]
): Promise<void> {
  const baseUrl = env.INSTANCE_URL;

  for (const { sha, meta } of commits) {
    const objId = generateId();
    const firstLine = meta.message.split("\n")[0];
    const commitUrl = `${baseUrl}/${username}/${repoName}/-/commit/${sha}`;
    const content = `[${sha.slice(0, 7)}] ${firstLine}\n\n${meta.message}`;

    const note = buildRepoNote(baseUrl, objId, {
      actorUsername: username,
      repoName,
      repoDescription: undefined,
      cloneUrl: `${baseUrl}/${username}/${repoName}.git`,
      defaultBranch: "main",
      published: new Date().toISOString(),
    });
    note.content = content;
    note.url = commitUrl;

    try {
      await createObject(db, {
        id: objId,
        type: "Note",
        actorId: actor.id,
        content,
        visibility: "public",
        url: commitUrl,
        published: new Date().toISOString(),
        local: true,
        raw: JSON.stringify(note),
      });
    } catch { /* ignore */ }

    const activityId = generateId();
    const create = buildCreate(baseUrl, actor.id, note, activityId);

    try {
      await createActivity(db, {
        id: create.id,
        type: "Create",
        actorId: actor.id,
        objectId: objId,
        toList: (create.to ?? []).join(","),
        ccList: (create.cc ?? []).join(","),
        raw: JSON.stringify(create),
        isLocal: true,
      });
    } catch { /* ignore */ }

    // Deliver to followers
    try {
      const followerIds = await getFollowerIds(db, actor.id);
      if (followerIds.length > 0) {
        const inboxes = await collectFollowerInboxes(followerIds, (id: string) =>
          getActorById(db, id).then((a) => a ? { id: a.id, inbox: a.inbox } : null)
        );
        if (actor.privateKeyPem) {
          await enqueueDeliveries(
            env.DELIVERY_QUEUE, inboxes, JSON.stringify(create),
            repoIRI(baseUrl, username, repoName), keyIRI(baseUrl, username), actor.privateKeyPem
          );
        }
      }
    } catch { /* ignore */ }
  }
}

// ─── Route handlers ────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string; repo: string; path: string[] }> }
) {
  const { env } = getCloudflareContext();
  const db = env.DB;
  const { username, repo: repoParam, path } = await params;

  const resolved = await resolveUserRepo(username, repoParam, new URL(request.url).hostname, db);
  if (!resolved) return notFound("Repository not found");
  const { repoName, repo } = resolved;
  const store = new GitStore(env.GIT, repo.id);
  await store.ensureInitialized();

  const pathStr = path?.join("/");

  if (pathStr === "info/refs") {
    const url = new URL(request.url);
    const service = url.searchParams.get("service");
    if (service === "git-upload-pack") return handleUploadPackRefs(store);
    if (service === "git-receive-pack") return handleReceivePackRefs(store, db, request, repo);
    return handleUploadPackRefs(store);
  }

  return notFound("Not found");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ username: string; repo: string; path: string[] }> }
) {
  const { env } = getCloudflareContext();
  const db = env.DB;
  const { username, repo: repoParam, path } = await params;

  const resolved = await resolveUserRepo(username, repoParam, new URL(request.url).hostname, db);
  if (!resolved) return notFound("Repository not found");
  const { repoName, repo, actor } = resolved;
  const store = new GitStore(env.GIT, repo.id);
  await store.ensureInitialized();

  const pathStr = path?.join("/");

  if (pathStr === "git-upload-pack") return handleUploadPack(request, store);
  if (pathStr === "git-receive-pack") return handleReceivePack(request, store, db, repo, repoName, actor, env, username);

  return notFound("Not found");
}
