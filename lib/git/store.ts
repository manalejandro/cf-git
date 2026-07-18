const OBJ_PREFIX = "git";
const OBJ_COMMIT = 1;
const OBJ_TREE = 2;
const OBJ_BLOB = 3;
const OBJ_TAG = 4;
const OBJ_OFS_DELTA = 6;
const OBJ_REF_DELTA = 7;

const TYPE_NAMES: Record<number, string> = {
  [OBJ_COMMIT]: "commit",
  [OBJ_TREE]: "tree",
  [OBJ_BLOB]: "blob",
  [OBJ_TAG]: "tag",
};

function objPath(sha: string): string {
  return `${OBJ_PREFIX}/objects/${sha.slice(0, 2)}/${sha.slice(2)}`;
}

function refPath(repoId: string, ref: string): string {
  return `${OBJ_PREFIX}/refs/${repoId}/${ref}`;
}

export function hex(sha: Uint8Array): string {
  return Array.from(sha).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function unhex(s: string): Uint8Array {
  const bytes = new Uint8Array(s.length / 2);
  for (let i = 0; i < s.length; i += 2) bytes[i / 2] = parseInt(s.slice(i, i + 2), 16);
  return bytes;
}

export function looseObjToRaw(data: Uint8Array): { type: string; raw: Uint8Array } {
  const nullIdx = data.indexOf(0);
  const header = new TextDecoder().decode(data.slice(0, nullIdx));
  const [type] = header.split(" ");
  return { type, raw: data.slice(nullIdx + 1) };
}

export function rawToLooseObj(type: string, raw: Uint8Array): Uint8Array {
  const h = new TextEncoder().encode(`${type} ${raw.length}\0`);
  const out = new Uint8Array(h.length + raw.length);
  out.set(h); out.set(raw, h.length);
  return out;
}

export async function sha1(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-1", data));
}

export { OBJ_COMMIT, OBJ_TREE, OBJ_BLOB, OBJ_TAG, OBJ_OFS_DELTA, OBJ_REF_DELTA, TYPE_NAMES };

export class GitStore {
  constructor(private bucket: R2Bucket, public repoId: string) {}

  async readLoose(sha: string): Promise<{ type: string; raw: Uint8Array } | null> {
    const obj = await this.bucket.get(objPath(sha));
    if (!obj) return null;
    return looseObjToRaw(new Uint8Array(await obj.arrayBuffer()));
  }

  async writeLoose(sha: string, type: string, raw: Uint8Array): Promise<void> {
    await this.bucket.put(objPath(sha), rawToLooseObj(type, raw));
  }

  async readRef(ref: string): Promise<string | null> {
    const obj = await this.bucket.get(refPath(this.repoId, ref));
    if (!obj) return null;
    const text = await obj.text();
    const m = text.match(/^([0-9a-f]{40})/);
    return m ? m[1] : null;
  }

  async writeRef(ref: string, sha: string): Promise<void> {
    await this.bucket.put(refPath(this.repoId, ref), sha + "\n");
  }

  async deleteRef(ref: string): Promise<void> {
    await this.bucket.delete(refPath(this.repoId, ref));
  }

  async listRefs(prefix: string): Promise<{ ref: string; sha: string }[]> {
    const prefixPath = `${OBJ_PREFIX}/refs/${this.repoId}/${prefix}`;
    const listed = await this.bucket.list({ prefix: prefixPath });
    const result: { ref: string; sha: string }[] = [];
    for (const obj of listed.objects) {
      const rawRef = obj.key.slice(prefixPath.length - prefix.length);
      const ref = rawRef.replace(/[\0\n].*$/, "");
      const sha = await this.readRef(rawRef);
      if (sha) result.push({ ref, sha });
    }
    return result;
  }

  async readHead(): Promise<string | null> {
    const obj = await this.bucket.get(refPath(this.repoId, "HEAD"));
    if (!obj) return null;
    const text = (await obj.text()).trim();
    const m = text.match(/^ref: (.+)$/);
    if (m) return this.readRef(m[1]);
    const m2 = text.match(/^([0-9a-f]{40})$/);
    return m2 ? m2[1] : null;
  }

  async readHeadSymref(): Promise<string | null> {
    const obj = await this.bucket.get(refPath(this.repoId, "HEAD"));
    if (!obj) return null;
    const text = (await obj.text()).trim();
    const m = text.match(/^ref: (.+)$/);
    return m ? m[1] : null;
  }

  async writeHead(ref: string): Promise<void> {
    await this.bucket.put(refPath(this.repoId, "HEAD"), `ref: ${ref}\n`);
  }

  objectExists(sha: string): Promise<boolean> {
    return this.bucket.head(objPath(sha)).then(r => r !== null);
  }

  async calculateSize(): Promise<number> {
    let total = 0;
    let cursor: string | undefined;
    do {
      const listed = await this.bucket.list({
        prefix: `${OBJ_PREFIX}/objects/`,
        cursor,
      });
      for (const obj of listed.objects) {
        total += obj.size;
      }
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
    return total;
  }

  async ensureInitialized(): Promise<void> {
    const head = await this.bucket.head(refPath(this.repoId, "HEAD"));
    if (head) return;
    await this.writeHead("refs/heads/main");
    await this.bucket.put(refPath(this.repoId, "description"), "cf-git repository\n");
  }

  async initEmptyCommit(username: string, email: string): Promise<string> {
    const ref = "refs/heads/main";
    const existing = await this.readRef(ref);
    if (existing) return existing;

    const treeSha = await this.writeEmptyTree();
    const now = new Date().toISOString().replace(/[TZ]/g, " ").slice(0, 19) + " +0000";
    const author = `${username} <${email}> ${Math.floor(Date.now() / 1000)} +0000`;
    const msg = "Initial commit\n";
    const commitRaw = new TextEncoder().encode(
      `tree ${treeSha}\nauthor ${author}\ncommitter ${author}\n\n${msg}`
    );
    const commitSha = hex(await sha1(rawToLooseObj("commit", commitRaw)));
    await this.writeLoose(commitSha, "commit", commitRaw);
    await this.writeRef(ref, commitSha);
    return commitSha;
  }

  private async writeEmptyTree(): Promise<string> {
    const raw = new Uint8Array(0);
    const sha = hex(await sha1(rawToLooseObj("tree", raw)));
    await this.writeLoose(sha, "tree", raw);
    return sha;
  }
}
