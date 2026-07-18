import { getCloudflareContext, json, unauthorized } from "@/lib/cf";
import { getActorById } from "@/lib/db";
import { extractSigningKeyId, verifySignature } from "@/lib/activitypub/security";
import { processInboxActivity } from "@/lib/activitypub/inbox";
import { fetchRemoteObject } from "@/lib/activitypub/federation";
import type { APActivity } from "@/lib/types";

export async function POST(request: Request) {
  const { env } = getCloudflareContext();
  const db = env.DB;

  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });

  const keyId = extractSigningKeyId(headers);
  if (!keyId) return unauthorized();

  const remoteActorId = keyId.replace(/#.*$/, "");
  let remoteActor = await getActorById(db, remoteActorId);
  if (!remoteActor) {
    const fetched = await fetchRemoteObject(remoteActorId);
    if (fetched?.publicKey?.publicKeyPem) {
      const fetchedDomain = new URL(fetched.id).hostname;
      await db.prepare(
        "INSERT OR REPLACE INTO actors (id, username, domain, display_name, summary, avatar_url, header_url, public_key_pem, inbox, is_local, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))"
      ).bind(
        fetched.id, fetched.preferredUsername, fetchedDomain,
        fetched.name ?? null, fetched.summary ?? null,
        fetched.icon?.url ?? null, fetched.image?.url ?? null,
        fetched.publicKey.publicKeyPem, fetched.inbox ?? null
      ).run();
      remoteActor = await getActorById(db, remoteActorId);
    }
  }

  if (!remoteActor) return unauthorized();

  const body = await request.text();
  const verified = await verifySignature(
    request.method,
    request.url,
    headers,
    remoteActor.publicKey?.publicKeyPem ?? (remoteActor as unknown as Record<string, string>).publicKeyPem,
    body
  );
  if (!verified) return unauthorized();

  const activity = JSON.parse(body) as APActivity;
  await processInboxActivity(activity, {
    db,
    baseUrl: env.INSTANCE_URL,
  });

  return new Response(null, { status: 202 });
}
