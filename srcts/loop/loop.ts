// The loop, which runs a turn of a conversation on pi's agent loop
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4#proposal).
// This directory is the only code that imports pi, and imports it at a pinned
// version, so that a move to the AI SDK rewrites this module alone.
//
// - The calls go through a provider that pi's createProvider() makes for a
//   base URL and the API that it speaks, by pi's name for the API
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.1#where-the-calls-go).
//   The provider holds pi's code for that API alone, which loads in a file
//   of its own (./apis.ts).
// - The loop takes the credential through getApiKey, which pi calls for each
//   request, so that the loop knows no way to authenticate
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.1#how-a-call-is-authenticated).
//   Where the connection gives no key, no call carries one, neither in
//   Authorization nor in Anthropic's x-api-key, so that a base URL that
//   needs no key, such as a company's own proxy, need not allow either header
//   in its answer to a page's preflight. Each of pi's APIs refuses to call
//   without a key, so the loop gives pi a placeholder, which its fetch takes
//   off the request before the request leaves.
// - Where the base URL is that of Vercel's AI Gateway, the loop's fetch also
//   removes from each request the headers that the gateway's answer to a
//   page's preflight does not allow, since the browser sends no call that
//   carries one (blockr.assistant#299). These are the headers by which the
//   SDKs that pi calls describe themselves, whose names start with
//   x-stainless-, and Anthropic's opt-in header,
//   anthropic-dangerous-direct-browser-access. Anthropic's own API needs that
//   header from a page, so the calls to any other base URL keep it.
// - The loop's fetch also notes what each call's request got back, where that
//   says something of the key: a 401 or a 403, by which the base URL refused
//   the key, or no answer that the page could read. OpenAI's 401 for a call
//   reaches a page in the second way, since it carries no CORS header
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.1#how-a-call-is-authenticated).
//   A failed call reports what its request got back, so that its caller can
//   tell a refused key from a lost connection. Pi sends one request for each
//   call, since it retries none.
// - It gives pi an identity without attribution, so that pi names no app to
//   OpenRouter.
// - It builds the model of each call from pi's catalogs, and gives pi the
//   thinking level that they give the call: the conversation's pick of the
//   level, where it applies to the model, or else the level that the
//   deployment's model settings give the model, where the model takes it, or
//   else the loop's default (./catalogs.ts).
// - It hands pi the tools as they are, with each tool's executionMode, and
//   takes from its caller the system prompt, a transformContext, the message
//   of the app's and an onPayload.
//   The transformContext takes the conversation in the state's shape, and the
//   onPayload the request as the provider takes it.
// - Before each call, it builds pi's messages from the conversation as the
//   plugin holds it then (./messages.ts), with the files that the user
//   attached, which the memory keeps as binary. It encodes each file once for
//   the turn, as base64 or as text, and drops what it encoded as the turn
//   ends. Where the caller gives a message of
//   the app's, the loop adds it after the conversation's last message, for the
//   call alone, as a message of the role user, so that no call goes out for it
//   alone (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.5#what-a-call-sends-and-in-which-order).
//   It adds it as a message of the role app, which it declares among the
//   messages of pi's agent, so that pi's messages tell it from the user's,
//   and pi's convertToLlm turns it into a message of the role user for the
//   call (./messages.ts). The message's text opens with the preamble that says
//   that the app writes it.
// - The message of the app's changes from call to call.
//   So where pi marks it for Anthropic's cache, the loop moves the mark to the
//   end of the conversation before it, on Anthropic's Messages API and on
//   Chat Completions (./cache.ts).
//   It does so through pi's onPayload, before the caller's onPayload sees the
//   request.
// - It hands pi each PDF as an image, and turns it into the block of the
//   call's API for a file in the request that pi writes (./files.ts). It does
//   so through pi's onPayload as well, before it moves the cache mark, which
//   then marks the end of the conversation in the blocks that it holds.
//
// A provider may refuse a file that a call carries, as an image that it
// cannot read, a PDF on an API that takes none, or a file larger than it
// takes. It then answers the call with 400, 413, 415 or 422, as Anthropic's
// and OpenAI's APIs answer a request that they refuse for what it holds. Both
// put a CORS header on such an answer, so that the page reads its status
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#what-fails).
// Pi writes the status into the text of its error alone, so the loop's fetch
// keeps the status of each call's answer. A call that fails with one of those
// statuses reports that the provider refused the request, with the files
// that it carried and no call carried with success before.
//
// Before each call, the loop awaits what the caller does then, as compaction
// puts a summary in place where the conversation nears the model's context
// window (../compaction), and as the turn adds the note of what others
// changed in the board (../notes). It reads the conversation only after that.
//
// It reports to its caller as the turn runs, and pi waits for each report
// before it goes on, so that a reply is in the conversation before the next
// call goes out:
// - The reply as it streams.
// - Each call to the model once it ended, with its reply, its tokens, and why
//   it failed, where it failed. A call that failed since the conversation
//   outgrew the model's context window says so, as pi tells from the
//   provider's error.
// - Each tool call once it returned, before the reply's other calls return.
// - The results of a reply's tool calls, as one message of the role tool.
//
// Where the turn's signal aborts, pi stops the model's stream, and each tool
// call left without a result gets one that says the user stopped the turn.
// The tools stop waiting themselves, since each takes the signal.
//
// The loop records the turn's spans, under the names that ellmer gives the
// spans of today's turns (./telemetry.ts):
// 1. As a turn starts, the loop starts its span, invoke_agent, under the
//    context that is active as run() is called. The span carries the
//    provider and the model, as ellmer's does.
// 2. It gives pi the turn's span through streamFn, as
//    { ...options, telemetry: turn }. So pi records the span of each call to
//    the model under the turn's span.
// 3. It runs each tool call in a span execute_tool <tool> under the turn's
//    span, with gen_ai.tool.name, gen_ai.tool.description and
//    gen_ai.tool.call.id. The tool's span is active as the tool is called.
// 4. A tool runs its commands and sends its requests before its first await,
//    or else inside context.with() of the context that it kept from before
//    that await. So core puts its spans of them under the tool's span.
// 5. The turn's span is active again as the loop calls what the caller does
//    before a call. Compaction makes the calls that write a summary before
//    its first await, so the spans of a summary that the call waits for go
//    under the turn's span.
// 6. The turn's span ends once the turn ends.
//
// The loop also makes the model calls of the plugin's own, which run on pi's
// models alone, not on its agent loop: the call that writes a summary for
// compaction (../compaction), and the call that titles a conversation
// (../titles). Such a call goes to the model through the same provider, with
// the same credential, identity and thinking level as a turn's calls, but
// with the caller's system prompt and one message of the role user. It
// declares no tools and holds no message of the app's
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.5#what-a-call-sends-and-in-which-order).
// Such a call runs in a span invoke_agent of its own, under the context that
// is active as callModel() is called, and the loop gives pi that span, so
// that pi records the span of the call under it, as ellmer records today's
// title calls. A title, which the plugin asks for once a turn ended, starts a
// trace of its own.
// The loop also gives the context window of a model as pi takes it, by which
// compaction judges when a conversation needs a summary.

