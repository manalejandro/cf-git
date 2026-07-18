import { getCloudflareContext, json } from "@/lib/cf";

export async function GET(_request: Request, { params }: { params: Promise<{ version: string }> }) {
  const { env } = getCloudflareContext();

  return json({
    version: "2.0",
    software: {
      name: "cf-git",
      version: env.INSTANCE_VERSION ?? "1.0.0",
      repository: "https://github.com/anomalyco/cf-git",
    },
    protocols: ["activitypub"],
    services: {
      inbound: [],
      outbound: [],
    },
    openRegistrations: false,
    usage: {
      users: { total: 0, activeHalfyear: 0, activeMonth: 0 },
      localPosts: 0,
    },
    metadata: {},
  });
}
