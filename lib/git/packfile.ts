import { inflateSync, deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { GitStore, OBJ_COMMIT, OBJ_TREE, OBJ_BLOB, OBJ_TAG, OBJ_REF_DELTA, OBJ_OFS_DELTA, TYPE_NAMES, hex, sha1, rawToLooseObj } from "./store";

function writeVarInt(val: number): Uint8Array {
  const b: number[] = [];
  b.push(val & 0x7f);
  val >>>= 7;
  while (val > 0) { b.unshift(0x80 | (val & 0x7f)); val >>>= 7; }
  return new Uint8Array(b);
}

function parseTree(data: Uint8Array): { mode: string; name: string; sha: string }[] {
  const entries: { mode: string; name: string; sha: string }[] = [];
  let i = 0;
  while (i < data.length) {
    const spaceIdx = data.indexOf(32, i);
    if (spaceIdx < 0) break;
    const mode = new TextDecoder().decode(data.slice(i, spaceIdx));
    const nullIdx = data.indexOf(0, spaceIdx + 1);
    if (nullIdx < 0) break;
    const name = new TextDecoder().decode(data.slice(spaceIdx + 1, nullIdx));
    entries.push({ mode, name, sha: hex(data.slice(nullIdx + 1, nullIdx + 21)) });
    i = nullIdx + 21;
  }
  return entries;
}

function encodeSize(type: number, size: number): Uint8Array {
  const b: number[] = [(type << 4) | (size & 0x0f)];
  size >>>= 4;
  while (size > 0) {
    b[0] |= 0x80;
    const more = (size >>> 7) > 0;
    b.push((size & 0x7f) | (more ? 0x80 : 0));
    size >>>= 7;
  }
  return new Uint8Array(b);
}

export function encodePackHeader(count: number): Uint8Array {
  const h = new Uint8Array(12);
  h.set([0x50, 0x41, 0x43, 0x4b]);
  const dv = new DataView(h.buffer);
  dv.setUint32(4, 2, false);
  dv.setUint32(8, count, false);
  return h;
}

// ─── Upload Pack (generate pack for client) ────────

async function collectReachable(store: GitStore, wants: string[], haves: Set<string>): Promise<Map<string, { type: string; raw: Uint8Array }>> {
  const bySha = new Map<string, { type: string; raw: Uint8Array }>();
  const visited = new Set<string>(haves);
  const queue: string[] = [...wants];
  const pending = new Map<string, true>();

  const CONCURRENCY = 20;

  while (queue.length > 0) {
    const batch = queue.splice(0, CONCURRENCY).filter(s => !visited.has(s) && !pending.has(s));
    for (const s of batch) pending.set(s, true);

    const results = await Promise.all(batch.map(async (sha) => {
      const obj = await store.readLoose(sha);
      return { sha, obj };
    }));

    for (const { sha, obj } of results) {
      pending.delete(sha);
      visited.add(sha);
      if (!obj) continue;
      bySha.set(sha, obj);
      if (obj.type === "commit") {
        const text = new TextDecoder().decode(obj.raw);
        const treeM = text.match(/^tree ([0-9a-f]{40})/m);
        if (treeM && !visited.has(treeM[1]) && !pending.has(treeM[1])) queue.push(treeM[1]);
        for (const p of text.matchAll(/^parent ([0-9a-f]{40})/gm)) {
          if (!visited.has(p[1]) && !pending.has(p[1])) queue.push(p[1]);
        }
      } else if (obj.type === "tree") {
        for (const e of parseTree(obj.raw)) {
          if (!visited.has(e.sha) && !pending.has(e.sha)) queue.push(e.sha);
        }
      } else if (obj.type === "tag") {
        const text = new TextDecoder().decode(obj.raw);
        const objM = text.match(/^object ([0-9a-f]{40})/m);
        if (objM && !visited.has(objM[1]) && !pending.has(objM[1])) queue.push(objM[1]);
      }
    }
  }
  return bySha;
}

export async function* generatePackStream(store: GitStore, wants: string[], haves: string[]): AsyncGenerator<Uint8Array> {
  const objs = await collectReachable(store, wants, new Set(haves));
  const entries = Array.from(objs.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const typeNum: Record<string, number> = { commit: 1, tree: 2, blob: 3, tag: 4 };

  yield encodePackHeader(entries.length);
  for (const [, obj] of entries) {
    if (!obj) continue;
    const t = typeNum[obj.type] || 1;
    yield encodeSize(t, obj.raw.length);
    yield deflateSync(obj.raw);
  }
}

export async function generatePackBuffer(store: GitStore, wants: string[], haves: string[]): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const c of generatePackStream(store, wants, haves)) chunks.push(c);
  const all = concat(chunks);
  const packSha = await sha1(all);
  const result = concat([all, packSha]);
  return result;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const r = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { r.set(c, off); off += c.length; }
  return r;
}

