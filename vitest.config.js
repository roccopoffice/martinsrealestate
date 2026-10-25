import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        isolatedStorage: false,
        miniflare: {
          bindings: {
            SESSION_SECRET: "test-session-secret-value-32chars",
            BOOTSTRAP_TOKEN: "test-bootstrap-token",
            BLOG_APPLY_SCHEMA: "1"
          }
        }
      }
    }
  }
});
