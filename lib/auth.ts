import { getCloudflareContext } from "@/lib/cf";
import type { LocalActor } from "@/lib/types";

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, "0")).join("");
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key,
    256
  );
  const hashHex = Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key,
    256
  );
  const computedHash = Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return computedHash === hashHex;
}

export async function createSessionToken(
  db: D1Database,
  actorId: string,
  userId: string
): Promise<string> {
  const token = crypto.randomUUID();
  await db
    .prepare("INSERT INTO sessions (id, actor_id, user_id, token, created_at) VALUES (?, ?, ?, ?, datetime('now'))")
    .bind(crypto.randomUUID(), actorId, userId, token)
    .run();
  return token;
}

export async function getSessionActor(
  db: D1Database,
  token: string
): Promise<{ id: string; username: string; domain: string } | null> {
  const row = await db
    .prepare("SELECT a.id, a.username, a.domain FROM sessions s JOIN actors a ON a.id = s.actor_id WHERE s.token = ? AND s.expires_at IS NULL")
    .bind(token)
    .first() as { id: string; username: string; domain: string } | null;
  return row ?? null;
}

export interface AuthSession {
  actorId: string;
  username: string;
  domain: string;
}
