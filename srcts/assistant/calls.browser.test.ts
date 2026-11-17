// The assistant's calls to a model and its requests for the list of models,
// from a page in headless Chromium to the mock of the three APIs and of the
// lists of models that another origin serves (../testing/mock-apis.ts), so
// that each request meets CORS as a page's request to a provider does
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.1#where-the-calls-go).
// Each test starts the assistant's plugin class on core's CoreApi for tests,
// with the blockr options of a deployment that point at the mock. A turn then
// runs on pi's own code for the API, through the page's fetch: the model calls
// the tool list_blocks, and replies once it has the tool's result.
// The mock records the body of each call, which shows where pi puts the system
// prompt and the message of the app's in each API's request.

import type { CoreApi, Json } from "@blockr/core";
import { beforeEach, describe, expect, inject, test } from "vitest";
import { startAssistant } from "../testing/index.ts";
import type { RecordedRequest } from "../testing/index.ts";
import { assistantOf } from "./index.ts";

const mock = inject("mockApis");

beforeEach(async () => {
  await fetch(`${mock.origin}/__reset`, { method: "POST" });
});

// The requests that reached the mock, with the method given.
async function reached(method: string): Promise<RecordedRequest[]> {
  const response = await fetch(`${mock.origin}/__requests`);
  return ((await response.json()) as RecordedRequest[]).filter((request) => request.method === method);
}

// The assistant of a board on core's CoreApi for tests, where R holds the
// blockr options given.
async function opened(blockrOptions: Readonly<Record<string, Json>>) {
  const started = await startAssistant({ blockrOptions });
  await started.settled();
  const assistant = assistantOf(started.core);
  if (assistant === undefined) throw new Error("The class's start opened no assistant.");
  await assistant.conversations.opened;
  return { ...started, assistant };
}

// Runs a turn of a conversation that holds a question of the user's, on the
// deployment that the blockr options given make, and gives the conversation
// as the turn left it.
async function turned(blockrOptions: Readonly<Record<string, Json>>) {
  const { core, assistant } = await opened(blockrOptions);
  await assistant.conversations.addConversation("c1", "Blocks");
  await assistant.conversations.addMessage("c1", { id: "u1", role: "user", parts: [{ type: "text", text: "Which blocks does the board hold?" }], created: "2026-11-16T08:00:00.000Z" });
  await assistant.turns.run("c1");
  return { core, conversation: assistant.conversations.get("c1") };
}

function raised(core: CoreApi, code: string): string[] {
  return core.notifications
    .get()
    .filter((notification) => notification.source.kind === "module" && notification.source.code === code)
    .map((notification) => notification.message);
}

// The text of the conversation's last message.
function lastText(conversation: Awaited<ReturnType<typeof turned>>["conversation"]): string | undefined {
  const part = conversation?.messages.at(-1)?.parts[0];
  return part?.type === "text" ? part.text : undefined;
}

type Item = Readonly<Record<string, unknown>>;

// The messages of a call's request: the input of OpenAI's Responses API, or
// the messages of the two others.
function sent(body: Item): readonly Item[] {
  const items = Array.isArray(body.input) ? body.input : body.messages;
  return Array.isArray(items) ? (items as readonly Item[]) : [];
}

// The blocks of a message, or the message's text as one block.
function blocksOf(item: Item | undefined): readonly Item[] {
  const content = item?.content;
  if (typeof content === "string") return [{ type: "text", text: content }];
  return Array.isArray(content) ? (content as readonly Item[]) : [];
}

// The text of a message, in whichever API's shape.
function textOf(item: Item | undefined): string {
  return blocksOf(item)
    .map((block) => (typeof block.text === "string" ? block.text : ""))
    .join("");
}

// The system prompt of a call's request: Anthropic's system, or the first
// message of the role system or developer.
function systemOf(body: Item): string {
  if (Array.isArray(body.system)) return textOf({ content: body.system });
  return textOf(sent(body).find((item) => item.role === "system" || item.role === "developer"));
}

