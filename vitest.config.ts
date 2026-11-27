import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";

// The tests run as two projects:
// - The tests in srcts/**/*.test.{ts,tsx} run on happy-dom. They import
//   blockr.core's CoreApi for tests from @blockr/core, which `npm test`
//   installs first, and React from the package's own node_modules.
//   A test fails on an error or a warning that it prints and does not set off
//   on purpose.
//   The setup of blockr.ui's stubs fails it, and the assistant's own setup
//   allows one error of core's for now (srcts/testing/setup.ts).
// - The tests in srcts/**/*.browser.test.ts run in headless Chromium, through
//   Playwright, against the mock of the APIs and of the lists of models that
//   srcts/testing/mock-apis.ts serves from another origin, so that their
//   requests meet CORS as a page's do. On CI, Playwright starts the runner's
//   Chrome. Elsewhere it starts the Chromium that PUPPETEER_EXECUTABLE_PATH
//   names, as a workspace may set it, or else its own, which
//   `npx playwright install chromium` downloads.
//   These tests run without the setup of blockr.ui's stubs, since that setup
//   runs in Node alone.
const BROWSER = "srcts/**/*.browser.test.ts";

// Gives a Markdown file that a module imports with { type: "text" }, as the
// texts of the system prompt are, as a module whose default export is the
// file's text, as esbuild's build gives it. Vite reads it as JavaScript
// otherwise.
const markdownText = {
  name: "blockr-assistant-markdown-text",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    return id.replace(/\?.*$/, "").endsWith(".md") ? { code: `export default ${JSON.stringify(code)};`, map: null } : undefined;
  },
};

function chromium() {
  if (process.env.CI !== undefined) return { channel: "chrome" };
  const path = process.env.PUPPETEER_EXECUTABLE_PATH;
  return path === undefined || path === "" ? {} : { executablePath: path };
}

export default defineConfig({
  test: {
    // Each run collects the coverage of both projects.
    // So `npm test` writes coverage/lcov.info, which CI uploads to Codecov.
    // The lcov reporter writes that file, as the default reporters write none.
    // Istanbul measures the coverage, as in blockr.core,
    // so that the packages measure it the same way.
    // Istanbul counts the code of the sources in srcts alone.
    // V8 counts all the code that runs, the libraries in node_modules included.
    // That makes the tests slower.
    // With `include` set, a source that no test imports counts as uncovered.
    // Vitest leaves the test files out by itself, and `exclude` leaves out the
    // helpers of the tests in srcts/testing.
    coverage: {
      enabled: true,
      provider: "istanbul",
      reporter: ["text", "lcov"],
      include: ["srcts/**/*.{ts,tsx}"],
      exclude: ["srcts/testing/**"],
    },
    projects: [
      {
        plugins: [markdownText],
        test: {
          name: "happy-dom",
          environment: "happy-dom",
          include: ["srcts/**/*.test.{ts,tsx}"],
          exclude: [...configDefaults.exclude, BROWSER],
          setupFiles: ["@blockr/ui/stubs/setup", "./srcts/testing/setup.ts"],
        },
      },
      {
        plugins: [markdownText],
        test: {
          name: "browser",
          include: [BROWSER],
          globalSetup: ["srcts/testing/mock-apis.ts"],
          // The test files share the mock's record of requests, and each file
          // clears it before each of its tests.
          // So the files run one at a time, and neither clears the requests
          // that a test of the other is about to read.
          fileParallelism: false,
          browser: {
            enabled: true,
            headless: true,
            // The tests draw nothing, so a screenshot of a failure shows nothing.
            screenshotFailures: false,
            provider: playwright({ launchOptions: chromium() }),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
