import { getCloudflareContext, json, unauthorized } from "@/lib/cf";
import { getActorByUsername } from "@/lib/db";
import { extractSigningKeyId } from "@/lib/activitypub/security";
import { verifyIncomingSignature } from "@/lib/activitypub/signer-key";
import { processInboxActivity } from "@/lib/activitypub/inbox";
import type { APActivity } from "@/lib/types";
import type { NextRequest } from "next/server";

// 1 MB is far above any legitimate AP activity we accept.
const MAX_BODY_BYTES = 1_000_000;

// POST /users/:username/inbox — Personal inbox for federation delivery
export async function POST(request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { env } = getCloudflareContext();
  const db = env.DB;
  const { username } = await params;
  const baseUrl = env.INSTANCE_URL;

  const domain = new URL(baseUrl).hostname;
  const recipient = await getActorByUsername(db, username, domain);
  if (!recipient || !recipient.isLocal) return json({ error: "Not found" }, 404);

  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });

  const keyId = extractSigningKeyId(headers);
  if (!keyId) return unauthorized();

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return json({ error: "Could not read request body" }, 400);
  }
  if (rawBody.length > MAX_BODY_BYTES) {
    return json({ error: "Payload too large" }, 413);
  }

  let activity: APActivity;
  try {
    activity = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const actorId = typeof activity.actor === "string" ? activity.actor : activity.actor?.id;
  if (!actorId) return json({ error: "Missing actor" }, 400);

  const signingActorId = keyId.replace(/#.*$/, "");
  const signingKey = recipient.privateKeyPem
    ? { id: recipient.id, privateKeyPem: recipient.privateKeyPem }
    : undefined;

  const check = await verifyIncomingSignature(db, {
    method: "POST",
    url: `${baseUrl}/users/${username}/inbox`,
    headers,
    body: rawBody,
    signingKeyId: keyId,
    signingKey,
  });
  if (!check.ok) {
    const detail = check.status ? ` (HTTP ${check.status})` : "";
    console.warn(`[inbox] ${check.reason} for ${signingActorId}${detail} (user ${username})`);
    return check.reason === "no-key"
      ? json({ error: "Cannot verify signature: no public key" }, 503)
      : json({ error: "Invalid HTTP signature" }, 401);
  }

  try {
    await processInboxActivity(activity, {
      db,
      baseUrl,
      signingActorId,
      signingKey,
      recipient: recipient.privateKeyPem
        ? { id: recipient.id, username: recipient.username, privateKeyPem: recipient.privateKeyPem }
        : undefined,
    });
  } catch {
    // Still return 202 so the remote server does not keep retrying.
  }

  return new Response(null, { status: 202, headers: { "Cache-Control": "no-store" } });
}
