import { GitStore, looseObjectSize } from "./store";
import { parseTree } from "./packfile";

// Bound the number of concurrent R2 operations during the reachability walk.
const CONCURRENCY = 20;

interface WalkTask {
  sha: string;
  /** Trees/commits/tags must be read to discover children; blobs only need `head`. */
  read: boolean;
}

/**
 * Size in bytes of the objects reachable from the repository's refs.
 *
 * Loose objects are content-addressed and shared between repositories, so the
 * bucket-wide sum (`GitStore.calculateSize`) would report every repository's
 * objects as part of each one. This walks commits/trees/tags from the refs and
 * only calls `head` on blobs, avoiding their download.
 */
export async function calculateRepoSize(store: GitStore): Promise<number> {
  const refs = await store.listRefs("");
  const seen = new Set<string>();
  const queue: WalkTask[] = refs
    .map((r) => r.sha)
    .filter((sha) => /^[0-9a-f]{40}$/.test(sha))
    .map((sha) => ({ sha, read: true }));

  let total = 0;
  let walked = 0;

  while (queue.length > 0) {
    const batch = queue.splice(0, CONCURRENCY).filter((t) => !seen.has(t.sha));
    for (const t of batch) seen.add(t.sha);
    walked += batch.length;
    if (walked % 2000 < batch.length) console.log(`[git-size] walked ${walked} objects`);

    const toRead = batch.filter((t) => t.read);
    const toHead = batch.filter((t) => !t.read);

    // Read the graph objects (their loose size is derived from the raw bytes);
    // only blobs need an extra `head` since their body is never fetched.
    const [objects, headSizes] = await Promise.all([
      Promise.all(toRead.map((t) => store.readLoose(t.sha))),
      Promise.all(toHead.map((t) => store.objectSize(t.sha))),
    ]);
    for (const size of headSizes) total += size;

    for (const obj of objects) {
      if (!obj) continue;
      total += looseObjectSize(obj.type, obj.raw.byteLength);
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
          // Directory modes are "40000" ("040000" in some writers); everything
          // else is a blob.
          queue.push({ sha: entry.sha, read: entry.mode === "40000" || entry.mode === "040000" });
        }
      } else if (obj.type === "tag") {
        const target = new TextDecoder().decode(obj.raw).match(/^object ([0-9a-f]{40})/m);
        if (target) queue.push({ sha: target[1], read: true });
      }
    }
  }

  return total;
}
