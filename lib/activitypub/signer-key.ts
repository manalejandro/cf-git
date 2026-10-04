/**
 * Inbox signature verification: resolve the signing actor's public key, verify
 * the HTTP signature (draft-cavage or RFC 9421) and cache fetched actors.
 *
 * The keyId may rotate (Mastodon 4.6+): when a cached key fails to verify, the
 * actor document is fetched once more (throttled per isolate) and the key that
 * matches the keyId is used.
 */

import type { D1Database } from "@cloudflare/workers-types";
import type { APActor } from "@/lib/types";
import { getActorById } from "@/lib/db";
import { fetchRemoteObject } from "./federation";
import { verifySignature } from "./security";

export interface LocalSigningKey {
  id: string;
  privateKeyPem: string;
}

export interface SignerKeySuccess {
  ok: true;
  id: string;
  publicKeyPem: string;
}

export interface SignerKeyFailure {
  ok: false;
  /** True when the key will never be resolvable (deleted/gone/malformed actor). */
  permanent: boolean;
  /** HTTP status of the actor fetch (0 = network error / blocked). */
  status: number;
}

export type SignerKeyResult = SignerKeySuccess | SignerKeyFailure;

export interface SignatureCheck {
  ok: boolean;
  /**
   * `gone`: the key is permanently unavailable (deleted/suspended account);
   * `no-key`: the key could not be fetched right now (retryable);
   * `invalid`: a key was available and the signature does not match.
   */
  reason: "ok" | "gone" | "no-key" | "invalid";
  status?: number;
}

/** Per-isolate throttle so a broken sender cannot force a fetch per delivery. */
const refreshMarkers = new Map<string, number>();
const REFRESH_INTERVAL_MS = 300_000;

function isPermanentKeyFailure(status: number): boolean {
  // 301/308: the actor's host permanently redirects to another domain (the
  // old identity is gone; the new account has its own key).
  return status === 301 || status === 308 || status === 400 || status === 403 || status === 404 || status === 410 || status === 422;
}

/** Pick the public key PEM matching the request's keyId when the actor exposes several. */
function publicKeyPemFor(actor: APActor, keyId: string): string | null {
  const raw = actor.publicKey as unknown;
  const keys = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const match = keys.find(
    (k) => k && typeof k === "object" && (k as { id?: string }).id === keyId
  );
  const chosen = (match ?? keys[0]) as { publicKeyPem?: string } | undefined;
  const pem = chosen?.publicKeyPem;
  return typeof pem === "string" && pem.length > 0 ? pem : null;
}

/** Persist a fetched remote actor so later deliveries verify without a fetch. */
export async function cacheRemoteActor(db: D1Database, actor: APActor): Promise<void> {
  const username = actor.preferredUsername ?? actor.id.split("/").filter(Boolean).pop() ?? actor.id;
  let domain = "";
  try {
    domain = new URL(actor.id).hostname;
  } catch { /* keep empty */ }
  const pem = publicKeyPemFor(actor, "");
  await db
    .prepare(
      `INSERT INTO actors (id, username, domain, display_name, summary, avatar_url, header_url, public_key_pem, inbox, is_local, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         username = excluded.username,
         domain = excluded.domain,
         display_name = excluded.display_name,
         summary = excluded.summary,
         avatar_url = excluded.avatar_url,
         header_url = excluded.header_url,
         public_key_pem = excluded.public_key_pem,
         inbox = excluded.inbox,
         updated_at = datetime('now')`
    )
    .bind(
      actor.id,
      username,
      domain,
      actor.name ?? null,
      actor.summary ?? null,
      actor.icon?.url ?? null,
      actor.image?.url ?? null,
      pem ?? "",
      actor.inbox ?? null
    )
    .run();
}

/**
 * Resolve the public key of the actor that signed an inbox request, using the
 * cached actor first and fetching the remote document when needed.
 */