// Whether a message holds the result of a tool call, in whichever API's shape.
function holdsResult(item: Item | undefined): boolean {
  return item?.type === "function_call_output" || item?.role === "tool" || blocksOf(item).some((block) => block.type === "tool_result");
}

// Each API, with the base URLs of the mock that speak it, with and without a
// key, the path that its calls go to at the keyed one, and the header that
// carries the key.
const APIS = [
  { api: "openai-responses", keyed: "/openai/v1", keyless: "/keyless/v1", calls: "/openai/v1/responses", header: "authorization" },
  { api: "openai-completions", keyed: "/openai/v1", keyless: "/keyless/v1", calls: "/openai/v1/chat/completions", header: "authorization" },
  { api: "anthropic-messages", keyed: "/anthropic", keyless: "/keyless", calls: "/anthropic/v1/messages", header: "x-api-key" },
] as const;

describe.each(APIS)("a turn on $api", ({ api, keyed, keyless, calls: path, header }) => {
  test("streams a tool call and a reply from another origin, with the deployment's key on each call", async () => {
    const { core, conversation } = await turned({
      assistant_base_url: `${mock.origin}${keyed}`,
      assistant_api: api,
      assistant_api_key: mock.key,
      assistant_models: "mock-model",
    });

    expect(raised(core, "assistant_call_failed")).toEqual([]);
    expect(conversation?.messages.map((message) => message.role)).toEqual(["user", "assistant", "tool", "assistant"]);
    expect(conversation?.messages[1]?.parts).toMatchObject([{ type: "tool_call", tool: "list_blocks" }]);
    expect(lastText(conversation)).toBe(mock.done);
    const calls = await reached("POST");
    expect(calls.map((call) => call.path)).toEqual([path, path]);
    const key = header === "authorization" ? `Bearer ${mock.key}` : mock.key;
    expect(calls.map((call) => call.headers[header])).toEqual([key, key]);
  });

  test("sends each call the system prompt, and after the conversation's last message the message of the app's with the board", async () => {
    await turned({ assistant_base_url: `${mock.origin}${keyed}`, assistant_api: api, assistant_api_key: mock.key, assistant_models: "mock-model" });

    const calls = (await reached("POST")).map((call) => call.body);
    expect(calls).toHaveLength(2);
    for (const body of calls) {
      expect(systemOf(body)).toMatch(/^You are an assistant embedded next to a blockr data analysis board\.\n/);
      expect(sent(body).at(-1)?.role).toBe("user");
      expect(textOf(sent(body).at(-1))).toMatch(/^This message comes from the app, not from the user\.\n[^]*\n## Board\n6 block\(s\), 7 link\(s\), 1 stack\(s\)\.\n/);
    }
    const [first, second] = calls.map(sent);
    expect(textOf(first?.at(-2))).toBe("Which blocks does the board hold?");
    expect(holdsResult(second?.at(-2))).toBe(true);
  });

  test("calls a base URL that takes no key with no key, which a preflight that allows no key header lets through", async () => {
    const { core, conversation } = await turned({
      assistant_base_url: `${mock.origin}${keyless}`,
      assistant_api: api,
      assistant_api_key: "none",
      assistant_models: "mock-model",
    });

    expect(raised(core, "assistant_call_failed")).toEqual([]);
    expect(lastText(conversation)).toBe(mock.done);
    const calls = await reached("POST");
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.headers).not.toHaveProperty("authorization");
      expect(call.headers).not.toHaveProperty("x-api-key");
    }
  });
});

describe("a turn on Anthropic's Messages API", () => {
  test("marks for the cache the block before the message of the app's, the end of the conversation, and not that message", async () => {
    await turned({ assistant_base_url: `${mock.origin}/anthropic`, assistant_api: "anthropic-messages", assistant_api_key: mock.key, assistant_models: "mock-model" });

    const calls = (await reached("POST")).map((call) => sent(call.body));
    expect(calls).toHaveLength(2);
    for (const messages of calls) {
      expect(blocksOf(messages.at(-1)).some((block) => "cache_control" in block)).toBe(false);
      expect(blocksOf(messages.at(-2)).at(-1)).toHaveProperty("cache_control", { type: "ephemeral" });
      expect(messages.slice(0, -2).flatMap(blocksOf).some((block) => "cache_control" in block)).toBe(false);
    }
  });
});

