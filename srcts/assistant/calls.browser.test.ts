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
// Where the deployment sets no key, the test gives the visitor's own key, as
// the chat would, and reads what the base URL's answers did to it.
// The files that the user attaches reach each API in its blocks, and the mock
// refuses a file named refused.pdf, as a provider refuses a file
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#attachments).

import type { CoreApi, Json } from "@blockr/core";
import { beforeEach, describe, expect, inject, test, vi } from "vitest";
import type { KeptFile } from "../conversations/index.ts";
import type { Message } from "../state/index.ts";
import { startAssistant, storedIn } from "../testing/index.ts";
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
// blockr options given, with the visitor's key given, where a test gives one.
async function opened(blockrOptions: Readonly<Record<string, Json>>, key?: string) {
  const started = await startAssistant({ blockrOptions });
  await started.settled();
  const assistant = assistantOf(started.core);
  if (assistant === undefined) throw new Error("The class's start opened no assistant.");
  await assistant.conversations.opened;
  if (key !== undefined) assistant.key.give(key);
  return { ...started, assistant };
}

// Runs a turn of a conversation that holds a question of the user's, on the
// deployment that the blockr options given make, with the visitor's key given,
// where a test gives one, and gives the conversation as the turn left it.
async function turned(blockrOptions: Readonly<Record<string, Json>>, key?: string) {
  const { core, assistant, sent } = await opened(blockrOptions, key);
  await assistant.conversations.addConversation("c1", "Blocks");
  await assistant.conversations.addMessage("c1", { id: "u1", role: "user", parts: [{ type: "text", text: "Which blocks does the board hold?" }], created: "2026-11-16T08:00:00.000Z" });
  await assistant.turns.run("c1");
  return { core, assistant, sent, conversation: assistant.conversations.get("c1") };
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

// Runs a turn of a conversation whose message of the user's, the message
// given, holds files whose content the memory keeps as given.
async function turnedWith(blockrOptions: Readonly<Record<string, Json>>, message: Message, files: readonly KeptFile[]) {
  const { core, assistant } = await opened(blockrOptions);
  await assistant.conversations.addConversation("c1", "Files");
  await assistant.conversations.addMessage("c1", message, { files });
  await assistant.turns.run("c1");
  return { core, assistant };
}

const CREATED = "2026-11-16T08:00:00.000Z";
// The bytes of the files that the tests attach: the start of a PNG and of a
// PDF, as base64.
const PNG = "iVBORw0KGgo=";
const PDF = "JVBERi0xLjQK";

// A copy of a file's bytes, as the memory keeps it, of the bytes that base64
// gives.
function copyOf(base64: string): Blob {
  return new Blob([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))]);
}
const LABEL_PNG = 'The user attached the file "plot.png", of the type image/png.';
const LABEL_PDF = 'The user attached the file "report.pdf", of the type application/pdf.';
const CSV = '<file-attachment name="sales.csv" type="text/csv">\na,b\n1,2\n\n</file-attachment>';

const withFiles: Message = {
  id: "u1",
  role: "user",
  parts: [
    { type: "text", text: "Read these." },
    { type: "attachment", name: "plot.png", media_type: "image/png" },
    { type: "attachment", name: "report.pdf", media_type: "application/pdf" },
    { type: "attachment", name: "sales.csv", media_type: "text/csv" },
  ],
  created: CREATED,
};