import { context } from "@opentelemetry/api";
import type { Json } from "@blockr/core";
import type { AgentEvent, AgentLoopConfig, AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Api, AssistantMessage, ImageContent, Model, ProviderStreams, TextContent, ThinkingLevel as PiThinkingLevel } from "@earendil-works/pi-ai";
import type { TelemetrySpan } from "@earendil-works/pi-telemetry";
import type { Encoded } from "../attachments/index.ts";
import type { Kept, KeptImage } from "../conversations/index.ts";
import type { Message, MessageId, Part, ThinkingLevel, ToolCallPart } from "../state/index.ts";
import type { Tool } from "../tools/index.ts";
import { loadApi } from "./apis.ts";
import { markBeforeAppMessage } from "./cache.ts";
import { buildModel, levelOf, loadCatalogParts, PROVIDER } from "./catalogs.ts";
import type { CallModel, CatalogParts } from "./catalogs.ts";
import { withFiles } from "./files.ts";
import { appMessage, callMessages, convertReply, encodeFiles, image, isToolCall, llmMessages, partsOf, reasoningOf, resultsOf, STOPPED } from "./messages.ts";
import type { Answered, Carried, CarriedFile } from "./messages.ts";
import { providerName, telemetryUnder } from "./telemetry.ts";
import type * as vendor from "./vendor.ts";

