import { getCloudflareContext, activityJson, notFound } from "@/lib/cf";
import { getActorByUsername } from "@/lib/db";
import { buildActor } from "@/lib/activitypub/utils";

export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { env } = getCloudflareContext();
  const db = env.DB;
  const { username } = await params;

  const accept = request.headers.get("accept") ?? "";
  const isAP = accept.includes("application/activity+json") || accept.includes("application/ld+json");

  if (!isAP) {
    return new Response(null, {
      status: 302,
      headers: { Location: `/@${username}` },
    });
  }

  const actor = await getActorByUsername(db, username, env.INSTANCE_URL.replace(/^https?:\/\//, ""));
  if (!actor || !actor.isLocal) return notFound("Actor not found");

  const apActor = buildActor(env.INSTANCE_URL, actor.username, {
    displayName: actor.displayName ?? undefined,
    summary: actor.summary ?? undefined,
    avatarUrl: actor.avatarUrl,
    headerUrl: actor.headerUrl,
    publicKeyPem: actor.publicKeyPem,
    followersCount: actor.followersCount,
    followingCount: actor.followingCount,
    reposCount: actor.reposCount,
    published: actor.createdAt,
  });

  return activityJson(apActor);
}
