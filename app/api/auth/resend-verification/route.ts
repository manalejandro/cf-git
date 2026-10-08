import type { NextRequest } from "next/server";
import { json } from "@/lib/cf";
import { getActorByEmail, setEmailVerificationToken } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";
import { detectLocale } from "@/lib/i18n/dict";
import { env } from "cloudflare:workers";

export async function POST(request: NextRequest) {
  const db = env.DB;

  const { email } = await request.json() as { email: string };

  const actor = await getActorByEmail(db, email);

  if (actor && !actor.emailVerified) {
    const verificationToken = crypto.randomUUID();
    await setEmailVerificationToken(db, actor.id, verificationToken);

    const locale = detectLocale(request.headers.get("accept-language") ?? "");
    const verificationUrl = `${request.nextUrl.origin}/api/auth/verify-email?token=${verificationToken}`;
    await sendVerificationEmail(email, actor.username, verificationUrl, locale);
  }

  return json({ message: "If that email is registered, a new verification link will be sent." });
}