// The parts of pi that the loop uses, as ./vendor.ts names them.
export type Pi = typeof vendor;

// Where a turn's calls go: a base URL, and the API that it speaks, by pi's
// name for it, such as "openai-responses".
export interface Connection {
  readonly baseUrl: string;
  readonly api: string;
  // The credential for a call, which the loop asks for again for each call, or
  // undefined for none.
  apiKey(): Promise<string | undefined>;
}

// The key that the loop gives pi for a call that carries none, which the
// loop's fetch takes off the request.
const NO_KEY = "blockr-assistant-no-key";

export interface Turn extends CallModel {
  readonly tools: readonly Tool[];
  // The conversation as the plugin holds it, as a call goes out: the messages
  // that the memory holds, then those of the state.
  messages(): readonly Message[];
  // What the memory keeps of a message of the conversation.
  kept(message: MessageId): Kept | undefined;
  // What the caller adds to each call: the system prompt, a transform of the
  // conversation for the call alone, the text of the message of the app's
  // that follows the conversation's last message, and a transform of the
  // request that goes to the provider, whose undefined keeps the request as it
  // is. The loop asks for the message of the app's as each call goes out.
  // Where that rejects, the turn rejects before the call goes out.
  readonly systemPrompt?: string;
  readonly transformContext?: (messages: readonly Message[], signal: AbortSignal) => Promise<readonly Message[]>;
  readonly appMessage?: () => Promise<string>;
  readonly onPayload?: (payload: unknown) => unknown;
  // What the caller does before each call goes out, which the call waits for,
  // as compaction does. Where it rejects, the turn rejects before the call
  // goes out.
  readonly beforeCall?: (signal: AbortSignal) => Promise<void>;
  readonly signal: AbortSignal;
  readonly on: Handlers;
}

// What the loop reports as a turn runs. The loop waits for each that returns a
// promise.
export interface Handlers {
  // The reply as it streams, after each change.
  streaming(reply: Streamed): void;
  // A call to the model that ended, however it ended.
  called(call: Call): Promise<void>;
  // A tool call that returned, with its result.
  returned(id: string, result: Answered): void;
  // The results of a reply's tool calls, as one message of the role tool, with
  // what the memory keeps of it.
  results(message: Message, kept: Kept): Promise<void>;
}

// A reply as it streams: its text and its tool calls so far, in the state's
// shape, and its reasoning, as text.
export interface Streamed {
  readonly parts: readonly Part[];
  readonly reasoning: readonly string[];
}

export interface Call {
  // The reply, where it holds text or a tool call, with what the memory keeps
  // of it.
  readonly reply?: { readonly message: Message; readonly kept: Kept };
  // The input tokens of the call, without the cached input, its output
  // tokens, and every token of the call, the cached input included.
  readonly usage: { readonly input: number; readonly output: number; readonly total: number };
  // Why the call failed, where it failed. A call that the turn's signal
  // stopped did not fail.
  readonly failure?: string;
  // The files that the user attached which the call carried, and no call
  // carried with success before.
  readonly files: readonly CarriedFile[];
  // Whether the provider refused the request for what it held, as a failed
  // call that the provider answered with 400, 413, 415 or 422.
  readonly refused: boolean;
  // What the failed call's request got back, where that says something of
  // the key: a 401 or a 403, by which the base URL refused the key, or no
  // answer that the page could read, as where the answer carries no CORS
  // header or the connection failed.
  readonly answer?: CallAnswer;
  // Whether the call failed since the conversation outgrew the model's
  // context window, as pi's isContextOverflow() tells from the provider's
  // error.
  readonly overflow?: boolean;
}

