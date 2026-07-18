import { GitStore } from "./store";
import { parseAndStorePack, parseCommit, CommitMeta } from "./packfile";

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
        refs.push({ sha, ref: rest.slice(0, nullIdx), capabilities: rest.slice(nullIdx + 1) });
      } else {
        refs.push({ sha, ref: rest });
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

export async function fetchExternalRepo(
  externalUrl: string,
  store: GitStore
): Promise<{ ok: boolean; error?: string; sizeBytes?: number; commits?: { sha: string; meta: CommitMeta }[] }> {
  try {
    const base = externalUrl.replace(/\/+$/, "");
    let refsData: Uint8Array;
    let usedBase: string;

    let r1 = await tryFetchRefs(base);
    if (r1.ok) {
      refsData = r1.data!;
      usedBase = base;
    } else {
      const withDotGit = base.endsWith(".git") ? base : base + ".git";
      let r2 = await tryFetchRefs(withDotGit);
      if (r2.ok) {
        refsData = r2.data!;
        usedBase = withDotGit;
      } else {
        return { ok: false, error: `Failed to fetch refs from ${base} (${r1.status || "timeout"}) or ${withDotGit} (${r2.status || "timeout"})` };
      }
    }

    const refs = parseRefAdvert(refsData);
    if (refs.length === 0) return { ok: false, error: "No refs found" };

    const wants = refs.map((r) => r.sha).filter((s) => /^[0-9a-f]{40}$/.test(s));
    if (wants.length === 0) return { ok: false, error: "No valid refs to fetch" };

    // Use server's capabilities if present, otherwise defaults
    const serverCaps = refs[0]?.capabilities || "";
    const caps = [
      "multi_ack_detailed",
      "ofs-delta",
      "agent=cf-git/1.0",
    ];
    const capStr = caps.join(" ");
    const bodyChunks: Uint8Array[] = [];
    wants.forEach((w, i) => bodyChunks.push(pktLine(`${i === 0 ? "want" : "want"} ${w}${i === 0 ? `\x00${capStr}` : ""}\n`)));
    bodyChunks.push(pktFlush());
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
      body,
      signal: AbortSignal.timeout(120000),
    });
    if (!packRes.ok) return { ok: false, error: `Failed to fetch pack: ${packRes.status}` };

    let packData = new Uint8Array(await packRes.arrayBuffer());
    // Skip any pkt-line wrapper and locate the PACK data
    const packMagic = new Uint8Array([0x50, 0x41, 0x43, 0x4b]);
    const packStart = findSequence(packData, packMagic);
    if (packStart < 0) return { ok: false, error: "No PACK data in response" };
    packData = packData.slice(packStart);

    const objects = await parseAndStorePack(packData, store);

    const commits: { sha: string; meta: CommitMeta }[] = [];
    for (const obj of objects) {
      if (obj.type === "commit") {
        const meta = parseCommit(obj.raw);
        commits.push({ sha: obj.sha, meta });
      }
    }

    const sizeBytes = await store.calculateSize();

    for (const r of refs) {
      if (r.ref === "HEAD") continue; // Don't overwrite symbolic HEAD
      if (r.ref.endsWith("^{}")) continue; // Skip peeled tag refs (protocol artifact)
      if (/^[0-9a-f]{40}$/.test(r.sha)) {
        await store.writeRef(r.ref, r.sha);
      }
    }

    const headRef = refs.find(r => r.ref === "HEAD" && /^[0-9a-f]{40}$/.test(r.sha));
    if (headRef) {
      const defaultBranch = refs.find(r => r.ref.startsWith("refs/heads/") && r.sha === headRef.sha);
      if (defaultBranch) {
        await store.writeHead(defaultBranch.ref);
      }
    }

    return { ok: true, sizeBytes, commits };
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
