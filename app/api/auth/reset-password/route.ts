import type { NextRequest } from "next/server";
import { getCloudflareContext, json, badRequest } from "@/lib/cf";
import { hashPassword } from "@/lib/auth";
import { getActorByPasswordResetToken, updateActorPassword } from "@/lib/db";
import { sendPasswordResetConfirmation } from "@/lib/email";
import { detectLocale } from "@/lib/i18n/dict";

export async function POST(request: NextRequest) {
  const { env } = getCloudflareContext();
  const db = env.DB;

  const { token, password } = await request.json() as {
    token: string;
    password: string;
  };

  if (password.length < 8) {
    return badRequest("Password must be at least 8 characters");
  }

  const actor = await getActorByPasswordResetToken(db, token);
  if (!actor) {
    return badRequest("Invalid or expired reset link.");
  }

  const passwordHash = await hashPassword(password);
  await updateActorPassword(db, actor.id, passwordHash);

  const locale = detectLocale(request.headers.get("accept-language") ?? "");
  const loginUrl = `${request.nextUrl.origin}/login`;
  await sendPasswordResetConfirmation(actor.email!, actor.username, loginUrl, locale);

  return json({ message: "Password has been reset successfully." });
}
