import { getCloudflareContext, notFound } from "@/lib/cf";
import { getActorByUsername, getFollowing } from "@/lib/db";
import { buildOrderedCollection, buildOrderedCollectionPage, actorIRI } from "@/lib/activitypub/utils";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { env } = getCloudflareContext();
  const db = env.DB;
  const { username } = await params;

  const domain = new URL(request.url).hostname;
  const actor = await getActorByUsername(db, username, domain);
  if (!actor || !actor.isLocal) return notFound("Actor not found");

  const baseUrl = env.INSTANCE_URL;
  const followingId = `${actorIRI(baseUrl, username)}/following`;

  const url = new URL(request.url);
  const page = url.searchParams.get("page");

  const following = await getFollowing(db, actor.id);

  const collection = page === "true"
    ? buildOrderedCollectionPage(followingId, following.map((f) => actorIRI(baseUrl, f.username)))
    : buildOrderedCollection(followingId, following.length);

  return new Response(JSON.stringify(collection), {
    headers: {
      "Content-Type": "application/activity+json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
