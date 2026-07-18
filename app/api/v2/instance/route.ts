import { getCloudflareContext, json } from "@/lib/cf";

export async function GET() {
  const { env } = getCloudflareContext();

  return json({
    domain: new URL(env.INSTANCE_URL).hostname,
    title: env.INSTANCE_TITLE ?? "cf-git",
    version: env.INSTANCE_VERSION ?? "1.0.0",
    source_url: "https://github.com/anomalyco/cf-git",
    description: env.INSTANCE_DESCRIPTION ?? "",
    thumbnail: null,
    languages: ["en"],
    registrations: false,
    approval_required: false,
    invites_enabled: false,
    configuration: {
      accounts: { max_featured_tags: 10 },
      statuses: { max_characters: 500, max_media_attachments: 4, characters_reserved_per_url: 23 },
      media_attachments: { supported_mime_types: ["image/jpeg", "image/png", "image/webp"], image_size_limit: 10485760, image_matrix_limit: 2000, video_size_limit: 0, video_frame_rate_limit: 0, video_matrix_limit: 0 },
      polls: { max_options: 4, max_characters_per_option: 50, min_expiration: 300, max_expiration: 2629746 },
      translation: { enabled: false },
    },
    contact: { email: "", account: null },
    rules: [],
  });
}
