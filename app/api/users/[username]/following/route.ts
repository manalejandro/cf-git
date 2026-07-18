import { getCloudflareContext, activityJson, notFound } from "@/lib/cf";
import { getActorByUsername, getFollowing } from "@/lib/db";
import { buildOrderedCollection, buildOrderedCollectionPage, actorIRI } from "@/lib/activitypub/utils";

export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { env } = getCloudflareContext();
  const db = env.DB;
  const { username } = await params;

  const domain = env.INSTANCE_URL.replace(/^https?:\/\//, "");
  const actor = await getActorByUsername(db, username, domain);
  if (!actor || !actor.isLocal) return notFound("Actor not found");

  const baseUrl = env.INSTANCE_URL;
  const followingId = `${actorIRI(baseUrl, username)}/following`;

  const url = new URL(request.url);
  const page = url.searchParams.get("page");

  const following = await getFollowing(db, actor.id);

  if (page === "true") {
    const items = following.map((f) => actorIRI(baseUrl, f.username));
    return activityJson(buildOrderedCollectionPage(followingId, items));
  }

  return activityJson(buildOrderedCollection(followingId, following.length));
}