// A model call of the plugin's own, as for a summary or a title: one message
// of the role user, under a system prompt of its own, with no tools
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.3#compaction).
export interface ModelCall extends CallModel {
  readonly systemPrompt: string;
  // The text of the message of the role user.
  readonly prompt: string;
  readonly signal: AbortSignal;
}

// What a model call of the plugin's own gave: the text that the model wrote,
// or why it wrote none.
export interface ModelReply {
  // The text, where the model wrote one.
  readonly text?: string;
  // The tokens of the call, as a turn's call gives them.
  readonly usage: Call["usage"];
  // Why the model wrote no text, where it wrote none.
  readonly failure?: string;
}

export type CallAnswer = "refused" | "unread";

export interface Loop {
  // Runs the turn, and resolves once the turn ends, however it ends. It
  // rejects where the turn cannot go on, as where the credential cannot be
  // read.
  run(turn: Turn): Promise<void>;
  // Makes a model call of the plugin's own, and resolves once the call ends,
  // however it ends. It rejects where the call cannot go out, as where the
  // credential cannot be read.
  callModel(call: ModelCall): Promise<ModelReply>;
}

// The loop on the parts of pi given, on its catalogs, and on pi's code for
// the APIs given, by pi's name for each: that of the connection's API, or
// pi's fake API, which a test gives.
export function createLoop(pi: Pi, catalogs: CatalogParts, apis: Readonly<Record<string, ProviderStreams>>): Loop {
  return {
    run: (turn) => runTurn(pi, catalogs, apis, turn),
    callModel: (call) => callModel(pi, catalogs, apis, call),
  };
}

// The loop for the calls to the base URL, in the API given, once the page has
// imported pi's bundle, the catalogs for the base URL (./catalogs.ts) and pi's
// code for the API (./apis.ts).
// The browser imports the bundle once, as the chat first mounts (./vendor.ts),
// and the code of the API once the chat has read the deployment.
export async function loadLoop(connection: Pick<Connection, "baseUrl" | "api">): Promise<Loop> {
  const [pi, catalogs, streams] = await Promise.all([import("./vendor.ts"), loadCatalogParts(connection.baseUrl), loadApi(connection.api)]);
  return createLoop(pi, catalogs, { [connection.api]: streams });
}

// Runs the turn in its span, invoke_agent.
function runTurn(pi: Pi, catalogs: CatalogParts, streams: Readonly<Record<string, ProviderStreams>>, turn: Turn): Promise<void> {
  return startAgentSpan(turn, (span) => runAgent(pi, catalogs, streams, turn, span));
}

// Runs the callback in a span invoke_agent under the context that is active
// as it is called, with the provider and the model that the call talks to, as
// ellmer's span of a turn has them.
function startAgentSpan<T>(call: CallModel, callback: (span: TelemetrySpan) => Promise<T>): Promise<T> {
  const attributes = {
    "gen_ai.operation.name": "invoke_agent",
    "gen_ai.provider.name": providerName(call.connection.api),
    "gen_ai.request.model": call.model,
  };
  return telemetryUnder(context.active()).startSpan({ name: "invoke_agent", attributes }, callback);
}

