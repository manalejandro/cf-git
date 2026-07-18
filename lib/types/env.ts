export interface CloudflareEnv {
  DB: D1Database;
  EMAIL: SendEmail;
  DELIVERY_QUEUE: Queue;
  GIT: R2Bucket;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  INSTANCE_TITLE: string;
  INSTANCE_DESCRIPTION: string;
  INSTANCE_VERSION: string;
  INSTANCE_URL: string;
  NODE_ENV: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  EMAIL_FROM: string;
  EMAIL_FROM_NAME: string;
  MAX_REPO_SIZE_MB: string;
  MAX_REPO_FILE_SIZE_MB: string;
}

export type SendEmail = {
  send: (msg: { to: string; from: { email: string; name: string }; subject: string; html: string }) => Promise<void>;
};
