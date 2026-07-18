import { signRequest } from "./security";
import type { APActivity, APActor } from "@/lib/types";

const AP_CONTENT_TYPE = "application/activity+json";
const AP_ACCEPT = 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"';
const REQUEST_TIMEOUT_MS = 10_000;

export async function deliverToInbox(
  inboxUrl: string,
  activity: APActivity,
  senderKeyId: string,
  privateKeyPem: string
): Promise<{ ok: boolean; status: number; error?: string }> {
  const body = JSON.stringify(activity);
  const headers = await signRequest("POST", inboxUrl, body, privateKeyPem, senderKeyId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(inboxUrl, {
      method: "POST",
      headers: { "Content-Type": AP_CONTENT_TYPE, Accept: AP_ACCEPT, ...headers },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { ok: res.ok, status: res.status };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, status: 0, error: String(err) };
  }
}

export async function deliverToInboxes(
  inboxUrls: string[],
  activity: APActivity,
  senderKeyId: string,
  privateKeyPem: string
): Promise<void> {
  const unique = [...new Set(inboxUrls)];
  await Promise.allSettled(unique.map((url) => deliverToInbox(url, activity, senderKeyId, privateKeyPem)));
}

export async function fetchRemoteObject(
  url: string,
  senderKeyId?: string,
  privateKeyPem?: string
): Promise<APActor | null> {
  const additionalHeaders: Record<string, string> = {};
  if (senderKeyId && privateKeyPem) {
    const signed = await signRequest("GET", url, null, privateKeyPem, senderKeyId);
    Object.assign(additionalHeaders, signed);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: AP_ACCEPT, ...additionalHeaders }, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    if (!(res.headers.get("content-type") ?? "").includes("json")) return null;
    return (await res.json()) as APActor;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

export async function collectFollowerInboxes(
  followerIds: string[],
  fetchActor: (id: string) => Promise<{ id: string; inbox: string | null; endpoints?: { sharedInbox?: string } } | null>
): Promise<string[]> {
  const inboxes: string[] = [];
  const sharedInboxes = new Set<string>();
  await Promise.allSettled(
    followerIds.map(async (id: string) => {
      const actor = await fetchActor(id);
      if (!actor) return;
      const shared = actor.endpoints?.sharedInbox;
      if (shared) {
        if (!sharedInboxes.has(shared)) { sharedInboxes.add(shared); inboxes.push(shared); }
      } else if (actor.inbox) {
        inboxes.push(actor.inbox);
      }
    })
  );
  return inboxes;
}

export async function resolveWebFinger(acct: string): Promise<string | null> {
  const normalized = acct.replace(/^@/, "");
  const [, domain] = normalized.split("@");
  if (!domain) return null;
  try {
    const url = `https://${domain}/.well-known/webfinger?resource=acct:${normalized}`;
    const res = await fetch(url, { headers: { Accept: "application/jrd+json, application/json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as { links?: { rel: string; href: string }[] };
    return data.links?.find((l) => l.rel === "self")?.href ?? null;
  } catch { return null; }
}
