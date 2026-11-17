// The base URL's list of models (./list.ts): where each API's list is, what
// the request for it carries, which models of each list take tools, and what
// a request that fails gives. The entries follow the lists as OpenAI,
// Anthropic, OpenRouter and Vercel's AI Gateway gave them on 2026-11-16,
// with the fields that the assistant reads.

import { describe, expect, test } from "vitest";
import type { Deployment } from "../deployment/index.ts";
import { askList, listUrl, toolModels } from "./list.ts";
import type { Fetch } from "./list.ts";

function deployment(baseUrl: string, api: string): Deployment {
  return { baseUrl, api, credential: { kind: "none" }, models: undefined };
}

// A fetch that answers each request with the response that the function given
// makes, and records each request.
function fetching(respond: (url: string) => Response | Promise<Response>) {
  const asked: { url: string; headers: Headers }[] = [];
  const fetch: Fetch = (url, init) => {
    asked.push({ url, headers: new Headers(init.headers) });
    return Promise.resolve(respond(url));
  };
  return { fetch, asked };
}

const signal = new AbortController().signal;

describe("the list of models", () => {
  test("is where the SDK of each API finds it, after the base URL", () => {
    expect(listUrl(deployment("https://api.openai.com/v1", "openai-responses"))).toBe("https://api.openai.com/v1/models");
    expect(listUrl(deployment("https://openrouter.ai/api/v1", "openai-completions"))).toBe("https://openrouter.ai/api/v1/models");
    expect(listUrl(deployment("https://api.anthropic.com", "anthropic-messages"))).toBe("https://api.anthropic.com/v1/models?limit=1000");
  });

  test("keeps the models of OpenAI's list whose ids name no kind of model that takes no tools", () => {
    const ids = [
      "gpt-realtime-2.1-mini",
      "gpt-5.4",
      "text-embedding-3-small",
      "gpt-4o-mini-tts",
      "whisper-1",
      "gpt-5.4-nano",
      "omni-moderation-latest",
      "gpt-image-2",
      "gpt-4o-transcribe",
      "gpt-5-search-api",
      "gpt-audio-mini",
      "gpt-live-1",
      "chat-latest",
      "o3",
      "gpt-5.4-2026-03-05",
    ];

    expect(toolModels(ids.map((id) => ({ id, object: "model", created: 1782254706, owned_by: "system" })), "openai-responses")).toEqual([
      "gpt-5.4",
      "gpt-5.4-nano",
      "chat-latest",
      "o3",
      "gpt-5.4-2026-03-05",
    ]);
  });

  test("keeps every model of Anthropic's list, whose capabilities name no tool use", () => {
    const entries = ["claude-fable-5-2", "claude-haiku-5-5", "claude-sonnet-5-5"].map((id) => ({
      type: "model",
      id,
      display_name: id,
      capabilities: { image_input: { supported: true }, thinking: { supported: true } },
      max_tokens: 128000,
    }));

    expect(toolModels(entries, "anthropic-messages")).toEqual(["claude-fable-5-2", "claude-haiku-5-5", "claude-sonnet-5-5"]);
  });

  test("keeps the models of OpenRouter's list that take tools and whose endpoints name a path of the calls' API", () => {
    const paths = ["/api/v1/chat/completions", "/api/v1/completions", "/api/v1/messages", "/api/v1/responses"];
    const entries = [
      { id: "tencent/hy4-flash", supported_parameters: ["max_tokens", "tool_choice", "tools"], endpoints: paths },
      { id: "google/gemini-4-hydrogen:batch", supported_parameters: ["tools"], endpoints: ["/api/v1/batches"] },
      { id: "some/model-without-tools", supported_parameters: ["max_tokens", "temperature"], endpoints: paths },
      { id: "openai/gpt-5.4", supported_parameters: ["tools", "reasoning"], endpoints: paths },
      { id: "openai/gpt-5.4-image-2", supported_parameters: ["tools"], endpoints: ["/api/v1/images"] },
    ];

    expect(toolModels(entries, "openai-completions")).toEqual(["tencent/hy4-flash", "openai/gpt-5.4"]);
    expect(toolModels(entries, "anthropic-messages")).toEqual(["tencent/hy4-flash", "openai/gpt-5.4"]);
    expect(toolModels([{ id: "chat/only", supported_parameters: ["tools"], endpoints: ["/api/v1/chat/completions"] }], "openai-responses")).toEqual([]);
  });

  test("keeps the models of Vercel's list whose type is language and whose tags hold tool-use", () => {
    const entries = [
      { id: "alibaba/qwen-3-14b", object: "model", type: "language", tags: ["reasoning", "tool-use"], supported_parameters: ["tools"] },
      { id: "openai/text-embedding-3-small", object: "model", type: "embedding", tags: [] },
      { id: "spacexai/grok-voice-3.0", object: "model", type: "realtime", tags: ["tool-use"], supported_parameters: ["tools"] },
      { id: "some/language-model", object: "model", type: "language", tags: ["reasoning"], supported_parameters: ["max_tokens"] },
      { id: "anthropic/claude-sonnet-5.5", object: "model", type: "language", tags: ["tool-use", "vision"] },
    ];

    expect(toolModels(entries, "openai-completions")).toEqual(["alibaba/qwen-3-14b", "anthropic/claude-sonnet-5.5"]);
  });

  test("keeps the list's order, without an entry that names no id or a model that it named before", () => {
    expect(toolModels([{ id: "b" }, { name: "no id" }, { id: "" }, "c", { id: "a" }, { id: "b" }], "openai-responses")).toEqual(["b", "a"]);
  });
});

