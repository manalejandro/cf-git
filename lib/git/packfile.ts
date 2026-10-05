import { inflateSync, deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { GitStore, OBJ_REF_DELTA, OBJ_OFS_DELTA, TYPE_NAMES, hex, sha1, looseObjectSize, rawToLooseObj } from "./store";

export function parseTree(data: Uint8Array): { mode: string; name: string; sha: string }[] {
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

const WALK_CONCURRENCY = 20;
const TYPE_NUMBERS: Record<string, number> = { commit: 1, tree: 2, blob: 3, tag: 4 };

interface WalkItem {
  sha: string;
  /** Trees/commits/tags must be read to discover children; blobs only counted. */
  read: boolean;
}

/**
 * Count the objects reachable from `wants` but not from `haves`.
 *
 * Only commits/trees/tags are read (blobs are counted from the tree entries
 * that reference them), so the pack header can be emitted before streaming the
 * objects without holding the whole closure in memory.
 */
async function countReachable(store: GitStore, wants: string[], haves: string[]): Promise<number> {
  const seen = new Set<string>(haves);
  const queue: WalkItem[] = wants.map((sha) => ({ sha, read: true }));
  let count = 0;

  while (queue.length > 0) {
    const batch: WalkItem[] = [];
    for (const item of queue.splice(0, WALK_CONCURRENCY)) {
      if (seen.has(item.sha) || batch.some((b) => b.sha === item.sha)) continue;
      seen.add(item.sha);
      batch.push(item);
    }
    if (batch.length === 0) continue;
    count += batch.length;

    const toRead = batch.filter((t) => t.read);
    if (toRead.length === 0) continue;

    const objects = await Promise.all(toRead.map((t) => store.readLoose(t.sha)));
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      if (!obj) throw new Error(`Missing object ${toRead[i].sha}`);
      if (obj.type === "commit") {
        const text = new TextDecoder().decode(obj.raw);
        const tree = text.match(/^tree ([0-9a-f]{40})/m);
        if (tree) queue.push({ sha: tree[1], read: true });
        for (const p of text.matchAll(/^parent ([0-9a-f]{40})/gm)) {
          queue.push({ sha: p[1], read: true });
        }
      } else if (obj.type === "tree") {
        for (const entry of parseTree(obj.raw)) {
          if (entry.mode === "160000") continue; // submodule gitlink, not stored here
          queue.push({ sha: entry.sha, read: entry.mode === "40000" || entry.mode === "040000" });
        }
      } else if (obj.type === "tag") {
        const target = new TextDecoder().decode(obj.raw).match(/^object ([0-9a-f]{40})/m);
        if (target) queue.push({ sha: target[1], read: true });
      }
    }
  }

  return count;
}

/**
 * Streaming pack generator: header, then each reachable object (size header +
 * zlib stream), then the SHA-1 trailer. Only one batch of objects is held in
 * memory at a time, so large repositories no longer exceed the 128 MB limit.
 */
export async function* generatePackStream(store: GitStore, wants: string[], haves: string[]): AsyncGenerator<Uint8Array> {
  const count = await countReachable(store, wants, haves);
  const header = encodePackHeader(count);
  const hash = createHash("sha1");
  hash.update(header);
  yield header;

  const seen = new Set<string>(haves);
  const queue: string[] = [...wants];

  while (queue.length > 0) {
    const batch: string[] = [];
    for (const s of queue.splice(0, WALK_CONCURRENCY)) {
      if (seen.has(s) || batch.includes(s)) continue;
      seen.add(s);
      batch.push(s);
    }
    if (batch.length === 0) continue;

    const objects = await Promise.all(batch.map((s) => store.readLoose(s)));
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      if (!obj) throw new Error(`Missing object ${batch[i]}`);

      const sizeChunk = encodeSize(TYPE_NUMBERS[obj.type] || 1, obj.raw.length);
      const compressed = deflateSync(obj.raw);
      hash.update(sizeChunk);
      hash.update(compressed);
      yield sizeChunk;
      yield compressed;

      if (obj.type === "commit") {
        const text = new TextDecoder().decode(obj.raw);
        const tree = text.match(/^tree ([0-9a-f]{40})/m);
        if (tree) queue.push(tree[1]);
        for (const p of text.matchAll(/^parent ([0-9a-f]{40})/gm)) queue.push(p[1]);
      } else if (obj.type === "tree") {
        for (const entry of parseTree(obj.raw)) {
          if (entry.mode === "160000") continue; // submodule gitlink, not stored here
          queue.push(entry.sha);
        }
      } else if (obj.type === "tag") {
        const target = new TextDecoder().decode(obj.raw).match(/^object ([0-9a-f]{40})/m);
        if (target) queue.push(target[1]);
      }
    }
  }

  yield new Uint8Array(hash.digest());
}

