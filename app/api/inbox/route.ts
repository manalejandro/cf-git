import { json, unauthorized } from "@/lib/cf";
import { getActorById } from "@/lib/db";
import { extractSigningKeyId } from "@/lib/activitypub/security";
import { purgeGoneSignerData, verifyIncomingSignature } from "@/lib/activitypub/signer-key";
import { processInboxActivity } from "@/lib/activitypub/inbox";
import type { APActivity } from "@/lib/types";
import { env } from "cloudflare:workers";

// 1 MB is far above any legitimate AP activity we accept.
const MAX_BODY_BYTES = 1_000_000;

// POST /inbox — Shared inbox for federation delivery
export async function POST(request: Request) {
  const db = env.DB;
  const baseUrl = env.INSTANCE_URL;

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

  let signingKey: { id: string; privateKeyPem: string } | undefined;
  try {
    const localRow = await db
      .prepare("SELECT id, private_key_pem FROM actors WHERE is_local = 1 AND private_key_pem IS NOT NULL LIMIT 1")
      .first<{ id: string; private_key_pem: string }>();
    if (localRow?.private_key_pem) {
      signingKey = { id: localRow.id, privateKeyPem: localRow.private_key_pem };
    }
  } catch { /* ignore */ }

  const check = await verifyIncomingSignature(db, {
    method: "POST",
    url: `${baseUrl}/inbox`,
    headers,
    body: rawBody,
    signingKeyId: keyId,
    signingKey,
  });
  if (!check.ok) {
    const activityType = typeof activity.type === "string" ? activity.type.toLowerCase() : "";
    const activityObject = activity.object;
    const activityObjectId = typeof activityObject === "string" ? activityObject : (activityObject as { id?: string } | undefined)?.id ?? "";

    if (check.reason === "gone" && activityType === "delete") {
      const purged = await purgeGoneSignerData(db, check, signingActorId);
      if (purged) console.warn(`[inbox] purged cached copy of gone actor ${signingActorId}`);
      return json({ status: "accepted" }, 202);
    }

    if (check.reason === "no-key" && activityType === "delete" && activityObjectId) {
      const [signer, target] = await Promise.all([
        getActorById(db, signingActorId).catch(() => null),
        db.prepare("SELECT id FROM objects WHERE id = ?").bind(activityObjectId).first().catch(() => null),
      ]);
      if (!signer && !target) return json({ status: "accepted" }, 202);
    }

    const detail = check.status ? ` (HTTP ${check.status})` : "";
    console.warn(`[inbox] ${check.reason} for ${signingActorId}${detail} type=${activityType || "?"}`);
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
    });
  } catch {
    // Still return 202 so the remote server does not keep retrying.
  }

  return new Response(null, { status: 202, headers: { "Cache-Control": "no-store" } });
}
