import type { NextRequest } from "next/server";
import { getCloudflareContext, json, badRequest } from "@/lib/cf";
import { getActorByEmail, setPasswordResetToken } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";
import { detectLocale } from "@/lib/i18n/dict";

export async function POST(request: NextRequest) {
  const { env } = getCloudflareContext();
  const db = env.DB;

  const { email } = await request.json() as { email: string };

  const actor = await getActorByEmail(db, email);

  if (actor) {
    const token = await setPasswordResetToken(db, actor.id);
    const locale = detectLocale(request.headers.get("accept-language") ?? "");
    const resetUrl = `${request.nextUrl.origin}/reset-password?token=${token}`;
    await sendPasswordResetEmail(email, actor.username, resetUrl, locale);
  }

  return json({ message: "If that email is registered, you will receive a password reset link." });
}
