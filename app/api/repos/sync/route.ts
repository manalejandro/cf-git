import { getCloudflareContext, json, unauthorized } from "@/lib/cf";
import { getRepoById, updateRepoLastSync, updateRepoSize, createCommit } from "@/lib/db";
import { getSessionActor } from "@/lib/auth";
import { GitStore } from "@/lib/git/store";
import { fetchExternalRepo } from "@/lib/git/fetch";
import type { CommitMeta } from "@/lib/git/packfile";

export async function POST(request: Request) {
  const { env } = getCloudflareContext();
  const db = env.DB;

  const token = getBearerToken(request);
  if (!token) return unauthorized();
  const session = await getSessionActor(db, token);
  if (!session) return unauthorized();

  const body = await request.json() as Record<string, unknown>;
  const repoId = body.repoId as string;
  if (!repoId) return json({ error: "repoId is required" }, 422);

  const repo = await getRepoById(db, repoId);
  if (!repo) return json({ error: "Repository not found" }, 404);
  if (repo.actorId !== session.id) return unauthorized();

  if (repo.isExternal && repo.externalUrl) {
    const store = new GitStore(env.GIT, repo.id);
    await store.ensureInitialized();
    const result = await fetchExternalRepo(repo.externalUrl, store);
    if (!result.ok) {
      return json({ error: result.error || "Sync failed" }, 500);
    }
    if (result.sizeBytes !== undefined) {
      await updateRepoSize(db, repoId, result.sizeBytes);
    }
    if (result.commits && result.commits.length > 0) {
      for (const { sha, meta } of result.commits) {
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
        await db.prepare("UPDATE repos SET commit_count = commit_count + ?, updated_at = datetime('now') WHERE id = ?").bind(result.commits.length, repoId).run();
      } catch { /* ignore */ }
    }
  }

  await updateRepoLastSync(db, repoId);
  return json({ success: true });
}

function getBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? request.headers.get("Authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}
