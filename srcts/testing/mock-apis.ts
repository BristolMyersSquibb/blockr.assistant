// A mock of the three APIs that the assistant speaks and of the lists of
// models of OpenAI, Anthropic, OpenRouter and Vercel's AI Gateway, which
// Vitest's global setup serves for the browser tests (vitest.config.ts).
// It listens on a port that the system picks, on 127.0.0.1, while the tests'
// page comes from Vitest's own server at localhost, so that each request from
// the page meets CORS as a page's request to a provider does.
//
// The first segment of a request's path names the base URL that it goes to:
// - /openai/v1 speaks OpenAI's Responses and Chat Completions APIs and gives
//   OpenAI's list of models. It takes the key test-key in Authorization, and
//   answers another key with a 401. As OpenAI's do, the 401 of its list
//   carries a CORS header, while the 401 of a call carries none, so that the
//   page reads the call's refusal as a failed connection.
// - /anthropic speaks Anthropic's Messages API and gives Anthropic's list. It
//   takes the key test-key in x-api-key, and refuses a preflight that does
//   not ask for the header by which a page opts in, as Anthropic does.
// - /openrouter/api/v1 and /vercel/v1 give the lists of OpenRouter and of
//   Vercel's AI Gateway, which take any key or none.
// - /keyless/v1 and /keyless speak all three APIs and give OpenAI's list
//   without a key, as a company's own proxy may. They refuse a preflight that
//   asks for Authorization or x-api-key, so that a request that carries a key
//   fails as it would at such a proxy, which allows no header that it does
//   not need.
// - /drops/v1 gives OpenAI's list for any key, and answers each call with no
//   CORS header, so that the page reads each call as a failed connection.
// - /unreachable/v1 answers nothing with a CORS header, its preflights
//   included, so that the page reads every request as a failed connection.
//
// A call to a model streams a call of the tool list_blocks where the request
// holds no result of a tool, and the reply DONE once it holds one, each in
// the events of the call's API.
// The mock records each request, which the tests read at /__requests and
// clear with a POST to /__reset. The setup gives the tests the mock's origin,
// its key and the reply DONE through Vitest's inject(), since the tests run in
// the browser, which cannot import this file.

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  interface ProvidedContext {
    mockApis: MockApis;
  }
}

export interface MockApis {
  // The mock's origin, such as http://127.0.0.1:41235.
  readonly origin: string;
  // The key that the mock's keyed base URLs take.
  readonly key: string;
  // The reply of a call whose request holds the result of a tool.
  readonly done: string;
}

const MOCK_KEY = "test-key";
const DONE = "The board holds the blocks that list_blocks listed.";

// A request as the mock recorded it.
export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
}

type Body = Readonly<Record<string, unknown>>;

const LISTS: Readonly<Record<string, unknown>> = {
  openai: {
    object: "list",
    data: ["gpt-realtime-2.1-mini", "gpt-5.4", "text-embedding-3-small", "gpt-4o-mini-tts", "gpt-5.4-nano"].map((id) => ({
      id,
      object: "model",
      created: 1782254706,
      owned_by: "system",
    })),
  },
  anthropic: {
    data: ["claude-haiku-5-5", "claude-sonnet-5-5"].map((id) => ({
      type: "model",
      id,
      display_name: id,
      created_at: "2026-11-09T18:30:00Z",
      capabilities: { image_input: { supported: true } },
      max_input_tokens: 1000000,
      max_tokens: 128000,
    })),
    has_more: false,
    first_id: "claude-haiku-5-5",
    last_id: "claude-sonnet-5-5",
  },
  openrouter: {
    data: [
      { id: "google/gemini-4-hydrogen:batch", supported_parameters: ["tools"], endpoints: ["/api/v1/batches"] },
      {
        id: "openai/gpt-5.4",
        context_length: 1050000,
        architecture: { input_modalities: ["text", "image", "file"] },
        top_provider: { context_length: 1050000, max_completion_tokens: 128000 },
        supported_parameters: ["tools", "reasoning"],
        endpoints: ["/api/v1/chat/completions", "/api/v1/messages", "/api/v1/responses"],
      },
      {
        id: "deepseek/deepseek-v3.2",
        context_length: 163840,
        architecture: { input_modalities: ["text"] },
        top_provider: { context_length: 163840, max_completion_tokens: 147456 },
        supported_parameters: ["reasoning", "tools"],
        endpoints: ["/api/v1/chat/completions", "/api/v1/messages", "/api/v1/responses"],
      },
      { id: "some/model-without-tools", supported_parameters: ["max_tokens"], endpoints: ["/api/v1/chat/completions"] },
    ],
  },
  vercel: {
    object: "list",
    data: [
      { id: "openai/text-embedding-3-small", object: "model", type: "embedding", tags: [] },
      {
        id: "anthropic/claude-sonnet-5.5",
        object: "model",
        context_window: 1000000,
        max_tokens: 128000,
        type: "language",
        tags: ["tool-use", "vision"],
        modalities: { input: ["text", "image", "pdf"], output: ["text"] },
        supported_parameters: ["tools"],
      },
    ],
  },
};

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const recorded: RecordedRequest[] = [];
  const server = createServer((request, response) => {
    void serve(request, response, recorded).catch((error: unknown) => {
      response.writeHead(500, { "access-control-allow-origin": "*" });
      response.end(String(error));
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  project.provide("mockApis", { origin: `http://127.0.0.1:${String(port)}`, key: MOCK_KEY, done: DONE });
  return () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => {
        resolve();
      });
    });
}

