import type { NextRequest } from "next/server";
import { getCloudflareContext } from "@/lib/cf";
import { verifyEmailByToken } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { env } = getCloudflareContext();
  const db = env.DB;

  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return Response.redirect(new URL("/?verified=false", request.url));
  }

  const actorId = await verifyEmailByToken(db, token);

  if (actorId) {
    return Response.redirect(new URL("/?verified=true", request.url));
  }

  return Response.redirect(new URL("/?verified=false", request.url));
}
