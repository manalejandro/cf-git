/// <reference types="@cloudflare/workers-types" />

import type { CloudflareEnv } from "./lib/types/env";

// `import { env } from "cloudflare:workers"` is typed through Cloudflare.Env:
// extend it with this instance's bindings (lib/types/env.ts) so app code reads
// DB/KV/R2/… without casts.
declare global {
  namespace Cloudflare {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging needs an interface
    interface Env extends CloudflareEnv {}
  }
}
