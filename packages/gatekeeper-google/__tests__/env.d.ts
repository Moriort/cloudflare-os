/// <reference types="@cloudflare/vitest-pool-workers/types" />

import type { TestHooks, UserAccount } from "./worker.js";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_HOOKS: DurableObjectNamespace<TestHooks>;
      USER_ACCOUNT: DurableObjectNamespace<UserAccount>;
      /** The live suite's access token, or "" to skip it; see vitest.docs-live.config.ts. */
      GOOGLE_DOCS_LIVE_TOKEN: string;
    }
  }
}