/**
 * Build a backpressure-aware Response body: the optional pkt-line prefix
 * (NAK/flush) is sent first, then the pack stream. The stream pulls one chunk
 * at a time so a slow client cannot make the worker buffer the whole pack.
 */
export function createPackResponseStream(
  store: GitStore,
  wants: string[],
  haves: string[],
  prefix: Uint8Array
): ReadableStream<Uint8Array> {
  const iterator = generatePackStream(store, wants, haves)[Symbol.asyncIterator]();
  let prefixSent = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!prefixSent) {
        prefixSent = true;
        if (prefix.byteLength > 0) controller.enqueue(prefix);
        return;
      }
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    async cancel() {
      await iterator.return?.(undefined);
    },
  });
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

export interface ParsedPack {
  /** Commit objects found in the pack (other types are written and dropped). */
  commits: ReceivedObject[];
  /** Stored bytes of the loose objects written from this pack. */
  writtenBytes: number;
}

/** Objects larger than this are stored but not kept as delta bases in memory. */
const MAX_CACHED_BASE_BYTES = 8 * 1024 * 1024;
/** Total memory budget for delta-base objects during a single pack parse. */
const BASE_CACHE_BUDGET_BYTES = 48 * 1024 * 1024;
/** R2 writes in flight while parsing. */
const WRITE_CONCURRENCY = 100;

