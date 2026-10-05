import { GitStore } from "./store";
import { parseAndStorePack, parseCommit, CommitMeta } from "./packfile";
import { calculateRepoSize } from "./size";
import { asBodyInit } from "./protocol";

function pktLine(data: string): Uint8Array {
  const bytes = new TextEncoder().encode(data);
  const len = bytes.length + 4;
  const h = len.toString(16).padStart(4, "0");
  const hb = new TextEncoder().encode(h);
  const out = new Uint8Array(hb.length + bytes.length);
  out.set(hb);
  out.set(bytes, hb.length);
  return out;
}

function pktFlush(): Uint8Array {
  return new TextEncoder().encode("0000");
}

function parsePktLines(data: Uint8Array): string[] {
  const lines: string[] = [];
  let i = 0;
  while (i < data.length) {
    const h = new TextDecoder().decode(data.slice(i, i + 4));
    if (h === "0000") { i += 4; continue; }
    const len = parseInt(h, 16);
    if (len < 4) break;
    lines.push(new TextDecoder().decode(data.slice(i + 4, i + len)));
    i += len;
  }
  return lines;
}

interface RemoteRef {
  sha: string;
  ref: string;
  capabilities?: string;
}

function parseRefAdvert(data: Uint8Array): RemoteRef[] {
  const lines = parsePktLines(data);
  const refs: RemoteRef[] = [];
  for (const line of lines) {
    if (line.startsWith("# ")) continue;
    const parts = line.split(" ");
    if (parts.length >= 2) {
      const sha = parts[0];
      const rest = parts.slice(1).join(" ");
      const nullIdx = rest.indexOf("\0");
      if (nullIdx >= 0) {
        refs.push({ sha, ref: rest.slice(0, nullIdx).trim(), capabilities: rest.slice(nullIdx + 1) });
      } else {
        refs.push({ sha, ref: rest.trim() });
      }
    }
  }
  return refs;
}

const UA = "cf-git/1.0 (git fetch)";

async function tryFetchRefs(baseUrl: string): Promise<{ ok: boolean; data?: Uint8Array; status?: number }> {
  const url = baseUrl.replace(/\/+$/, "") + "/info/refs?service=git-upload-pack";
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/x-git-upload-pack-advertisement", "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: new Uint8Array(await res.arrayBuffer()) };
  } catch {
    return { ok: false };
  }
}

function ensureDotGit(url: string): string {
  const u = url.replace(/\/+$/, "");
  return u.endsWith(".git") ? u : u + ".git";
}

const METADATA_WALK_CONCURRENCY = 20;

/**
 * Walk commits reachable from the ref tips and return their metadata. Used to
 * backfill D1 when a previous sync stored the objects but was interrupted
 * before recording the commits (the fast path sees the objects as present).
 */
async function collectCommitMetadata(store: GitStore, wants: string[]): Promise<{ sha: string; meta: CommitMeta }[]> {
  const seen = new Set<string>();
  const queue: string[] = [...wants];
  const commits: { sha: string; meta: CommitMeta }[] = [];

  while (queue.length > 0) {
    const batch: string[] = [];
    for (const s of queue.splice(0, METADATA_WALK_CONCURRENCY)) {
      if (seen.has(s) || batch.includes(s)) continue;
      seen.add(s);
      batch.push(s);
    }
    if (batch.length === 0) continue;

    const objects = await Promise.all(batch.map((s) => store.readLoose(s)));
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      if (!obj) continue;
      if (obj.type === "commit") {
        const text = new TextDecoder().decode(obj.raw);
        commits.push({ sha: batch[i], meta: parseCommit(obj.raw) });
        for (const p of text.matchAll(/^parent ([0-9a-f]{40})/gm)) queue.push(p[1]);
      } else if (obj.type === "tag") {
        const target = new TextDecoder().decode(obj.raw).match(/^object ([0-9a-f]{40})/m);
        if (target) queue.push(target[1]);
      }
    }
  }

  return commits;
}

