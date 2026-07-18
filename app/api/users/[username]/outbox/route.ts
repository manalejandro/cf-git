import { getCloudflareContext, activityJson, notFound } from "@/lib/cf";
import { getActorByUsername, getReposByActor } from "@/lib/db";
import { buildActor, buildOrderedCollection, buildOrderedCollectionPage, buildCreate, buildRepoNote, repoIRI, objectIRI, activityIRI, actorIRI, followersIRI, keyIRI, generateId } from "@/lib/activitypub/utils";
import { PUBLIC_ADDRESS } from "@/lib/activitypub/vocab";

export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { env } = getCloudflareContext();
  const db = env.DB;
  const { username } = await params;

  const domain = env.INSTANCE_URL.replace(/^https?:\/\//, "");
  const actor = await getActorByUsername(db, username, domain);
  if (!actor || !actor.isLocal) return notFound("Actor not found");

  const baseUrl = env.INSTANCE_URL;
  const outboxId = `${actorIRI(baseUrl, username)}/outbox`;

  const url = new URL(request.url);
  const page = url.searchParams.get("page");

  const repos = await getReposByActor(db, actor.id);

  if (page === "true") {
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

    return activityJson(buildOrderedCollectionPage(outboxId, items));
  }

  const collection = buildOrderedCollection(outboxId, repos.length);
  return activityJson(collection);
}
