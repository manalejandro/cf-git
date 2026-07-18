import type { NextRequest } from "next/server";
import { getCloudflareContext, json, badRequest, unauthorized } from "@/lib/cf";
import { verifyPassword, hashPassword, getSessionActor } from "@/lib/auth";
import { getActorById, updateActorPassword } from "@/lib/db";

export async function POST(request: NextRequest) {
  const { env } = getCloudflareContext();
  const db = env.DB;

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return unauthorized();
  }

  const sessionToken = authHeader.slice(7);
  const session = await getSessionActor(db, sessionToken);
  if (!session) {
    return unauthorized();
  }

  const { currentPassword, newPassword } = await request.json() as {
    currentPassword: string;
    newPassword: string;
  };

  if (newPassword.length < 8) {
    return badRequest("New password must be at least 8 characters");
  }

  const actor = await getActorById(db, session.id);
  if (!actor || !actor.passwordHash) {
    return unauthorized();
  }

  const valid = await verifyPassword(currentPassword, actor.passwordHash);
  if (!valid) {
    return badRequest("Current password is incorrect");
  }

  const newHash = await hashPassword(newPassword);
  await updateActorPassword(db, actor.id, newHash);

  return json({ message: "Password changed successfully." });
}