describe("the list of models from another origin", () => {
  // The settings that a list gives a model: its context window, its cap for a
  // reply and whether it takes images.
  const given = (contextWindow: number, maxTokens: number, images: boolean) => ({ contextWindow, maxTokens, images });

  test.each([
    { list: "OpenAI's", base: "/openai/v1", api: "openai-responses", models: ["gpt-5.4", "gpt-5.4-nano"], settings: [], header: ["authorization", `Bearer ${mock.key}`] },
    {
      list: "Anthropic's",
      base: "/anthropic",
      api: "anthropic-messages",
      models: ["claude-haiku-5-5", "claude-sonnet-5-5"],
      settings: [
        ["claude-haiku-5-5", given(1000000, 128000, true)],
        ["claude-sonnet-5-5", given(1000000, 128000, true)],
      ],
      header: ["x-api-key", mock.key],
    },
    {
      list: "OpenRouter's",
      base: "/openrouter/api/v1",
      api: "openai-completions",
      models: ["openai/gpt-5.4", "deepseek/deepseek-v3.2"],
      settings: [
        ["openai/gpt-5.4", given(1050000, 128000, true)],
        ["deepseek/deepseek-v3.2", given(163840, 147456, false)],
      ],
      header: ["authorization", `Bearer ${mock.key}`],
    },
    {
      list: "Vercel's",
      base: "/vercel/v1",
      api: "openai-completions",
      models: ["anthropic/claude-sonnet-5.5"],
      settings: [["anthropic/claude-sonnet-5.5", given(1000000, 128000, true)]],
      header: ["authorization", `Bearer ${mock.key}`],
    },
  ])("gives the models of $list list that take tools, with the settings that the list gives each, asked for with the deployment's key", async ({ base, api, models, settings, header }) => {
    const { core, assistant } = await opened({ assistant_base_url: `${mock.origin}${base}`, assistant_api: api, assistant_api_key: mock.key });

    const listed = new Map(settings as [string, ReturnType<typeof given>][]);
    await expect(assistant.models.offered()).resolves.toEqual(listed.size === 0 ? { models, named: false } : { models, named: false, settings: listed });
    const [name, value] = header as [string, string];
    expect((await reached("GET")).map((request) => request.headers[name])).toEqual([value]);
    expect(raised(core, "assistant_models_failed")).toEqual([]);
  });

  test("is asked for with no key where the key is none", async () => {
    const { assistant } = await opened({ assistant_base_url: `${mock.origin}/keyless/v1`, assistant_api_key: "none" });

    await expect(assistant.models.offered()).resolves.toEqual({ models: ["gpt-5.4", "gpt-5.4-nano"], named: false });
    expect((await reached("GET")).map((request) => [request.path, request.headers.authorization])).toEqual([["/keyless/v1/models", undefined]]);
  });

  test("raises assistant_call_failed where the base URL refuses the key, whose refusal the page reads", async () => {
    const { core, assistant } = await opened({ assistant_base_url: `${mock.origin}/openai/v1`, assistant_api_key: "wrong-key" });

    const offered = await assistant.models.offered();

    expect(offered.models).toEqual([]);
    expect(raised(core, "assistant_call_failed")).toEqual([
      `The base URL refused the assistant's key for its list of models at ${mock.origin}/openai/v1/models: it answered 401, "Incorrect API key provided.".`,
    ]);
  });

  test("raises assistant_models_failed where the base URL gives no list", async () => {
    const { core, assistant } = await opened({ assistant_base_url: `${mock.origin}/nolist/v1`, assistant_api_key: mock.key });

    await expect(assistant.models.offered()).resolves.toMatchObject({ models: [] });
    expect(raised(core, "assistant_models_failed")).toEqual([
      `The assistant offers no model, since the base URL gives no list of models at ${mock.origin}/nolist/v1/models: it answered 404, "No list here.". An app on such a base URL names its models in the blockr option assistant_models.`,
    ]);
  });
});
