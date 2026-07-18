import { type NextRequest } from "next/server";
import { json } from "@/lib/cf";

export async function GET(_request: NextRequest): Promise<Response> {
  const baseUrl = new URL(_request.url).origin.toLowerCase();

  return json({
    links: [
      {
        rel: "http://nodeinfo.diaspora.software/ns/schema/2.0",
        href: `${baseUrl}/api/nodeinfo/2.0`,
      },
    ],
  });
}