export interface FetchExternalRepoResult {
  ok: boolean;
  error?: string;
  /** Absolute reachable size, only returned by the metadata backfill path. */
  sizeBytes?: number;
  /** Stored bytes of the objects downloaded in this run (incremental). */
  sizeDelta?: number;
  /** True when the pack covered the whole repository (no local haves). */
  fullPack?: boolean;
  commits?: { sha: string; meta: CommitMeta }[];
  defaultBranch?: string;
}

export async function fetchExternalRepo(
  externalUrl: string,
  store: GitStore,
  options: { backfillMetadata?: boolean } = {}
): Promise<FetchExternalRepoResult> {
  try {
    const base = externalUrl.replace(/\/+$/, "");
    let refsData: Uint8Array;
    let usedBase: string;

    const r1 = await tryFetchRefs(base);
    if (r1.ok) {
      refsData = r1.data!;
      usedBase = base;
    } else {
      const withDotGit = base.endsWith(".git") ? base : base + ".git";
      const r2 = await tryFetchRefs(withDotGit);
      if (r2.ok) {
        refsData = r2.data!;
        usedBase = withDotGit;
      } else {
        return { ok: false, error: `Failed to fetch refs from ${base} (${r1.status || "timeout"}) or ${withDotGit} (${r2.status || "timeout"})` };
      }
    }

    const refs = parseRefAdvert(refsData);
    if (refs.length === 0) return { ok: false, error: "No refs found" };
    await store.writeProgress({ phase: "refs-fetched", refs: refs.length });

    const validRefs = refs.filter((r) => /^[0-9a-f]{40}$/.test(r.sha));
    const wants = validRefs.map((r) => r.sha);
    if (wants.length === 0) return { ok: false, error: "No valid refs to fetch" };

    // Default branch advertised by the remote HEAD (published after the
    // objects are stored).
    const headRef = refs.find((r) => r.ref === "HEAD" && /^[0-9a-f]{40}$/.test(r.sha));
    const defaultBranch = headRef
      ? refs.find((r) => r.ref.startsWith("refs/heads/") && r.sha === headRef.sha)?.ref.replace(/^refs\/heads\//, "")
      : undefined;

    // Capture the refs we ALREADY have before mirroring the advertised ones:
    // only objects that really exist locally may be advertised as `have`,
    // otherwise the server would consider every want satisfied and send an
    // empty pack (refs must never be treated as proof that objects exist).
    const localRefs = await store.listRefs("");
    const haveCandidates = [...new Set(localRefs.map((r) => r.sha).filter((s) => /^[0-9a-f]{40}$/.test(s)))];
    const haveExists = await Promise.all(haveCandidates.map((sha) => store.objectExists(sha)));
    const haves = haveCandidates.filter((_, i) => haveExists[i]);

    // Fast path: every wanted object already exists locally. On a normal sync
    // there is nothing else to do; when asked (interrupted previous run) the
    // commit metadata and size are collected so callers can backfill D1.
    const exists = await Promise.all(wants.map((w) => store.objectExists(w)));
    if (exists.every(Boolean)) {
      let commits: { sha: string; meta: CommitMeta }[] = [];
      let sizeBytes: number | undefined;
      if (options.backfillMetadata) {
        commits = await collectCommitMetadata(store, wants);
        sizeBytes = await calculateRepoSize(store);
        console.log(`[git-fetch] backfill: ${commits.length} commits, ${sizeBytes} bytes`);
      } else {
        console.log("[git-fetch] fast path: everything up to date");
      }
      return { ok: true, commits, sizeBytes, defaultBranch };
    }

    const commits: { sha: string; meta: CommitMeta }[] = [];
    let writtenBytes = 0;

    if (!exists.every(Boolean)) {
      console.log(`[git-fetch] downloading pack: ${wants.length} refs, ${haves.length} haves`);
      // Incremental fetch: the server sends only the objects we are missing
      // (thin pack). The pack parser can resolve REF_DELTA bases that live
      // outside the pack from the store.
      const caps = [
        "multi_ack_detailed",
        "thin-pack",
        "ofs-delta",
        "agent=cf-git/1.0",
      ];
      const capStr = caps.join(" ");
      const bodyChunks: Uint8Array[] = [];
      wants.forEach((w, i) => bodyChunks.push(pktLine(`${i === 0 ? "want" : "want"} ${w}${i === 0 ? `\x00${capStr}` : ""}\n`)));
      bodyChunks.push(pktFlush());
      for (const h of haves) bodyChunks.push(pktLine(`have ${h}\n`));
      bodyChunks.push(pktLine("done\n"));
      bodyChunks.push(pktFlush());

      const body = concatU8(bodyChunks);
      const packUrl = ensureDotGit(usedBase) + "/git-upload-pack";
      const packRes = await fetch(packUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-git-upload-pack-request",
          Accept: "application/x-git-upload-pack-result",
          "User-Agent": UA,
        },
        body: asBodyInit(body),
        signal: AbortSignal.timeout(120000),
      });
      if (!packRes.ok) return { ok: false, error: `Failed to fetch pack: ${packRes.status}` };

      let packData = new Uint8Array(await packRes.arrayBuffer());
      await store.writeProgress({ phase: "pack-downloaded", bytes: packData.byteLength });
      // Skip any pkt-line wrapper and locate the PACK data (subarray = no copy).
      const packMagic = new Uint8Array([0x50, 0x41, 0x43, 0x4b]);
      const packStart = findSequence(packData, packMagic);
      if (packStart < 0) return { ok: false, error: "No PACK data in response" };
      packData = packData.subarray(packStart);

      const parsed = await parseAndStorePack(packData, store);

      for (const obj of parsed.commits) {
        commits.push({ sha: obj.sha, meta: parseCommit(obj.raw) });
      }
      console.log(`[git-fetch] pack parsed: ${parsed.commits.length} commits, ${parsed.writtenBytes} bytes written from ${packData.byteLength} bytes`);
      writtenBytes = parsed.writtenBytes;
      await store.writeProgress({ phase: "pack-parsed", commits: parsed.commits.length, writtenBytes });
    }

    // Objects are stored (or already present): only now is it safe to publish
    // the new refs, so a failed pack can never leave refs pointing at objects
    // that do not exist. Mirror the advertised refs and propagate deletions.
    const advertised = new Set<string>();
    for (const r of refs) {
      if (r.ref === "HEAD" || r.ref.endsWith("^{}")) continue;
      if (/^[0-9a-f]{40}$/.test(r.sha)) {
        advertised.add(r.ref);
        await store.writeRef(r.ref, r.sha);
      }
    }
    for (const local of localRefs) {
      if (!advertised.has(local.ref)) await store.deleteRef(local.ref);
    }

    if (defaultBranch) await store.writeHead(`refs/heads/${defaultBranch}`);
    await store.writeProgress({ phase: "refs-mirrored", sizeDelta: writtenBytes });

    // The size is tracked incrementally from the bytes actually written: the
    // full reachability walk (~10k R2 calls) is only done by the backfill path.
    return {
      ok: true,
      commits,
      sizeDelta: writtenBytes,
      fullPack: haves.length === 0,
      defaultBranch,
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function concatU8(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const r = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { r.set(c, off); off += c.length; }
  return r;
}

function findSequence(data: Uint8Array, seq: Uint8Array): number {
  for (let i = 0; i <= data.length - seq.length; i++) {
    let match = true;
    for (let j = 0; j < seq.length; j++) {
      if (data[i + j] !== seq[j]) { match = false; break; }
    }
    if (match) return i;
  }
  return -1;
}