describe("a request for the list", () => {
  test("carries the key in Authorization for OpenAI's APIs, and gives the models that take tools", async () => {
    const { fetch, asked } = fetching(() => Response.json({ object: "list", data: [{ id: "whisper-1" }, { id: "gpt-5.4" }] }));

    const listed = await askList(deployment("https://api.openai.com/v1", "openai-responses"), "sk-test", fetch, signal);

    expect(listed).toEqual({ kind: "listed", models: ["gpt-5.4"] });
    expect(asked.map(({ url, headers }) => [url, Object.fromEntries(headers)])).toEqual([["https://api.openai.com/v1/models", { authorization: "Bearer sk-test" }]]);
  });

  test("carries the key in x-api-key for Anthropic's API, with its version and the header by which a page opts in", async () => {
    const { fetch, asked } = fetching(() => Response.json({ data: [{ type: "model", id: "claude-haiku-5-5" }], has_more: false }));

    await askList(deployment("https://api.anthropic.com", "anthropic-messages"), "sk-ant-test", fetch, signal);

    expect(Object.fromEntries(asked[0]?.headers ?? [])).toEqual({
      "anthropic-dangerous-direct-browser-access": "true",
      "anthropic-version": "2023-06-01",
      "x-api-key": "sk-ant-test",
    });
  });

  test("carries no key where the deployment gives none", async () => {
    const openai = fetching(() => Response.json({ data: [{ id: "gpt-5.4" }] }));
    const anthropic = fetching(() => Response.json({ data: [{ id: "claude-haiku-5-5" }] }));

    await askList(deployment("https://proxy.invalid/v1", "openai-completions"), undefined, openai.fetch, signal);
    await askList(deployment("https://proxy.invalid", "anthropic-messages"), undefined, anthropic.fetch, signal);

    expect(Object.fromEntries(openai.asked[0]?.headers ?? [])).toEqual({});
    expect(Object.fromEntries(anthropic.asked[0]?.headers ?? [])).toEqual({
      "anthropic-dangerous-direct-browser-access": "true",
      "anthropic-version": "2023-06-01",
    });
  });

  test("is refused where the base URL refuses its key, with the message of the base URL's error", async () => {
    const { fetch } = fetching(() => Response.json({ error: { message: "Incorrect API key provided.", type: "invalid_request_error" } }, { status: 401 }));

    await expect(askList(deployment("https://api.openai.com/v1", "openai-responses"), "sk-wrong", fetch, signal)).resolves.toEqual({
      kind: "refused",
      message: 'The base URL refused the assistant\'s key for its list of models at https://api.openai.com/v1/models: it answered 401, "Incorrect API key provided.".',
    });
  });

  test("fails where the base URL gives no list, cannot be reached, or lists no model that takes tools", async () => {
    const at = deployment("https://proxy.invalid/v1", "openai-completions");
    const failed = async (respond: (url: string) => Response | Promise<Response>) => askList(at, undefined, fetching(respond).fetch, signal);

    await expect(failed(() => new Response("Not Found", { status: 404 }))).resolves.toEqual({
      kind: "failed",
      message:
        "The assistant offers no model, since the base URL gives no list of models at https://proxy.invalid/v1/models: it answered 404. An app on such a base URL names its models in the blockr option assistant_models.",
    });
    await expect(failed(() => Promise.reject(new TypeError("Failed to fetch")))).resolves.toEqual({
      kind: "failed",
      message: "The assistant offers no model, since it could not reach the list of models at https://proxy.invalid/v1/models: Failed to fetch",
    });
    await expect(failed(() => new Response("<html></html>"))).resolves.toMatchObject({ kind: "failed" });
    await expect(failed(() => Response.json({ models: [] }))).resolves.toEqual({
      kind: "failed",
      message:
        "The assistant offers no model, since the answer at https://proxy.invalid/v1/models holds no list of models in its data. An app on such a base URL names its models in the blockr option assistant_models.",
    });
    await expect(failed(() => Response.json({ data: [{ id: "text-embedding-3-small" }] }))).resolves.toEqual({
      kind: "failed",
      message:
        "The assistant offers no model, since the list of models at https://proxy.invalid/v1/models holds none that takes tools. An app on such a base URL names its models in the blockr option assistant_models.",
    });
  });
});
