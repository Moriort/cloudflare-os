import { readFileSync } from "node:fs";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import capnwebValidate from "capnweb-validate/vite";
import { defineConfig } from "vitest/config";
import deployed from "./cloudflare.config.ts";

const { compatibilityDate, compatibilityFlags } = deployed.worker;

/**
 * The Google Doc session against the real Docs and Drive APIs. Opt-in: `GOOGLE_DOCS_LIVE_TOKEN_FILE`
 * names a file holding an access token with the `documents` and `drive.file` scopes, and without it
 * every test is skipped. The suite creates its own documents and deletes them afterwards.
 */
const tokenFile = process.env.GOOGLE_DOCS_LIVE_TOKEN_FILE;
const GOOGLE_DOCS_LIVE_TOKEN = tokenFile ? readFileSync(tokenFile, "utf8").trim() : "";

export default defineConfig({
  plugins: [
    capnwebValidate(),
    cloudflareTest({
      main: "./__tests__/worker.ts",
      miniflare: {
        compatibilityDate,
        compatibilityFlags,
        bindings: { GOOGLE_DOCS_LIVE_TOKEN },
        durableObjects: {
          GOOGLE_DOC_GATEKEEPER: { className: "GoogleDocGatekeeperImpl", useSQLite: true },
          TEST_HOOKS: { className: "TestHooks", useSQLite: true },
          USER_ACCOUNT: { className: "UserAccount", useSQLite: true },
        },
      },
    }),
  ],
  test: {
    include: ["__tests__/live/*.test.ts"],
    setupFiles: ["@gadgets/scripts/assert-workerd"],
    testTimeout: 60_000,
  },
});