// ─── Receive Pack (parse pack from client) ────────

function readPackHeader(data: Uint8Array, pos: number): { type: number; size: number; nextPos: number } {
  let byte = data[pos++];
  const type = (byte >> 4) & 0x07;
  let size = byte & 0x0f;
  let shift = 4;
  while (byte & 0x80) {
    byte = data[pos++];
    size |= (byte & 0x7f) << shift;
    shift += 7;
  }
  return { type, size, nextPos: pos };
}

export interface ReceivedObject {
  type: string;
  raw: Uint8Array;
  sha: string;
}

export async function parseAndStorePack(data: Uint8Array, store: GitStore): Promise<ReceivedObject[]> {
  if (new TextDecoder().decode(data.slice(0, 4)) !== "PACK") throw new Error("Not a pack file");
  const version = new DataView(data.buffer, data.byteOffset + 4, 4).getUint32(0, false);
  const count = new DataView(data.buffer, data.byteOffset + 8, 4).getUint32(0, false);
  if (version !== 2) throw new Error(`Unsupported pack version: ${version}`);

  const objects: ReceivedObject[] = [];
  const basePositions = new Map<number, string>();
  const written = new Map<string, { type: string; raw: Uint8Array }>();
  let pos = 12;

  for (let i = 0; i < count; i++) {
    const headerPos = pos;
    const header = readPackHeader(data, pos);
    const compressedStart = header.nextPos;

    let result: { obj: ReceivedObject; nextPos: number };

    if (header.type === OBJ_REF_DELTA) {
      const baseSha = hex(data.slice(compressedStart, compressedStart + 20));
      const deltaStart = compressedStart + 20;
      const { decompressed, compressedEnd } = inflateObject(data, deltaStart, header.size);
      const base = written.get(baseSha) || await store.readLoose(baseSha);
      if (!base) throw new Error(`Ref delta base not found: ${baseSha}`);
      const raw = applyDelta(base.raw, decompressed);
      const loose = rawToLooseObj(base.type, raw);
      const sha = hex(createHash("sha1").update(loose).digest());
      result = { obj: { type: base.type, raw, sha }, nextPos: compressedEnd };
    } else if (header.type === OBJ_OFS_DELTA) {
      let j = compressedStart;
      let result = 0, shift = 0, c = 0;
      do {
        c = data[j++];
        result |= (c & 0x7f) << shift;
        shift += 7;
      } while (c & 0x80);
      const deltaStart = j;
      const basePos = headerPos - (result + 1);
      const { decompressed, compressedEnd } = inflateObject(data, deltaStart, header.size);
      const baseSha = basePositions.get(basePos);
      if (!baseSha) throw new Error(`OFS_DELTA base not found at pos ${basePos}`);
      const base = written.get(baseSha) || await store.readLoose(baseSha);
      if (!base) throw new Error(`OFS_DELTA base sha=${baseSha} not found`);
      const raw = applyDelta(base.raw, decompressed);
      const loose = rawToLooseObj(base.type, raw);
      const sha = hex(createHash("sha1").update(loose).digest());
      result = { obj: { type: base.type, raw, sha }, nextPos: compressedEnd };
    } else {
      const typeName = TYPE_NAMES[header.type] || "unknown";
      const { decompressed, compressedEnd } = inflateObject(data, compressedStart, header.size);
      const loose = rawToLooseObj(typeName, decompressed);
      const sha = hex(createHash("sha1").update(loose).digest());
      result = { obj: { type: typeName, raw: decompressed, sha }, nextPos: compressedEnd };
    }

    objects.push(result.obj);
    written.set(result.obj.sha, { type: result.obj.type, raw: result.obj.raw });
    basePositions.set(headerPos, result.obj.sha);
    pos = result.nextPos;
  }

  const packEnd = data.length - 20;
  const expectedChecksum = hex(data.slice(packEnd));
  const computed = hex(await sha1(data.slice(0, packEnd)));
  if (expectedChecksum !== computed) {
    console.warn(`Pack checksum mismatch: expected ${expectedChecksum}, got ${computed}`);
  }

  // Parallel writes for speed
  await Promise.all(objects.map(obj =>
    store.writeLoose(obj.sha, obj.type, obj.raw)
  ));

  return objects;
}

