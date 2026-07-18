import { getCloudflareContext, notFound } from "@/lib/cf";
import { getActorByUsername, getReposByActor } from "@/lib/db";
import { buildActor, buildOrderedCollection, buildOrderedCollectionPage, buildCreate, buildRepoNote, actorIRI, generateId } from "@/lib/activitypub/utils";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { env } = getCloudflareContext();
  const db = env.DB;
  const { username } = await params;

  const domain = new URL(request.url).hostname;
  const actor = await getActorByUsername(db, username, domain);
  if (!actor || !actor.isLocal) return notFound("Actor not found");

  const baseUrl = env.INSTANCE_URL;
  const outboxId = `${actorIRI(baseUrl, username)}/outbox`;

  const url = new URL(request.url);
  const page = url.searchParams.get("page");

  const repos = await getReposByActor(db, actor.id);

  const items = repos.map((repo) => {
    const noteId = generateId();
    const published = repo.published;
    const note = buildRepoNote(baseUrl, noteId, {
      actorUsername: username,
      repoName: repo.name,
      description: repo.description ?? undefined,
      cloneUrl: repo.cloneUrl ?? undefined,
      defaultBranch: repo.defaultBranch,
      published,
    });
    return buildCreate(baseUrl, actor.id, note, generateId());
  });

  const collection = page === "true"
    ? buildOrderedCollectionPage(outboxId, items)
    : buildOrderedCollection(outboxId, repos.length);

  return new Response(JSON.stringify(collection), {
    headers: {
      "Content-Type": "application/activity+json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