// Runs the turn on pi's agent loop, under the turn's span.
async function runAgent(pi: Pi, catalogs: CatalogParts, streams: Readonly<Record<string, ProviderStreams>>, turn: Turn, span: TelemetrySpan): Promise<void> {
  // The context in which the turn's span is active, which the loop can read
  // only before its first await.
  const turnContext = context.active();
  const model = buildModel(catalogs, turn);
  const models = modelsAt(pi, streams, turn.connection, model);

  // The results that the tools gave, and those that pi gave in place of a
  // tool before the signal aborted, as for args that the tool's schema
  // refuses, by call.
  const given = new Map<string, Answered>();
  const answered = new Map<string, Answered>();
  const answer = (id: string): Answered => given.get(id) ?? answered.get(id) ?? { text: STOPPED, isError: true, images: [] };
  const tools = turn.tools.map((tool) => agentTool(tool, given, span));
  const prompt = turn.systemPrompt ?? "";
  const kept = (message: MessageId): Kept | undefined => turn.kept(message);
  const level = piLevel(levelOf(catalogs, turn, model));
  // The content of each file that the user attached, as the turn's calls send
  // it, which the loop encodes once for the turn and drops as the turn ends.
  const encodings = new Map<Blob, Encoded>();
  // What the call that goes out carries of the files that the user attached,
  // and the status of the provider's answer to it, once it answered, or
  // whether the page could read no answer to it.
  let carried: Carried = { files: [], pdfs: [] };
  let status: number | undefined;
  let unread = false;
  // The text of the message of the app's that the call going out holds, if
  // any.
  let added: string | undefined;

  const send = fetchAt(turn.connection.baseUrl);
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const response = await send(input, init);
      status = response.status;
      return response;
    } catch (error) {
      // The page's fetch fails with a TypeError where it reads no answer, and
      // with an AbortError where the request's signal aborts.
      if (error instanceof TypeError) unread = true;
      throw error;
    }
  };

  const config: AgentLoopConfig = {
    model,
    ...(level === undefined ? {} : { reasoning: level }),
    identity: { attribution: null },
    // Every message goes to the model as it is, but the message of the app's,
    // which goes as a message of the role user.
    convertToLlm: (messages) => llmMessages(messages),
    transformContext: async (_messages, signal) => {
      await context.with(turnContext, () => turn.beforeCall?.(signal ?? turn.signal));
      const conversation = turn.messages();
      const transformed = turn.transformContext === undefined ? conversation : await turn.transformContext(conversation, signal ?? turn.signal);
      carried = { files: [], pdfs: [] };
      status = undefined;
      unread = false;
      await encodeFiles(transformed, kept, encodings);
      added = turn.appMessage === undefined ? undefined : await turn.appMessage();
      const messages = callMessages(transformed, kept, model, turn.tools, prompt, { encoded: (file) => encodings.get(file), carried });
      return added === undefined ? messages : [...messages, appMessage(added)];
    },
    getApiKey: async () => (await turn.connection.apiKey()) ?? NO_KEY,
    fetch,
    // The loop turns the PDFs into the API's blocks for a file, then moves
    // the cache mark, and then hands the request to the caller's onPayload.
    onPayload: (payload) => {
      const filed = carried.pdfs.length === 0 ? undefined : withFiles(model.api, payload, carried.pdfs);
      const moved = added === undefined ? undefined : markBeforeAppMessage(filed ?? payload, added, model.api);
      const changed = moved ?? filed;
      if (turn.onPayload === undefined) return changed;
      return turn.onPayload(changed ?? payload) ?? changed;
    },
  };

  const emit = async (event: AgentEvent): Promise<void> => {
    switch (event.type) {
      case "message_start":
      case "message_update":
        if (event.message.role === "assistant") turn.on.streaming({ parts: partsOf(event.message), reasoning: reasoningOf(event.message) });
        return;
      case "message_end":
        if (event.message.role === "assistant") await turn.on.called(callOf(pi, event.message, model, carried, status, unread));
        return;
      case "tool_execution_end":
        if (!given.has(event.toolCallId) && !turn.signal.aborted) {
          answered.set(event.toolCallId, convertToolResult(event.result as AgentToolResult<unknown>, event.isError));
        }
        turn.on.returned(event.toolCallId, answer(event.toolCallId));
        return;
      case "turn_end": {
        // A reply whose call failed ran none of its tool calls, which then read
        // to the model as calls that the turn ended before they returned.
        if (event.message.role !== "assistant" || event.message.stopReason === "error") return;
        const calls: ToolCallPart[] = partsOf(event.message).filter(isToolCall);
        if (calls.length === 0) return;
        const results = resultsOf(calls, (call) => answer(call.id));
        await turn.on.results(results.message, results.kept);
        return;
      }
      default:
        return;
    }
  };

  const begun = { messages: callMessages(turn.messages(), kept, model, turn.tools, prompt), tools };
  await pi.runAgentLoopContinue(begun, config, emit, turn.signal, (called, messages, options) =>
    models.streamSimple(called, messages, { ...options, telemetry: span }),
  );
}

