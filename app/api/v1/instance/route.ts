import { getCloudflareContext, json } from "@/lib/cf";

export async function GET() {
  const { env } = getCloudflareContext();

  return json({
    uri: env.INSTANCE_URL,
    title: env.INSTANCE_TITLE ?? "cf-git",
    short_description: env.INSTANCE_DESCRIPTION ?? "",
    description: env.INSTANCE_DESCRIPTION ?? "",
    version: env.INSTANCE_VERSION ?? "1.0.0",
    urls: {
      streaming_api: env.INSTANCE_URL,
    },
    stats: {
      user_count: 0,
      status_count: 0,
      domain_count: 0,
    },
    thumbnail: null,
    languages: ["en"],
    contact_account: null,
    max_toot_chars: 500,
  });
}
