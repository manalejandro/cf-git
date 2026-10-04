import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Signature, Digest, Date",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // The actor documents advertise the shared inbox at /inbox; internally it is
  // served by the /api/inbox route.
  const { pathname } = request.nextUrl;
  if (pathname === "/inbox") {
    const url = request.nextUrl.clone();
    url.pathname = "/api/inbox";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
