import { getCloudflareContext, activityJson, notFound } from "@/lib/cf";
import { getActorByUsername } from "@/lib/db";
import { buildActor } from "@/lib/activitypub/utils";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const accept = request.headers.get("accept") ?? "";
  const isAP = accept.includes("application/activity+json") || accept.includes("application/ld+json");

  if (!isAP) {
    return new Response(null, {
      status: 302,
      headers: { Location: "/" },
    });
  }

  const { env } = getCloudflareContext();
  const db = env.DB;
  const { username } = await params;

  const actor = await getActorByUsername(db, username, new URL(request.url).hostname);
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

  return new Response(JSON.stringify(apActor), {
    headers: {
      "Content-Type": "application/activity+json; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
