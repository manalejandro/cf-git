import { type NextRequest } from "next/server";
import { getCloudflareContext, activityJson, notFound } from "@/lib/cf";
import { getObjectById, getActorById } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { env } = getCloudflareContext();
  const { id } = await params;
  const objectId = `${new URL(_request.url).origin}/objects/${id}`;

  const obj = await getObjectById(env.DB, objectId);
  if (!obj) return notFound("Object not found");

  const actor = await getActorById(env.DB, obj.actorId);
  if (!actor) return notFound("Actor not found");

  const baseUrl = new URL(_request.url).origin;
  const domain = new URL(_request.url).hostname;

  const note = {
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      "https://w3id.org/security/v1",
    ],
    id: objectId,
    type: obj.type,
    attributedTo: obj.actorId,
    content: obj.content ?? "",
    published: obj.published,
    to: ["https://www.w3.org/ns/activitystreams#Public"],
    cc: [`${baseUrl}/users/${actor.username}/followers`],
    url: obj.url,
    attachment: [],
    tag: [{ type: "Hashtag", name: "#git", href: `${baseUrl}/tags/git` }],
  };

  return activityJson(note);
}
