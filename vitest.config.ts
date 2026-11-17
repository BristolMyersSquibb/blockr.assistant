import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";

// The tests run as two projects:
// - The tests in srcts/**/*.test.{ts,tsx} run on happy-dom. They import
//   blockr.core's CoreApi for tests from @blockr/core, which `npm test`
//   installs first, and React from the package's own node_modules.
// - The tests in srcts/**/*.browser.test.ts run in headless Chromium, through
//   Playwright, against the mock of the APIs and of the lists of models that
//   srcts/testing/mock-apis.ts serves from another origin, so that their
//   requests meet CORS as a page's do. On CI, Playwright starts the runner's
//   Chrome. Elsewhere it starts the Chromium that PUPPETEER_EXECUTABLE_PATH
//   names, as a workspace may set it, or else its own, which
//   `npx playwright install chromium` downloads.
const BROWSER = "srcts/**/*.browser.test.ts";

function chromium() {
  if (process.env.CI !== undefined) return { channel: "chrome" };
  const path = process.env.PUPPETEER_EXECUTABLE_PATH;
  return path === undefined || path === "" ? {} : { executablePath: path };
}

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "happy-dom",
          environment: "happy-dom",
          include: ["srcts/**/*.test.{ts,tsx}"],
          exclude: [...configDefaults.exclude, BROWSER],
        },
      },
      {
        test: {
          name: "browser",
          include: [BROWSER],
          globalSetup: ["srcts/testing/mock-apis.ts"],
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