// The models of pi, with the plugin's provider at the connection's base URL,
// which serves the model given. The credential comes with each call, so the provider
// takes none.
function modelsAt(pi: Pi, streams: Readonly<Record<string, ProviderStreams>>, connection: Connection, model: Model<Api>): ReturnType<Pi["createModels"]> {
  const models = pi.createModels();
  models.setProvider(
    pi.createProvider({
      id: PROVIDER,
      baseUrl: connection.baseUrl,
      auth: { apiKey: { name: "The assistant's credential", resolve: () => Promise.resolve({ auth: {} }) } },
      models: [model],
      api: streams,
    }),
  );
  return models;
}

// Makes a model call of the plugin's own in its span, invoke_agent, with the
// settings of a turn's calls: the same model, credential, identity and
// thinking level. It asks the provider to cache nothing, since no later call
// starts as this one does, as pi's own CLI asks for its summaries.
function callModel(pi: Pi, catalogs: CatalogParts, streams: Readonly<Record<string, ProviderStreams>>, call: ModelCall): Promise<ModelReply> {
  return startAgentSpan(call, async (span) => {
    const model = buildModel(catalogs, call);
    const models = modelsAt(pi, streams, call.connection, model);
    const apiKey = (await call.connection.apiKey()) ?? NO_KEY;
    const level = piLevel(levelOf(catalogs, call, model));
    const reply = await models.completeSimple(
      model,
      { systemPrompt: call.systemPrompt, messages: [{ role: "user", content: [{ type: "text", text: call.prompt }], timestamp: Date.now() }] },
      { ...(level === undefined ? {} : { reasoning: level }), identity: { attribution: null }, apiKey, fetch: fetchAt(call.connection.baseUrl), signal: call.signal, cacheRetention: "none", telemetry: span },
    );
    const usage = { input: reply.usage.input, output: reply.usage.output, total: reply.usage.totalTokens };
    const text = reply.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("").trim();
    const failure = findFailure(reply, text);
    return failure === undefined ? { text, usage } : { usage, failure };
  });
}

// Why the model wrote no text, or undefined where it wrote one. A reply that
// the model's cap for a reply cut off counts as none, since it may end
// mid-sentence, as pi's CLI has it for a summary.
function findFailure(reply: AssistantMessage, text: string): string | undefined {
  switch (reply.stopReason) {
    case "error":
      return reply.errorMessage ?? "The provider gave no reason.";
    case "aborted":
      return "The call was stopped before the model wrote its reply.";
    case "length":
      return "The reply reached the model's cap for a reply, so it was cut off.";
    default:
      return text === "" ? "The model wrote no text." : undefined;
  }
}

// The level that the loop gives pi for the level given: none for the level
// off, which pi takes as no level, and the level itself otherwise.
function piLevel(level: ThinkingLevel): PiThinkingLevel | undefined {
  return level === "off" ? undefined : level;
}

// The host of Vercel's AI Gateway, whose base URL for OpenAI's APIs is
// https://ai-gateway.vercel.sh/v1, and for Anthropic's
// https://ai-gateway.vercel.sh.
const VERCEL_AI_GATEWAY = "ai-gateway.vercel.sh";

