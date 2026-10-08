import type { MessageBatch } from "@cloudflare/workers-types";
import handler from "vinext/server/fetch-handler";
import { postToInboxSigned, validateOutboundUrl } from "@/lib/activitypub/federation";
import type { APDeliveryMessage } from "@/lib/activitypub/queue";
import { getReposForSync, updateRepoLastSync, updateRepoSize, updateRepoDefaultBranch, refreshRepoCommitCount, getActorByUsername, getRepoByName, createCommits } from "@/lib/db";
import { GitStore } from "@/lib/git/store";
import { fetchExternalRepo } from "@/lib/git/fetch";
import { pktLine, pktFlush, parsePktLines, asBodyInit } from "@/lib/git/protocol";
import { createPackResponseStream } from "@/lib/git/packfile";

const PERMANENT_ERRORS = new Set([400, 401, 403, 404, 410, 422]);

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  DELIVERY_QUEUE: Queue;
  GIT: R2Bucket;
  INSTANCE_URL: string;
  [key: string]: unknown;
}

/** `Retry-After` in seconds (both delta-seconds and HTTP-date forms). */
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(Math.ceil(seconds), 86_400);
  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    return Math.max(0, Math.min(Math.ceil((date - Date.now()) / 1000), 86_400));
  }
  return null;
}

async function deliverOne(
  inboxUrl: string,
  activityJson: string,
  actorId: string,
  env: Env
): Promise<{ ok: boolean; permanent: boolean; status: number; retryAfter?: number }> {
  // SSRF guard: inbox URLs originate from remote actor documents / user input.
  const validation = validateOutboundUrl(inboxUrl);
  if (!validation.valid) {
    console.warn(`[worker] Blocked delivery to ${inboxUrl}: ${validation.reason}`);
    return { ok: false, permanent: true, status: 0 };
  }

  const row = await env.DB
    .prepare("SELECT private_key_pem FROM actors WHERE id = ? AND is_local = 1")
    .bind(actorId)
    .first<{ private_key_pem: string }>();
  if (!row?.private_key_pem) return { ok: false, permanent: true, status: 0 };

  const keyId = `${actorId}#main-key`;

  try {
    // Signed POST (safeFetch re-validates redirect hops and bounds the
    // timeout): draft-cavage first, retrying with RFC 9421 on 400/401.
    const res = await postToInboxSigned(inboxUrl, activityJson, keyId, row.private_key_pem, 15_000);
    if (!res) return { ok: false, permanent: true, status: 0 };
    await res.body?.cancel().catch(() => {});
    return {
      ok: res.ok,
      permanent: PERMANENT_ERRORS.has(res.status),
      status: res.status,
      retryAfter: parseRetryAfter(res.headers.get("Retry-After")) ?? undefined,
    };
  } catch {
    return { ok: false, permanent: false, status: 0 };
  }
}