function inflateObject(data: Uint8Array, start: number, expectedSize: number): { decompressed: Uint8Array; compressedEnd: number } {
  const maxSearch = Math.min(data.length, start + Math.max(expectedSize * 2 + 128, 64));
  const maxLen = maxSearch - start;
  // binary search for first size where inflateSync succeeds
  // s < actual_size → Error("unexpected end of file")
  // s >= actual_size → SUCCESS (inflateSync silently ignores trailing data)
  let low = 1;
  let high = maxLen;
  let decompressed: Uint8Array | null = null;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    try {
      decompressed = inflateSync(data.slice(start, start + mid));
      high = mid;
    } catch {
      low = mid + 1;
    }
  }
  if (decompressed === null) {
    decompressed = inflateSync(data.slice(start, start + low));
  }
  const compressedEnd = start + low;
  return { decompressed, compressedEnd };
}

export function applyDelta(base: Uint8Array, delta: Uint8Array): Uint8Array {
  const result: number[] = [];
  let i = 0;

  let srcSize = 0, c = 0;
  do { c = delta[i++]; srcSize = (srcSize << 7) | (c & 0x7f); } while (c & 0x80);

  let tgtSize = 0;
  do { c = delta[i++]; tgtSize = (tgtSize << 7) | (c & 0x7f); } while (c & 0x80);

  while (i < delta.length) {
    const cmd = delta[i++];
    if (cmd & 0x80) {
      let offset = 0, size = 0;
      if (cmd & 0x01) offset |= delta[i++];
      if (cmd & 0x02) offset |= delta[i++] << 8;
      if (cmd & 0x04) offset |= delta[i++] << 16;
      if (cmd & 0x08) offset |= delta[i++] << 24;
      if (cmd & 0x10) size |= delta[i++];
      if (cmd & 0x20) size |= delta[i++] << 8;
      if (cmd & 0x40) size |= delta[i++] << 16;
      if (size === 0) size = 0x10000;
      for (let j = 0; j < size && offset + j < base.length; j++) result.push(base[offset + j]);
    } else {
      for (let j = 0; j < cmd; j++) result.push(delta[i++]);
    }
  }
  return new Uint8Array(result);
}

// ─── Metadata extraction for D1 ────────────────────

export interface CommitMeta {
  sha: string;
  treeSha: string;
  parentShas: string[];
  message: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  committerName: string;
  committerEmail: string;
  committedAt: string;
}

export interface TreeEntry {
  path: string;
  mode: string;
  sha: string;
  type: "blob" | "tree";
}

export function parseCommit(raw: Uint8Array): CommitMeta {
  const text = new TextDecoder().decode(raw);
  const treeSha = text.match(/^tree ([0-9a-f]{40})/m)?.[1] || "";
  const parentShas = [...text.matchAll(/^parent ([0-9a-f]{40})/gm)].map(m => m[1]);
  const msgMatch = text.match(/\n\n([\s\S]*)$/);
  const message = msgMatch ? msgMatch[1].trim() : "";
  const authorM = text.match(/^author (.+) <([^>]+)> (\d+ [-+]\d{4})/m);
  const committerM = text.match(/^committer (.+) <([^>]+)> (\d+ [-+]\d{4})/m);
  return {
    sha: "", treeSha, parentShas, message,
    authorName: authorM?.[1] || "", authorEmail: authorM?.[2] || "",
    authoredAt: authorM?.[3] || "",
    committerName: committerM?.[1] || "", committerEmail: committerM?.[2] || "",
    committedAt: committerM?.[3] || "",
  };
}
