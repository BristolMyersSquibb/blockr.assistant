// Pi's code for each API that the assistant speaks, which the page loads by
// pi's name for the API (./apis.ts).

import { describe, expect, test } from "vitest";
import { loadApi } from "./apis.ts";
import * as anthropicMessages from "./vendor-anthropic-messages.ts";
import * as openaiCompletions from "./vendor-openai-completions.ts";
import * as openaiResponses from "./vendor-openai-responses.ts";

describe("loading the code of an API", () => {
  test.each([
    { api: "anthropic-messages", code: anthropicMessages },
    { api: "openai-completions", code: openaiCompletions },
    { api: "openai-responses", code: openaiResponses },
  ])("loads pi's code for $api", async ({ api, code }) => {
    await expect(loadApi(api)).resolves.toBe(code);
  });

  test("rejects for an API that the assistant does not speak", async () => {
    await expect(loadApi("google-generative-ai")).rejects.toThrow('The assistant speaks no API named "google-generative-ai".');
  });
});
