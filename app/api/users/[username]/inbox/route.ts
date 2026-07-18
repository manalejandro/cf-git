import { getCloudflareContext, json, unauthorized } from "@/lib/cf";
import { getActorByUsername, getActorById } from "@/lib/db";
import { extractSigningKeyId, verifySignature } from "@/lib/activitypub/security";
import { processInboxActivity } from "@/lib/activitypub/inbox";
import { fetchRemoteObject } from "@/lib/activitypub/federation";
import type { APActivity } from "@/lib/types";

export async function POST(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { env } = getCloudflareContext();
  const db = env.DB;
  const { username } = await params;

  const domain = env.INSTANCE_URL.replace(/^https?:\/\//, "");
  const recipient = await getActorByUsername(db, username, domain);
  if (!recipient || !recipient.isLocal) return json({ error: "Not found" }, 404);

  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });

  const keyId = extractSigningKeyId(headers);
  if (!keyId) return unauthorized();

  const remoteActorId = keyId.replace(/#.*$/, "");
  const remoteActor = await getActorById(db, remoteActorId) ?? await fetchRemoteObject(remoteActorId);

  if (!remoteActor) return unauthorized();

  const body = await request.text();
  const verified = await verifySignature(
    request.method,
    request.url,
    headers,
    remoteActor.publicKey.publicKeyPem ?? remoteActor.publicKeyPem,
    body
  );
  if (!verified) return unauthorized();

  const activity = JSON.parse(body) as APActivity;
  await processInboxActivity(activity, {
    db,
    baseUrl: env.INSTANCE_URL,
    recipient: recipient.privateKeyPem ? { id: recipient.id, username: recipient.username, privateKeyPem: recipient.privateKeyPem } : undefined,
    signingKey: recipient.privateKeyPem ? { id: `${recipient.id}#main-key`, privateKeyPem: recipient.privateKeyPem } : undefined,
  });

  return new Response(null, { status: 202 });
}
