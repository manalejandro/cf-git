import { getCloudflareContext, json } from "@/lib/cf";
import { searchActors, getActorByUsernameAndDomain, getActorById } from "@/lib/db";
import { fetchRemoteObject, resolveWebFinger } from "@/lib/activitypub/federation";

export async function GET(request: Request) {
  const { env } = getCloudflareContext();
  const db = env.DB;

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  if (!q.trim()) return json([]);

  const seen = new Set<string>();

  const results: Record<string, unknown>[] = [];

  if (q.includes("@")) {
    const [usernamePart, domainPart] = q.replace(/^@/, "").split("@");
    if (usernamePart && domainPart) {
      let actor = await getActorByUsernameAndDomain(db, usernamePart, domainPart);
      if (!actor) {
        const href = await resolveWebFinger(q);
        if (href) {
          const fetched = await fetchRemoteObject(href) as { id: string; preferredUsername: string; name?: string; summary?: string; icon?: { url: string }; image?: { url: string }; publicKey?: { publicKeyPem: string }; inbox?: string } | null;
          if (fetched?.publicKey?.publicKeyPem) {
            await db.prepare(
              "INSERT OR REPLACE INTO actors (id, username, domain, display_name, summary, avatar_url, header_url, public_key_pem, inbox, is_local, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))"
            ).bind(
              fetched.id, fetched.preferredUsername, domainPart,
              fetched.name ?? null, fetched.summary ?? null,
              fetched.icon?.url ?? null, fetched.image?.url ?? null,
              fetched.publicKey.publicKeyPem, fetched.inbox ?? null
            ).run();
            actor = await getActorByUsernameAndDomain(db, usernamePart, domainPart);
          }
        }
      }
      if (actor && !seen.has(actor.id)) {
        seen.add(actor.id);
        results.push({
          id: actor.id, username: actor.username, domain: actor.domain,
          displayName: actor.displayName, avatarUrl: actor.avatarUrl,
          summary: actor.summary, followersCount: actor.followersCount,
          followingCount: actor.followingCount, isLocal: actor.isLocal,
        });
      }
    }
  }

  const localActors = await searchActors(db, q);
  for (const a of localActors) {
    if (!seen.has(a.id)) {
      seen.add(a.id);
      results.push({
        id: a.id, username: a.username, domain: a.domain,
        displayName: a.displayName, avatarUrl: a.avatarUrl,
        summary: a.summary, followersCount: a.followersCount,
        followingCount: a.followingCount, isLocal: a.isLocal,
      });
    }
  }

  return json(results);
}
