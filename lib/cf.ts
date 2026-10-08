/**
 * Response helpers shared by the API routes.
 *
 * Bindings are read directly with `import { env } from "cloudflare:workers"`
 * (typed through `Cloudflare.Env`, see worker-configuration.d.ts) — there is no
 * request-context indirection anymore.
 */

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function activityJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/activity+json; charset=utf-8" },
  });
}

export function notFound(message = "Not found"): Response {
  return json({ error: message }, 404);
}

export function badRequest(message = "Bad request"): Response {
  return json({ error: message }, 422);
}

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "The access token is invalid" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": 'Basic realm="cf-git"',
    },
  });
}

export function unauthorizedJson(): Response {
  return json({ error: "The access token is invalid" }, 401);
}