export async function parseAndStorePack(data: Uint8Array, store: GitStore): Promise<ParsedPack> {
  if (new TextDecoder().decode(data.slice(0, 4)) !== "PACK") throw new Error("Not a pack file");
  const version = new DataView(data.buffer, data.byteOffset + 4, 4).getUint32(0, false);
  const count = new DataView(data.buffer, data.byteOffset + 8, 4).getUint32(0, false);
  if (version !== 2) throw new Error(`Unsupported pack version: ${version}`);

  // Only commit metadata is returned: keeping every object's raw bytes alive
  // until the end of the pack exceeded the Worker's 128 MB memory limit on
  // large repositories. Objects are written to R2 as they are parsed, and
  // delta bases are resolved from a bounded in-memory cache with an R2
  // fallback.
  const commits: ReceivedObject[] = [];
  const basePositions = new Map<number, string>();
  const baseCache = new Map<string, { type: string; raw: Uint8Array }>();
  let baseCacheBytes = 0;
  let writtenBytes = 0;
  const pendingWrites = new Map<string, Promise<void>>();

  let activeWrites = 0;
  const waiters: (() => void)[] = [];
  const acquire = (): Promise<void> =>
    new Promise((resolve) => {
      if (activeWrites < WRITE_CONCURRENCY) {
        activeWrites++;
        resolve();
      } else {
        waiters.push(() => { activeWrites++; resolve(); });
      }
    });
  const release = (): void => {
    activeWrites--;
    const next = waiters.shift();
    if (next) next();
  };

  const scheduleWrite = (sha: string, type: string, raw: Uint8Array): void => {
    const task = (async () => {
      await acquire();
      try {
        await store.writeLoose(sha, type, raw);
      } finally {
        release();
      }
    })();
    pendingWrites.set(sha, task);
    void task
      .finally(() => {
        if (pendingWrites.get(sha) === task) pendingWrites.delete(sha);
      })
      .catch(() => {});
  };

  const cacheBase = (sha: string, type: string, raw: Uint8Array): void => {
    if (raw.byteLength > MAX_CACHED_BASE_BYTES) return;
    baseCache.set(sha, { type, raw });
    baseCacheBytes += raw.byteLength;
    while (baseCacheBytes > BASE_CACHE_BUDGET_BYTES) {
      const oldest = baseCache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      const evicted = baseCache.get(oldest);
      if (evicted) baseCacheBytes -= evicted.raw.byteLength;
      baseCache.delete(oldest);
    }
  };

  const resolveBase = async (sha: string): Promise<{ type: string; raw: Uint8Array } | null> => {
    const cached = baseCache.get(sha);
    if (cached) {
      // LRU touch: keep hot delta bases in memory.
      baseCache.delete(sha);
      baseCache.set(sha, cached);
      return cached;
    }
    const pending = pendingWrites.get(sha);
    if (pending) {
      try {
        await pending;
      } catch { /* fall through to the R2 copy */ }
      const afterWrite = baseCache.get(sha);
      if (afterWrite) return afterWrite;
    }
    return store.readLoose(sha);
  };

  let pos = 12;

  for (let i = 0; i < count; i++) {
    if (i > 0 && i % 2000 === 0) {
      console.log(`[git-pack] parsed ${i}/${count} objects`);
      await store.writeProgress({ phase: "parse", parsed: i, total: count, writtenBytes });
    }
    const headerPos = pos;
    const header = readPackHeader(data, pos);
    const compressedStart = header.nextPos;

    let obj: ReceivedObject;
    let nextPos: number;

    if (header.type === OBJ_REF_DELTA) {
      const baseSha = hex(data.slice(compressedStart, compressedStart + 20));
      const deltaStart = compressedStart + 20;
      const { decompressed, compressedEnd } = inflateObject(data, deltaStart, header.size);
      const base = await resolveBase(baseSha);
      if (!base) throw new Error(`Ref delta base not found: ${baseSha}`);
      const raw = applyDelta(base.raw, decompressed);
      obj = { type: base.type, raw, sha: hex(createHash("sha1").update(rawToLooseObj(base.type, raw)).digest()) };
      nextPos = compressedEnd;
    } else if (header.type === OBJ_OFS_DELTA) {
      let j = compressedStart;
      let ofs = 0, shift = 0, c = 0;
      do {
        c = data[j++];
        ofs |= (c & 0x7f) << shift;
        shift += 7;
      } while (c & 0x80);
      const deltaStart = j;
      const basePos = headerPos - (ofs + 1);
      const { decompressed, compressedEnd } = inflateObject(data, deltaStart, header.size);
      const baseSha = basePositions.get(basePos);
      if (!baseSha) throw new Error(`OFS_DELTA base not found at pos ${basePos}`);
      const base = await resolveBase(baseSha);
      if (!base) throw new Error(`OFS_DELTA base sha=${baseSha} not found`);
      const raw = applyDelta(base.raw, decompressed);
      obj = { type: base.type, raw, sha: hex(createHash("sha1").update(rawToLooseObj(base.type, raw)).digest()) };
      nextPos = compressedEnd;
    } else {
      const typeName = TYPE_NAMES[header.type] || "unknown";
      const { decompressed, compressedEnd } = inflateObject(data, compressedStart, header.size);
      obj = { type: typeName, raw: decompressed, sha: hex(createHash("sha1").update(rawToLooseObj(typeName, decompressed)).digest()) };
      nextPos = compressedEnd;
    }

    scheduleWrite(obj.sha, obj.type, obj.raw);
    writtenBytes += looseObjectSize(obj.type, obj.raw.byteLength);
    cacheBase(obj.sha, obj.type, obj.raw);
    if (obj.type === "commit") commits.push(obj);
    basePositions.set(headerPos, obj.sha);
    pos = nextPos;
  }

  // Wait for every scheduled write so callers can immediately read them back.
  await store.writeProgress({ phase: "writes-waiting", count, writtenBytes });
  await Promise.all([...pendingWrites.values()]);
  await store.writeProgress({ phase: "writes-done", count, writtenBytes });
  console.log(`[git-pack] stored ${count} objects`);

  const packEnd = data.length - 20;
  const expectedChecksum = hex(data.subarray(packEnd));
  const computed = hex(await sha1(data.subarray(0, packEnd)));
  if (expectedChecksum !== computed) {
    console.warn(`Pack checksum mismatch: expected ${expectedChecksum}, got ${computed}`);
  }

  return { commits, writtenBytes };
}

