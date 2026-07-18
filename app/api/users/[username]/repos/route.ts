import { getCloudflareContext, json, notFound } from "@/lib/cf";
import { getActorByUsername } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { env } = getCloudflareContext();
  const db = env.DB;
  const { username } = await params;

  const domain = new URL(_request.url).hostname;
  const actor = await getActorByUsername(db, username, domain);
  if (!actor) return notFound("User not found");

  const { results } = await db
    .prepare("SELECT id, name, description, default_branch, size_bytes, commit_count, star_count, fork_count, is_private, is_external, published, updated_at FROM repos WHERE actor_id = ? AND is_private = 0 ORDER BY published DESC")
    .bind(actor.id)
    .all<Record<string, unknown>>();

  return json(results.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    defaultBranch: r.default_branch,
    sizeBytes: r.size_bytes,
    commitCount: r.commit_count,
    starCount: r.star_count,
    forkCount: r.fork_count,
    isPrivate: r.is_private,
    isExternal: r.is_external,
    published: r.published,
    updatedAt: r.updated_at,
  })));
}
