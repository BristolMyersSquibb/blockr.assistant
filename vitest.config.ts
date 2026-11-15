import { defineConfig } from "vitest/config";

// The tests run on happy-dom. They import blockr.core's CoreApi for tests
// from @blockr/core, which `npm test` installs first, and React from the
// package's own node_modules.
export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["srcts/**/*.test.{ts,tsx}"],
  },
});
