import { type NextRequest } from "next/server";
import { getCloudflareContext, json, notFound } from "@/lib/cf";
import { getActorByUsername } from "@/lib/db";

export async function GET(request: NextRequest): Promise<Response> {
  const { env } = getCloudflareContext();
  const resource = request.nextUrl.searchParams.get("resource");
  if (!resource) return json({ error: "resource parameter required" }, 400);

  let username: string | null = null;
  let domain: string | null = null;

  const acctMatch = resource.match(/^acct:(.+)@(.+)$/);
  if (acctMatch) {
    username = acctMatch[1].toLowerCase();
    domain = acctMatch[2].toLowerCase();
  }

  if (!username || !domain) return json({ error: "Invalid resource format" }, 400);

  const serverDomain = new URL(request.url).hostname;
  if (domain !== serverDomain) return notFound("User not found on this server");

  const actor = await getActorByUsername(env.DB, username, domain);
  if (!actor || !actor.isLocal) return notFound("User not found");

  const baseUrl = `https://${domain}`;
  const subject = `acct:${username}@${domain}`;

  return json({
    subject,
    aliases: [
      `${baseUrl}/users/${username}`,
      `${baseUrl}/@${username}`,
    ],
    links: [
      {
        rel: "self",
        type: "application/activity+json",
        href: `${baseUrl}/users/${username}`,
      },
      {
        rel: "http://webfinger.net/rel/profile-page",
        type: "text/html",
        href: `${baseUrl}/@${username}`,
      },
      {
        rel: "http://ostatus.org/schema/1.0/subscribe",
        template: `${baseUrl}/authorize-follow?uri={uri}`,
      },
    ],
  }, 200, { "Cache-Control": "public, max-age=300" });
}