async function serve(request: IncomingMessage, response: ServerResponse, recorded: RecordedRequest[]): Promise<void> {
  const url = new URL(request.url ?? "/", "http://mock.invalid");
  const origin = request.headers.origin ?? "*";
  const [, base = "", ...rest] = url.pathname.split("/");
  const path = `/${rest.join("/")}`;

  if (url.pathname === "/__requests") {
    respond(response, 200, "*", recorded);
    return;
  }
  if (url.pathname === "/__reset") {
    recorded.length = 0;
    respond(response, 200, "*", {});
    return;
  }

  recorded.push({ method: request.method ?? "GET", path: url.pathname, headers: headersOf(request) });
  if (base === "unreachable") {
    response.writeHead(502);
    response.end();
    return;
  }
  if (request.method === "OPTIONS") {
    preflight(request, response, base, origin);
    return;
  }

  const body = request.method === "POST" ? await bodyOf(request) : {};
  const refusal = refused(request, base);
  if (refusal !== undefined) {
    // OpenAI's 401 for a call carries no CORS header, while its list's does.
    const readable = !(base === "openai" && request.method === "POST");
    respond(response, 401, readable ? origin : undefined, { error: { message: refusal, type: "invalid_request_error" } });
    return;
  }
  if (base === "drops" && request.method === "POST") {
    response.writeHead(502);
    response.end();
    return;
  }

  if (request.method === "GET" && (path === "/v1/models" || path === "/api/v1/models")) {
    const list = LISTS[base === "keyless" || base === "drops" ? "openai" : base];
    if (list === undefined) respond(response, 404, origin, { error: { message: "No list here." } });
    else respond(response, 200, origin, list);
    return;
  }
  if (request.method === "POST" && path === "/v1/responses") {
    stream(response, origin, responsesEvents(body));
    return;
  }
  if (request.method === "POST" && path === "/v1/chat/completions") {
    stream(response, origin, completionsEvents(body));
    return;
  }
  if (request.method === "POST" && path === "/v1/messages") {
    stream(response, origin, messagesEvents(body));
    return;
  }
  respond(response, 404, origin, { error: { message: `No route ${request.method ?? ""} ${url.pathname}.` } });
}

// Answers a preflight: with every header that it asks for, but where the base
// URL refuses the request, with no CORS header at all.
function preflight(request: IncomingMessage, response: ServerResponse, base: string, origin: string): void {
  const asked = (request.headers["access-control-request-headers"] ?? "")
    .split(",")
    .map((header) => header.trim().toLowerCase())
    .filter((header) => header !== "");
  const keyed = asked.includes("authorization") || asked.includes("x-api-key");
  const optedIn = asked.includes("anthropic-dangerous-direct-browser-access");
  if ((base === "keyless" && keyed) || (base === "anthropic" && !optedIn)) {
    response.writeHead(403);
    response.end();
    return;
  }
  response.writeHead(204, {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST",
    "access-control-allow-headers": asked.join(", "),
  });
  response.end();
}

// Why the base URL refuses the request's key, or undefined where it takes it.
function refused(request: IncomingMessage, base: string): string | undefined {
  if (base === "openai" && request.headers.authorization !== `Bearer ${MOCK_KEY}`) return "Incorrect API key provided.";
  if (base === "anthropic" && request.headers["x-api-key"] !== MOCK_KEY) return "invalid x-api-key";
  return undefined;
}

// Answers with the status and the body given, with a CORS header that allows
// the origin given, or with none.
function respond(response: ServerResponse, status: number, origin: string | undefined, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json", ...(origin === undefined ? {} : { "access-control-allow-origin": origin }) });
  response.end(JSON.stringify(body));
}

// Streams the events given as server-sent events, each with its type as its
// event, but for Chat Completions, whose events name none.
function stream(response: ServerResponse, origin: string, events: readonly unknown[]): void {
  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", "access-control-allow-origin": origin });
  for (const event of events) {
    const type = typeof event === "object" && event !== null && "type" in event && typeof event.type === "string" ? `event: ${event.type}\n` : "";
    response.write(`${type}data: ${event === "[DONE]" ? event : JSON.stringify(event)}\n\n`);
  }
  response.end();
}