// What the first message of the user's holds on each API: the text, the
// image as an image, the PDF in the API's block for a file, and the text file
// as text.
const FILE_BLOCKS: Readonly<Record<string, unknown[]>> = {
  "openai-responses": [
    { type: "input_text", text: "Read these." },
    { type: "input_text", text: LABEL_PNG },
    { type: "input_image", image_url: `data:image/png;base64,${PNG}` },
    { type: "input_text", text: LABEL_PDF },
    { type: "input_file", filename: "report.pdf", file_data: `data:application/pdf;base64,${PDF}` },
    { type: "input_text", text: CSV },
  ],
  "openai-completions": [
    { type: "text", text: "Read these." },
    { type: "text", text: LABEL_PNG },
    { type: "image_url", image_url: { url: `data:image/png;base64,${PNG}` } },
    { type: "text", text: LABEL_PDF },
    { type: "file", file: { filename: "report.pdf", file_data: `data:application/pdf;base64,${PDF}` } },
    { type: "text", text: CSV },
  ],
  "anthropic-messages": [
    { type: "text", text: "Read these." },
    { type: "text", text: LABEL_PNG },
    { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } },
    { type: "text", text: LABEL_PDF },
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: PDF }, title: "report.pdf" },
    { type: "text", text: CSV },
  ],
};

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
      expect(textOf(sent(body).at(-1))).toMatch(/^This message comes from the app, not from the user\.\n\n## Board\n6 block\(s\)( \([^)]*\))?, 7 link\(s\), 1 stack\(s\)\.\n/);
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

describe.each(APIS)("the files of a message on $api", ({ api, keyed }) => {
  const deployment = { assistant_base_url: `${mock.origin}${keyed}`, assistant_api: api, assistant_api_key: mock.key, assistant_models: "mock-model" };

  test("reach the API in its blocks with every call: an image as an image, a PDF as a file and a text file as text", async () => {
    const copies = [copyOf(PNG), copyOf(PDF), new Blob(["a,b\n1,2\n"])] as const;
    const { core, assistant } = await turnedWith(deployment, withFiles, copies.map((blob) => ({ blob })));

    expect(raised(core, "assistant_call_failed")).toEqual([]);
    expect(raised(core, "assistant_attachment_refused")).toEqual([]);
    const calls = await reached("POST");
    expect(calls).toHaveLength(2);
    for (const call of calls) expect(blocksOf(sent(call.body).find((item) => item.role === "user"))).toMatchObject(FILE_BLOCKS[api] ?? []);
    expect(assistant.conversations.kept("c1", "u1")?.files).toEqual([
      { blob: copies[0], taken: true },
      { blob: copies[1], taken: true },
      { blob: copies[2], taken: true },
    ]);
  });

  test("raise assistant_attachment_refused where the API refuses a file, whose refusal the page reads, and the next turn goes without it", async () => {
    const refused: Message = { id: "u1", role: "user", parts: [{ type: "text", text: "Read this." }, { type: "attachment", name: "refused.pdf", media_type: "application/pdf" }], created: CREATED };
    const { core, assistant } = await turnedWith(deployment, refused, [{ blob: copyOf(PDF) }]);

    const [why] = raised(core, "assistant_attachment_refused");
    expect(why).toMatch(/^The provider refused the file "refused\.pdf", so the conversation goes on without it: .*could not be processed/);
    expect(raised(core, "assistant_call_failed")).toEqual([]);
    expect(assistant.conversations.kept("c1", "u1")).toEqual({ files: [{ refused: true }], failure: why });

    await fetch(`${mock.origin}/__reset`, { method: "POST" });
    await assistant.conversations.addMessage("c1", { id: "u2", role: "user", parts: [{ type: "text", text: "Go on without it." }], created: CREATED });
    await assistant.turns.run("c1");

    expect(raised(core, "assistant_attachment_refused")).toEqual([]);
    const calls = await reached("POST");
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(JSON.stringify(call.body)).not.toContain(PDF);
      expect(JSON.stringify(call.body)).toContain("which the provider refused, so the conversation goes on without its content.");
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

describe("a turn on OpenAI's Chat Completions API", () => {
  test("gets a reply from gpt-5.4, which takes function tools there only with the reasoning effort none", async () => {
    const { core, conversation } = await turned({
      assistant_base_url: `${mock.origin}/openai/v1`,
      assistant_api: "openai-completions",
      assistant_api_key: mock.key,
      assistant_models: "gpt-5.4",
    });

    expect(raised(core, "assistant_call_failed")).toEqual([]);
    expect(conversation?.messages.map((message) => message.role)).toEqual(["user", "assistant", "tool", "assistant"]);
    expect(lastText(conversation)).toBe(mock.done);
    const calls = (await reached("POST")).map((call) => call.body);
    expect(calls.map((body) => [Array.isArray(body.tools), body.reasoning_effort])).toEqual([
      [true, "none"],
      [true, "none"],
    ]);
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

describe("the visitor's own key", () => {
  // The blockr options of a deployment that sets no key, at the base URL of
  // the mock given, which names its model, so that no key asks for a list.
  const at = (base: string, api = "openai-responses") => ({ assistant_base_url: `${mock.origin}${base}`, assistant_api: api, assistant_models: "mock-model" });
  const failed = "The assistant's call to the model failed: ";

  test("goes with each call, and reaches neither the board, R nor the browser's storage", async () => {
    const { core, sent, conversation } = await turned(at("/openai/v1"), mock.key);

    expect(raised(core, "assistant_call_failed")).toEqual([]);
    expect(lastText(conversation)).toBe(mock.done);
    expect((await reached("POST")).map((call) => call.headers.authorization)).toEqual([`Bearer ${mock.key}`, `Bearer ${mock.key}`]);
    const stored = [JSON.stringify([core.store.board(), sent]), storedIn(localStorage), storedIn(sessionStorage)];
    expect(stored.join("\n")).not.toContain(mock.key);
  });

  test("is dropped where the base URL refuses a call's key with an answer that the page reads, as Anthropic does", async () => {
    const { core, assistant } = await turned(at("/anthropic", "anthropic-messages"), "wrong-key");

    expect(assistant.key.current()).toEqual({ kind: "refused" });
    const [why] = raised(core, "assistant_call_failed");
    expect(why?.startsWith(failed)).toBe(true);
    expect(why).toContain("invalid x-api-key");
    expect(await reached("GET")).toEqual([]);
  });

  test.each(["openai-responses", "openai-completions"])(
    "is checked against the list of models where OpenAI refuses a call's key on %s with no CORS header, and dropped once the list refuses it",
    async (api) => {
      const { core, assistant } = await turned(at("/openai/v1", api), "wrong-key");

      expect(assistant.key.current()).toEqual({ kind: "refused" });
      const asked = await reached("GET");
      expect(asked.map((request) => [request.path, request.headers.authorization])).toEqual([["/openai/v1/models", "Bearer wrong-key"]]);
      const [why] = raised(core, "assistant_call_failed");
      expect(why?.startsWith(failed)).toBe(true);
      expect(why?.endsWith(` The base URL refused the assistant's key for its list of models at ${mock.origin}/openai/v1/models: it answered 401, "Incorrect API key provided.".`)).toBe(true);
    },
  );

  test("stays where a call gets no answer that the page reads and the list takes the key, and the call fails as any call does", async () => {
    const { core, assistant } = await turned(at("/drops/v1"), mock.key);

    expect(assistant.key.current()).toEqual({ kind: "given", key: mock.key });
    expect((await reached("GET")).map((request) => request.path)).toEqual(["/drops/v1/models"]);
    const [why] = raised(core, "assistant_call_failed");
    expect(why?.startsWith(failed)).toBe(true);
    expect(why).not.toContain("may be wrong");
  });

  test("stays in doubt where a call and the list both get no answer that the page reads, and the error says that the connection was lost and the key may be wrong", async () => {
    const { core, assistant } = await turned(at("/unreachable/v1"), mock.key);

    expect(assistant.key.current()).toEqual({ kind: "lost", key: mock.key });
    const [why] = raised(core, "assistant_call_failed");
    expect(why?.startsWith(failed)).toBe(true);
    expect(why?.endsWith(". The connection was lost, and the key may be wrong.")).toBe(true);
  });

  test("asks for the list of models once it comes, where the app names no models, and is dropped where the list refuses it", async () => {
    const { core, assistant } = await opened({ assistant_base_url: `${mock.origin}/openai/v1` });
    await expect(assistant.models.offered()).resolves.toEqual({ models: [], named: false });
    expect(await reached("GET")).toEqual([]);

    assistant.key.give("wrong-key");
    await vi.waitFor(() => {
      expect(assistant.key.current()).toEqual({ kind: "refused" });
    });
    expect(raised(core, "assistant_call_failed")).toEqual([
      `The base URL refused the assistant's key for its list of models at ${mock.origin}/openai/v1/models: it answered 401, "Incorrect API key provided.".`,
    ]);

    assistant.key.give(mock.key);
    await expect(assistant.models.offered()).resolves.toEqual({ models: ["gpt-5.4", "gpt-5.4-nano"], named: false });
    expect(assistant.key.current()).toEqual({ kind: "given", key: mock.key });
    expect((await reached("GET")).map((request) => request.headers.authorization)).toEqual(["Bearer wrong-key", `Bearer ${mock.key}`]);
  });
});

describe("the deployment's key", () => {
  test("is checked against the list of models where OpenAI refuses a call's key with no CORS header, and the error says that the base URL refused it", async () => {
    const { core } = await turned({ assistant_base_url: `${mock.origin}/openai/v1`, assistant_api_key: "wrong-key", assistant_models: "mock-model" });

    const asked = await reached("GET");
    expect(asked.map((request) => [request.path, request.headers.authorization])).toEqual([["/openai/v1/models", "Bearer wrong-key"]]);
    const [why] = raised(core, "assistant_call_failed");
    expect(why?.startsWith("The assistant's call to the model failed: ")).toBe(true);
    expect(why?.endsWith(` The base URL refused the assistant's key for its list of models at ${mock.origin}/openai/v1/models: it answered 401, "Incorrect API key provided.".`)).toBe(true);
  });
});
