import type { NextRequest } from "next/server";
import { getCloudflareContext, json, badRequest } from "@/lib/cf";
import { hashPassword } from "@/lib/auth";
import { getActorByUsername, getActorByEmail, createActor, setEmailVerificationToken } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";
import { detectLocale } from "@/lib/i18n/dict";
import { generateKeyPair } from "@/lib/activitypub/security";

export async function POST(request: NextRequest) {
  const { env } = getCloudflareContext();
  const db = env.DB;

  const { username, email, password, turnstileToken } = await request.json() as {
    username: string;
    email: string;
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

  if (!/^[a-z0-9_]{2,30}$/.test(username)) {
    return badRequest("Username must be 2-30 characters, lowercase alphanumeric or underscore");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return badRequest("Invalid email format");
  }

  if (password.length < 8) {
    return badRequest("Password must be at least 8 characters");
  }

  const domain = request.nextUrl.hostname;

  const existingUsername = await getActorByUsername(db, username, domain);
  if (existingUsername) {
    return badRequest("Username already exists");
  }

  const existingEmail = await getActorByEmail(db, email);
  if (existingEmail) {
    return badRequest("Email already registered");
  }

  const { publicKeyPem, privateKeyPem } = await generateKeyPair();

  const passwordHash = await hashPassword(password);

  const actorId = `${env.INSTANCE_URL}/users/${username}`;
  await createActor(db, {
    id: actorId,
    username,
    domain,
    publicKeyPem,
    privateKeyPem,
    email,
    passwordHash,
  });

  const verificationToken = crypto.randomUUID();
  await setEmailVerificationToken(db, actorId, verificationToken);

  const locale = detectLocale(request.headers.get("accept-language") ?? "");
  const verificationUrl = `${request.nextUrl.origin}/api/auth/verify-email?token=${verificationToken}`;
  await sendVerificationEmail(email, username, verificationUrl, locale);

  return json({ verified: false, message: "Check your email for the verification link.", username, actorId }, 201);
}