async function handleCron(env: Env): Promise<void> {
  console.log("[cron] Starting external repo sync...");
  try {
    const repos = await getReposForSync(env.DB);
    for (const repo of repos) {
      if (!repo.externalUrl) continue;
      try {
        console.log(`[cron] Syncing repo: ${repo.id} from ${repo.externalUrl}`);
        const store = new GitStore(env.GIT, repo.id);
        await store.ensureInitialized();
        const result = await fetchExternalRepo(repo.externalUrl, store, { backfillMetadata: repo.commitCount === 0 });
        if (result.ok) {
          if (result.defaultBranch && result.defaultBranch !== repo.defaultBranch) {
            await updateRepoDefaultBranch(env.DB, repo.id, result.defaultBranch);
          }
          if (result.sizeBytes !== undefined) {
            await updateRepoSize(env.DB, repo.id, result.sizeBytes);
          } else if (result.sizeDelta !== undefined) {
            const base = result.fullPack ? 0 : repo.sizeBytes;
            await updateRepoSize(env.DB, repo.id, base + result.sizeDelta);
          }
          if (result.commits && result.commits.length > 0) {
            await createCommits(env.DB, result.commits.map(({ sha, meta }) => ({
              id: `${sha}_${repo.id}`,
              repoId: repo.id,
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
          }
          // Recompute instead of incrementing: re-fetched commits are skipped
          // by INSERT OR IGNORE and used to inflate the counter.
          const commits = await refreshRepoCommitCount(env.DB, repo.id);
          // Only mark the sync as done once everything above succeeded.
          await updateRepoLastSync(env.DB, repo.id);
          console.log(`[cron] Synced repo ${repo.id}: ${result.commits?.length ?? 0} new commits in pack, ${commits} total`);
        } else {
          console.error(`[cron] Failed to sync repo ${repo.id}: ${result.error}`);
        }
      } catch (err) {
        console.error(`[cron] Failed to sync repo ${repo.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[cron] Error:", err);
  }
}

const GIT_URL_RE = /^\/([^\/]+)\/([^\/]+?)(?:\.git)?\/(info\/refs|git-upload-pack|git-receive-pack)(?:\/.*)?$/;

function concatU8(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const r = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { r.set(c, off); off += c.length; }
  return r;
}

async function handleGitRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const m = url.pathname.match(GIT_URL_RE);
  if (!m) return null;

  const username = m[1];
  const repoParam = m[2];
  const gitPath = m[3];
  const repoName = repoParam.replace(/\.git$/i, "");

  const actor = await getActorByUsername(env.DB, username, url.hostname);
  if (!actor) return null;
  const repo = await getRepoByName(env.DB, actor.id, repoName);
  if (!repo) return null;
  // Private repositories are served by the Next.js route, which enforces auth.
  if (repo.isPrivate) return null;

  const store = new GitStore(env.GIT, repo.id);
  await store.ensureInitialized();

  if (request.method === "GET") {
    if (gitPath === "info/refs") {
      const service = url.searchParams.get("service") || "git-upload-pack";
      if (service === "git-upload-pack") {
        const allRefs = await store.listRefs("");
        const refs: { ref: string; sha: string }[] = [];
        for (const r of allRefs) {
          try {
            if (await store.objectExists(r.sha)) {
              refs.push(r);
            }
          } catch { /* skip */ }
        }
        // Include HEAD so git knows which branch to checkout
        const headTarget = await store.readHeadSymref();
        let headSha: string | null = null;
        if (headTarget) {
          const match = refs.find(r => r.ref === headTarget);
          if (match) headSha = match.sha;
        }
        if (headSha && refs.every(r => r.ref !== "HEAD")) {
          refs.unshift({ ref: "HEAD", sha: headSha });
        }
        const caps = ["multi_ack_detailed", "thin-pack", "ofs-delta", "agent=cf-git/1.0", ...(headTarget ? [`symref=HEAD:${headTarget}`] : [])];
        const chunks: Uint8Array[] = [];

        // Build raw bytes for ref advertisement, bypassing pktLine to avoid any string encoding issues
        function rawPktLen(dataLen: number): Uint8Array {
          const s = (dataLen + 4).toString(16).padStart(4, "0");
          return new TextEncoder().encode(s);
        }

        // First line: # service=git-upload-pack
        { const s = "# service=git-upload-pack\n"; const enc = new TextEncoder().encode(s); const h = rawPktLen(enc.length); const buf = new Uint8Array(4 + enc.length); buf.set(h); buf.set(enc, 4); chunks.push(buf); }
        // Flush
        chunks.push(new TextEncoder().encode("0000"));

        // Capabilities string (null byte + space-separated caps)
        const capStr = "\x00" + caps.join(" ");
        const capEnc = new TextEncoder().encode(capStr);

        // Build ref lines with raw byte arrays
        refs.forEach((r, i) => {
          const shaEnc = new TextEncoder().encode(r.sha);
          const spaceEnc = new TextEncoder().encode(" ");
          const refEnc = new TextEncoder().encode(r.ref);
          const nlEnc = new TextEncoder().encode("\n");
          let contentLen: number;
          let parts: Uint8Array[];
          if (i === 0) {
            contentLen = shaEnc.length + spaceEnc.length + refEnc.length + capEnc.length + nlEnc.length;
            parts = [shaEnc, spaceEnc, refEnc, capEnc, nlEnc];
          } else {
            contentLen = shaEnc.length + spaceEnc.length + refEnc.length + nlEnc.length;
            parts = [shaEnc, spaceEnc, refEnc, nlEnc];
          }
          const header = rawPktLen(contentLen);
          const buf = new Uint8Array(4 + contentLen);
          buf.set(header);
          let offset = 4;
          for (const p of parts) { buf.set(p, offset); offset += p.length; }
          chunks.push(buf);
        });
        // Final flush
        chunks.push(new TextEncoder().encode("0000"));

        const body = concatU8(chunks);

        return new Response(asBodyInit(body), {
          headers: {
            "Content-Type": "application/x-git-upload-pack-advertisement",
            "Cache-Control": "no-cache",
            "X-Git-Version": "cf-git/1.0",
          },
        });
      }
    }
  }

  if (request.method === "POST") {
    if (gitPath === "git-upload-pack") {
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

      const validWants: string[] = [];
      for (const w of wants) {
        if (await store.objectExists(w)) validWants.push(w);
      }
      if (validWants.length === 0) {
        return new Response("No valid objects", { status: 400 });
      }

      const prefix = haves.length === 0 ? pktLine("NAK\n") : pktFlush();
      const stream = createPackResponseStream(store, validWants, haves, prefix);
      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-git-upload-pack-result",
          "Cache-Control": "no-cache",
          "X-Git-Handler": "worker-upload-pack",
        },
      });
    }
  }

  return null;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/__health") {
      return new Response("OK", { status: 200 });
    }

    if (url.pathname === "/__version") {
      return new Response("cf-git/1.0", { headers: { "Content-Type": "text/plain" } });
    }

    // Handle Git smart protocol requests directly (bypass the framework to preserve binary response)
    const gitResp = await handleGitRequest(request, env);
    if (gitResp) return gitResp;

    return handler.fetch(request, env, ctx);
  },

  // Cloudflare Cron Trigger handler: the [triggers] crons entry in wrangler.toml
  // invokes this export directly.
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    console.log(`[cron] scheduled trigger fired (${controller.cron})`);
    await handleCron(env);
  },

  async queue(batch: MessageBatch<APDeliveryMessage>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      const body = msg.body;
      if (!body) { msg.ack(); continue; }
      const { type, inboxUrl, activityJson, actorId } = body;
      if (type !== "delivery") { msg.ack(); continue; }
      try {
        const { ok, permanent, retryAfter } = await deliverOne(inboxUrl, activityJson, actorId, env);
        if (ok || permanent) msg.ack();
        else if (msg.attempts < 3) msg.retry({ delaySeconds: retryAfter ?? 60 });
        else msg.ack();
      } catch {
        if (msg.attempts < 3) msg.retry({ delaySeconds: 60 });
        else msg.ack();
      }
    }
  },
};

export default worker;
