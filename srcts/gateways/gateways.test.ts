// The headers that a page's request to a gateway leaves out (./gateways.ts),
// as the answer of Vercel's AI Gateway to a page's preflight listed the
// headers that it allows on 2026-11-20.

import { describe, expect, test } from "vitest";
import { refusesHeader } from "./gateways.ts";

const REFUSED = ["x-stainless-os", "X-Stainless-Retry-Count", "user-agent", "User-Agent", "anthropic-dangerous-direct-browser-access"];
const ALLOWED = ["authorization", "x-api-key", "content-type", "accept", "anthropic-version", "anthropic-beta"];

describe("the headers that a request leaves out", () => {
  test.each(["https://ai-gateway.vercel.sh/v1", "https://ai-gateway.vercel.sh"])("are those that Vercel's AI Gateway does not allow, at %s", (baseUrl) => {
    expect(REFUSED.filter((name) => refusesHeader(baseUrl, name))).toEqual(REFUSED);
    expect(ALLOWED.filter((name) => refusesHeader(baseUrl, name))).toEqual([]);
  });

  test.each(["https://api.anthropic.com", "https://api.openai.com/v1", "https://openrouter.ai/api/v1", "https://proxy.invalid/ai-gateway.vercel.sh", "not a URL"])(
    "are none at %s",
    (baseUrl) => {
      expect([...REFUSED, ...ALLOWED].filter((name) => refusesHeader(baseUrl, name))).toEqual([]);
    },
  );
});