// The page's fetch for the calls to the base URL, which edits the headers of
// each request before the request leaves. The SDKs that pi calls give their
// headers with the request's init.
// - It takes off the placeholder of a call that carries no key.
// - Where the base URL is that of Vercel's AI Gateway, it removes the
//   headers that the gateway's answer to a page's preflight does not allow:
//   each header whose name starts with x-stainless-, and Anthropic's opt-in
//   header. It compares names in lower case, as HTTP does, since Anthropic's
//   SDK writes X-Stainless-OS where OpenAI's writes x-stainless-os.
function fetchAt(baseUrl: string): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  const gateway = hostOf(baseUrl) === VERCEL_AI_GATEWAY;
  return (input, init) => {
    const headers = new Headers(init?.headers);
    if (headers.get("authorization") === `Bearer ${NO_KEY}`) headers.delete("authorization");
    if (headers.get("x-api-key") === NO_KEY) headers.delete("x-api-key");
    if (gateway) {
      for (const name of [...headers.keys()]) {
        const lower = name.toLowerCase();
        if (lower.startsWith("x-stainless-") || lower === "anthropic-dangerous-direct-browser-access") headers.delete(name);
      }
    }
    return globalThis.fetch(input, { ...init, headers });
  };
}

// The host of the base URL, or undefined where it is no URL.
function hostOf(baseUrl: string): string | undefined {
  try {
    return new URL(baseUrl).host;
  } catch {
    return undefined;
  }
}

// The statuses with which a provider refuses a request for what it holds.
const REFUSED: ReadonlySet<number> = new Set([400, 413, 415, 422]);

// A call that ended, with the reply that pi wrote, to the model given, what
// the call carried of the files that the user attached, and what its request
// got back: the status of the provider's answer, where it answered, or that
// the page could read no answer.
function callOf(pi: Pi, reply: AssistantMessage, model: Model<Api>, carried: Carried, status: number | undefined, unread: boolean): Call {
  const written = convertReply(reply);
  const answer: CallAnswer | undefined = unread ? "unread" : status === 401 || status === 403 ? "refused" : undefined;
  const failed = reply.stopReason === "error";
  return {
    ...(written === undefined ? {} : { reply: written }),
    usage: { input: reply.usage.input, output: reply.usage.output, total: reply.usage.totalTokens },
    ...(failed ? { failure: reply.errorMessage ?? "The provider gave no reason." } : {}),
    files: carried.files,
    refused: failed && status !== undefined && REFUSED.has(status),
    ...(failed && pi.isContextOverflow(reply, model.contextWindow) ? { overflow: true } : {}),
    ...(failed && answer !== undefined ? { answer } : {}),
  };
}

// A tool as pi runs it, which keeps the result that the tool gave by call.
// The tool rejects only where the turn's signal aborts, and pi then writes an
// error of its own as the result, which the loop replaces.
// Each call runs in its span, under the turn's span.
function agentTool(tool: Tool, given: Map<string, Answered>, turn: TelemetrySpan): AgentTool {
  return {
    name: tool.name,
    label: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    executionMode: tool.executionMode,
    async execute(id, args, signal) {
      const attributes = {
        "gen_ai.operation.name": "execute_tool",
        "gen_ai.tool.name": tool.name,
        "gen_ai.tool.description": tool.description,
        "gen_ai.tool.call.id": id,
      };
      const result = await turn.startSpan({ name: `execute_tool ${tool.name}`, attributes }, () =>
        tool.execute(args as Readonly<Record<string, Json>>, signal ?? new AbortController().signal),
      );
      given.set(id, { text: result.text, isError: result.isError, images: result.images });
      const content: (TextContent | ImageContent)[] = [{ type: "text", text: result.text }, ...result.images.map(image)];
      return { content, details: undefined, isError: result.isError };
    },
  };
}

// The result that pi gave in place of a tool, as for args that the tool's
// schema refuses.
function convertToolResult(result: AgentToolResult<unknown>, isError: boolean): Answered {
  const text = result.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n");
  const images = result.content.flatMap((block): KeptImage[] => (block.type === "image" ? [{ data: block.data, mimeType: block.mimeType }] : []));
  return { text, isError, images };
}

