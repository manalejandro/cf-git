import type { NextRequest } from "next/server";
import { getCloudflareContext, json, badRequest } from "@/lib/cf";
import { verifyPassword, createSessionToken } from "@/lib/auth";
import { getActorByUsername, getActorByEmail } from "@/lib/db";
import { detectLocale } from "@/lib/i18n/dict";

export async function POST(request: NextRequest) {
  const { env } = getCloudflareContext();
  const db = env.DB;

  const { username, password, turnstileToken } = await request.json() as {
    username: string;
    password: string;
    turnstileToken: string;
  };

  const turnstileRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: turnstileToken }),
    headers: { "Content-Type": "application/json" },
  });
  const turnstileData = await turnstileRes.json() as { success: boolean };
  if (!turnstileData.success) {
    return badRequest("Invalid captcha");
  }

  const domain = request.nextUrl.hostname;

  let actor = await getActorByUsername(db, username, domain);
  if (!actor) {
    actor = await getActorByEmail(db, username);
  }

  if (!actor) {
    return badRequest("Invalid username or password");
  }

  const valid = await verifyPassword(password, actor.passwordHash ?? "");
  if (!valid) {
    return badRequest("Invalid username or password");
  }

  if (!actor.emailVerified) {
    return badRequest("Email not verified. Please check your email for the verification link.");
  }

  const token = await createSessionToken(db, actor.id, actor.id);

  return json({ token, username: actor.username, actorId: actor.id });
}
