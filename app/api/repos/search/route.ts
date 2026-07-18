import { getCloudflareContext, json } from "@/lib/cf";
import { searchRepos } from "@/lib/db";

export async function GET(request: Request) {
  const { env } = getCloudflareContext();
  const db = env.DB;

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  if (!q.trim()) return json([]);

  const repos = await searchRepos(db, q);
  return json(repos);
}