function headersOf(request: IncomingMessage): Record<string, string> {
  return Object.fromEntries(Object.entries(request.headers).flatMap(([name, value]) => (typeof value === "string" ? [[name, value]] : [])));
}

async function bodyOf(request: IncomingMessage): Promise<Body> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  return typeof parsed === "object" && parsed !== null ? (parsed as Body) : {};
}

// Whether the request holds the result of a tool, in whichever API's shape.
function answered(body: Body): boolean {
  const listed = (value: unknown): readonly unknown[] => (Array.isArray(value) ? (value as unknown[]) : []);
  const items = [...listed(body.input), ...listed(body.messages)];
  return items.some((item) => {
    if (typeof item !== "object" || item === null) return false;
    const { type, role, content } = item as Readonly<Record<string, unknown>>;
    if (type === "function_call_output" || role === "tool") return true;
    return Array.isArray(content) && content.some((part: unknown) => typeof part === "object" && part !== null && (part as { type?: unknown }).type === "tool_result");
  });
}

function modelOf(body: Body): string {
  return typeof body.model === "string" ? body.model : "mock-model";
}

function responsesEvents(body: Body): unknown[] {
  const model = modelOf(body);
  const created = { id: "resp_1", object: "response", created_at: 0, status: "in_progress", model, output: [] };
  const usage = { input_tokens: 20, output_tokens: 5, total_tokens: 25, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } };
  if (answered(body)) {
    const message = { type: "message", id: "msg_1", role: "assistant", status: "completed", content: [{ type: "output_text", text: DONE, annotations: [] }] };
    return [
      { type: "response.created", sequence_number: 0, response: created },
      { type: "response.output_item.added", sequence_number: 1, output_index: 0, item: { ...message, status: "in_progress", content: [] } },
      { type: "response.output_text.delta", sequence_number: 2, item_id: "msg_1", output_index: 0, content_index: 0, delta: DONE },
      { type: "response.output_item.done", sequence_number: 3, output_index: 0, item: message },
      { type: "response.completed", sequence_number: 4, response: { ...created, status: "completed", output: [message], usage } },
    ];
  }
  const call = { type: "function_call", id: "fc_1", call_id: "call_1", name: "list_blocks", arguments: "{}", status: "completed" };
  return [
    { type: "response.created", sequence_number: 0, response: created },
    { type: "response.output_item.added", sequence_number: 1, output_index: 0, item: { ...call, arguments: "", status: "in_progress" } },
    { type: "response.function_call_arguments.delta", sequence_number: 2, item_id: "fc_1", output_index: 0, delta: "{}" },
    { type: "response.function_call_arguments.done", sequence_number: 3, item_id: "fc_1", output_index: 0, arguments: "{}" },
    { type: "response.output_item.done", sequence_number: 4, output_index: 0, item: call },
    { type: "response.completed", sequence_number: 5, response: { ...created, status: "completed", output: [call], usage } },
  ];
}

function completionsEvents(body: Body): unknown[] {
  const chunk = (choice: unknown, usage?: unknown) => ({
    id: "chatcmpl-1",
    object: "chat.completion.chunk",
    created: 0,
    model: modelOf(body),
    choices: choice === undefined ? [] : [choice],
    ...(usage === undefined ? {} : { usage }),
  });
  const usage = { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 };
  if (answered(body)) {
    return [
      chunk({ index: 0, delta: { role: "assistant", content: DONE }, finish_reason: null }),
      chunk({ index: 0, delta: {}, finish_reason: "stop" }),
      chunk(undefined, usage),
      "[DONE]",
    ];
  }
  return [
    chunk({
      index: 0,
      delta: { role: "assistant", content: null, tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "list_blocks", arguments: "" } }] },
      finish_reason: null,
    }),
    chunk({ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: "{}" } }] }, finish_reason: null }),
    chunk({ index: 0, delta: {}, finish_reason: "tool_calls" }),
    chunk(undefined, usage),
    "[DONE]",
  ];
}

function messagesEvents(body: Body): unknown[] {
  const start = {
    type: "message_start",
    message: { id: "msg_1", type: "message", role: "assistant", model: modelOf(body), content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 20, output_tokens: 1 } },
  };
  const end = (reason: string) => [
    { type: "message_delta", delta: { stop_reason: reason, stop_sequence: null }, usage: { output_tokens: 5 } },
    { type: "message_stop" },
  ];
  if (answered(body)) {
    return [
      start,
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: DONE } },
      { type: "content_block_stop", index: 0 },
      ...end("end_turn"),
    ];
  }
  return [
    start,
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "list_blocks", input: {} } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{}" } },
    { type: "content_block_stop", index: 0 },
    ...end("tool_use"),
  ];
}