export async function resolveSignerKey(
  db: D1Database,
  keyId: string,
  signingKey?: LocalSigningKey | null,
  options: { forceRefresh?: boolean } = {}
): Promise<SignerKeyResult> {
  const actorId = keyId.replace(/#.*$/, "");
  if (!actorId.startsWith("https://")) return { ok: false, permanent: true, status: 0 };

  if (!options.forceRefresh) {
    const cached = await getActorById(db, actorId);
    if (cached?.publicKeyPem) {
      return { ok: true, id: cached.id, publicKeyPem: cached.publicKeyPem };
    }
    // Never fetch a local actor over the network (a self-fetch would time out).
    if (cached?.isLocal) return { ok: false, permanent: true, status: 0 };
  }

  const fetched = (await fetchRemoteObject(
    actorId,
    signingKey ? `${signingKey.id}#main-key` : undefined,
    signingKey?.privateKeyPem
  )) as APActor | null;
  if (!fetched?.id || typeof fetched.id !== "string") {
    return { ok: false, permanent: false, status: 0 };
  }

  const pem = publicKeyPemFor(fetched, keyId);
  if (!pem) return { ok: false, permanent: isPermanentKeyFailure(0), status: 0 };

  try {
    await cacheRemoteActor(db, fetched);
  } catch { /* best-effort cache */ }

  return { ok: true, id: fetched.id, publicKeyPem: pem };
}

/**
 * Verify an inbox request's HTTP signature, refreshing the signer's key once on
 * failure so rotated keys keep working.
 */
export async function verifyIncomingSignature(
  db: D1Database,
  params: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string | null;
    signingKeyId: string | null;
    signingKey?: LocalSigningKey | null;
  }
): Promise<SignatureCheck> {
  if (!params.signingKeyId) return { ok: false, reason: "invalid" };
  const actorId = params.signingKeyId.replace(/#.*$/, "");
  if (!actorId.startsWith("https://")) return { ok: false, reason: "invalid" };

  const failure = (result: SignerKeyFailure): SignatureCheck =>
    result.permanent
      ? { ok: false, reason: "gone", status: result.status }
      : { ok: false, reason: "no-key", status: result.status };

  let signer = await resolveSignerKey(db, params.signingKeyId, params.signingKey);
  if (!signer.ok) return failure(signer);
  if (await verifySignature(params.method, params.url, params.headers, signer.publicKeyPem, params.body)) {
    return { ok: true, reason: "ok" };
  }

  const lastRefresh = refreshMarkers.get(params.signingKeyId) ?? 0;
  if (Date.now() - lastRefresh < REFRESH_INTERVAL_MS) return { ok: false, reason: "invalid" };
  refreshMarkers.set(params.signingKeyId, Date.now());

  signer = await resolveSignerKey(db, params.signingKeyId, params.signingKey, { forceRefresh: true });
  if (!signer.ok) return failure(signer);
  return (await verifySignature(params.method, params.url, params.headers, signer.publicKeyPem, params.body))
    ? { ok: true, reason: "ok" }
    : { ok: false, reason: "invalid" };
}

/**
 * An activity whose signer key the origin reports as 410 Gone cannot be
 * verified any more, but the origin is stating the account does not exist: purge
 * our cached copy so deleted accounts do not linger. Only an explicit 410 (or a
 * permanent 301/308 host move) triggers this.
 */
export async function purgeGoneSignerData(
  db: D1Database,
  check: SignatureCheck,
  signingActorId: string
): Promise<boolean> {
  if (check.reason !== "gone") return false;
  const status = check.status ?? 0;
  if (status !== 410 && status !== 301 && status !== 308) return false;
  const cached = await getActorById(db, signingActorId);
  if (!cached || cached.isLocal) return false;
  try {
    await db.prepare("DELETE FROM actors WHERE id = ? AND is_local = 0").bind(signingActorId).run();
  } catch {
    return false;
  }
  return true;
}