/** Adler-32 (RFC 1950 zlib trailer), processed in blocks to defer the modulo. */
function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  const MOD = 65521;
  let i = 0;
  while (i < data.length) {
    const end = Math.min(i + 5552, data.length);
    for (; i < end; i++) {
      a += data[i];
      b += a;
    }
    a %= MOD;
    b %= MOD;
  }
  return ((b << 16) | a) >>> 0;
}

function inflateObject(data: Uint8Array, start: number, expectedSize: number): { decompressed: Uint8Array; compressedEnd: number } {
  // Deflate stored blocks add at most 5 bytes per 16 KiB; the +64 covers the
  // zlib header/trailer. Using the uncompressed size keeps the window tight.
  const overhead = Math.ceil(expectedSize / 16383) * 5 + 64;
  const maxLen = Math.min(data.length - start, expectedSize + overhead);
  if (maxLen <= 0) throw new Error("Truncated pack");

  // One decompression gives the payload (inflateSync ignores trailing bytes);
  // its Adler-32 trailer then locates the compressed stream end. This avoids
  // the ~14 full inflations per object of a byte-wise binary search.
  const window = data.subarray(start, start + maxLen);
  let decompressed: Uint8Array;
  try {
    decompressed = inflateSync(window);
  } catch {
    return inflateObjectBinarySearch(data, start, expectedSize);
  }
  if (decompressed.length !== expectedSize) {
    return inflateObjectBinarySearch(data, start, expectedSize);
  }

  const sum = adler32(decompressed);
  const t0 = (sum >>> 24) & 0xff;
  const t1 = (sum >>> 16) & 0xff;
  const t2 = (sum >>> 8) & 0xff;
  const t3 = sum & 0xff;
  for (let len = 2; len + 4 <= maxLen; len++) {
    if (window[len] !== t0 || window[len + 1] !== t1 || window[len + 2] !== t2 || window[len + 3] !== t3) continue;
    try {
      const verified = inflateSync(data.subarray(start, start + len + 4));
      if (verified.length === expectedSize) {
        return { decompressed: verified, compressedEnd: start + len + 4 };
      }
    } catch { /* false positive: keep scanning */ }
  }
  return inflateObjectBinarySearch(data, start, expectedSize);
}

function inflateObjectBinarySearch(data: Uint8Array, start: number, expectedSize: number): { decompressed: Uint8Array; compressedEnd: number } {
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
  let i = 0;

  // Git delta varints are little-endian (LSB first). The previous big-endian
  // decode only worked because the value was never used.
  let srcSize = 0, shift = 0, c = 0;
  do { c = delta[i++]; srcSize |= (c & 0x7f) << shift; shift += 7; } while (c & 0x80);
  // srcSize must match the base length; a mismatch means the wrong base.
  if (srcSize !== base.length) {
    console.warn(`[delta] base size mismatch: delta=${srcSize} base=${base.length}`);
  }
  shift = 0;
  let tgtSize = 0;
  do { c = delta[i++]; tgtSize |= (c & 0x7f) << shift; shift += 7; } while (c & 0x80);

  // Preallocated output: the previous byte-by-byte `number[]` push was orders
  // of magnitude slower (and heavier) for large deltas.
  const out = new Uint8Array(tgtSize);
  let outPos = 0;

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
      const copyLen = Math.max(0, Math.min(size, base.length - offset, out.length - outPos));
      if (copyLen > 0) {
        out.set(base.subarray(offset, offset + copyLen), outPos);
        outPos += copyLen;
      }
    } else {
      const insertLen = Math.max(0, Math.min(cmd, delta.length - i, out.length - outPos));
      if (insertLen > 0) {
        out.set(delta.subarray(i, i + insertLen), outPos);
        outPos += insertLen;
      }
      i += cmd;
    }
  }

  return outPos === tgtSize ? out : out.subarray(0, outPos);
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
