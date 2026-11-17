// The loop, which runs a turn of a conversation on pi's agent loop
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4#proposal).
// This directory is the only code that imports pi, and imports it at a pinned
// version, so that a move to the AI SDK rewrites this module alone.
//
// - The calls go through a provider that pi's createProvider() makes for a
//   base URL and the API that it speaks, by pi's name for the API
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.1#where-the-calls-go).
// - The loop takes the credential through getApiKey, which pi calls for each
//   request, so that the loop knows no way to authenticate
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.1#how-a-call-is-authenticated).
//   Where the connection gives no key, no call carries one, neither in
//   Authorization nor in Anthropic's x-api-key, so that a base URL that
//   needs no key, such as a company's own proxy, need not allow either header
//   in its answer to a page's preflight. Each of pi's APIs refuses to call
//   without a key, so the loop gives pi a placeholder, which its fetch takes
//   off the request before the request leaves.
// - The loop's fetch also notes what each call's request got back, where that
//   says something of the key: a 401 or a 403, by which the base URL refused
//   the key, or no answer that the page could read. OpenAI's 401 for a call
//   reaches a page in the second way, since it carries no CORS header
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.1#how-a-call-is-authenticated).
//   A failed call reports what its request got back, so that its caller can
//   tell a refused key from a lost connection. Pi sends one request for each
//   call, since it retries none.
// - It gives pi an identity without attribution, so that pi names no app to
//   OpenRouter, and the thinking level medium
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.1#the-models-settings).
// - It hands pi the tools as they are, with each tool's executionMode, and
//   takes from its caller the system prompt, a transformContext, the message
//   of the app's and an onPayload.
//   The transformContext takes the conversation in the state's shape, and the
//   onPayload the request as the provider takes it.
// - Before each call, it builds pi's messages from the conversation as the
//   plugin holds it then (./messages.ts). Where the caller gives a message of
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
//
// Before each call, the loop awaits what the caller does then, as compaction
// puts a summary in place where the conversation nears the model's context
// window (../compaction). It reads the conversation only after that.
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
// 5. The turn's span ends once the turn ends.
//
// The loop also makes each call that writes a summary for compaction
// (../compaction), which runs on pi's models alone, not on its agent loop.
// That call goes to the model through the same provider, with the same
// credential, identity and thinking level, but with the caller's system
// prompt and one message of the role user. It declares no tools and holds no
// message of the app's
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.5#what-a-call-sends-and-in-which-order).
// The loop also gives the context window of a model as pi takes it, by which
// compaction judges when a conversation needs a summary.

import { context } from "@opentelemetry/api";
import type { Json } from "@blockr/core";
import type { AgentEvent, AgentLoopConfig, AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Api, AssistantMessage, ImageContent, Model, ProviderStreams, TextContent } from "@earendil-works/pi-ai";
import type { TelemetrySpan } from "@earendil-works/pi-telemetry";
import type { Kept, KeptImage } from "../conversations/index.ts";
import type { ListedSettings, ModelSettings } from "../model-settings/index.ts";
import type { Message, MessageId, Part, ToolCallPart } from "../state/index.ts";
import type { Tool } from "../tools/index.ts";
import { markBeforeAppMessage } from "./cache.ts";
import { appMessage, callMessages, image, isToolCall, llmMessages, partsOf, reasoningOf, replyOf, resultsOf, STOPPED } from "./messages.ts";
import type { Answered } from "./messages.ts";
import { providerName, telemetryUnder } from "./telemetry.ts";
import type * as vendor from "./vendor.ts";

// The parts of pi that the loop uses, as ./vendor.ts names them.
export type Pi = typeof vendor;

// The id of the provider through which every call goes. It names no service,
// since the base URL of a deployment may belong to any.
export const PROVIDER = "blockr.assistant";

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

// OpenRouter's base URL, as a deployment gives it.
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// The model that a call talks to, which a turn and a summary both name: where
// the call goes, the model's id, and its settings.
export interface CallModel {
  readonly connection: Connection;
  // The id of the model, such as "gpt-5.4".
  readonly model: string;
  // The settings that the deployment's model settings give the model, and
  // those that the base URL's list gives it, where either gives any.
  readonly settings?: ModelSettings | undefined;
  readonly listed?: ListedSettings | undefined;
}

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

// The call that writes a summary for compaction: one message of the role
// user, under a system prompt of its own, with no tools
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.3#compaction).
export interface SummaryCall extends CallModel {
  readonly systemPrompt: string;
  // The text of the message of the role user.
  readonly prompt: string;
  readonly signal: AbortSignal;
}

// A call that wrote a summary, or that ended without one.
export interface Summarized {
  // The summary, where the call wrote one.
  readonly text?: string;
  // The tokens of the call, as a turn's call gives them.
  readonly usage: Call["usage"];
  // Why the call wrote no summary, where it wrote none.
  readonly failure?: string;
}

export type CallAnswer = "refused" | "unread";

export interface Loop {
  // Runs the turn, and resolves once the turn ends, however it ends. It
  // rejects where the turn cannot go on, as where the credential cannot be
  // read.
  run(turn: Turn): Promise<void>;
  // Makes the call that writes a summary, and resolves once the call ends,
  // however it ends. It rejects where the call cannot go out, as where the
  // credential cannot be read.
  summarize(call: SummaryCall): Promise<Summarized>;
  // The context window of the model, in tokens, as the loop gives it to pi.
  contextWindow(model: CallModel): number;
  // Whether pi's catalog of OpenAI's or of Anthropic's models holds a model
  // of the id given, whose settings a model of the deployment's model
  // settings may take through its like.
  inCatalog(id: string): boolean;
}

// The loop on the parts of pi given, with the three APIs that the assistant
// speaks, and the APIs given beside them, by pi's name for each, as a test
// gives pi's fake API.
export function createLoop(pi: Pi, apis: Readonly<Record<string, ProviderStreams>> = {}): Loop {
  const streams: Readonly<Record<string, ProviderStreams>> = {
    "anthropic-messages": pi.anthropicMessages,
    "openai-completions": pi.openaiCompletions,
    "openai-responses": pi.openaiResponses,
    ...apis,
  };
  return {
    run: (turn) => runTurn(pi, streams, turn),
    summarize: (call) => summarize(pi, streams, call),
    contextWindow: (called) => buildModel(pi, called.model, called.connection, called.settings, called.listed).contextWindow,
    inCatalog: (id) => catalogModel(pi, id) !== undefined,
  };
}

// The loop, once the page has imported pi's bundle.
// The browser imports the bundle once, as the page prepares its first call
// (../turns/prepare.ts).
export async function loadLoop(): Promise<Loop> {
  return createLoop(await import("./vendor.ts"));
}

// Runs the turn in its span, invoke_agent.
function runTurn(pi: Pi, streams: Readonly<Record<string, ProviderStreams>>, turn: Turn): Promise<void> {
  const attributes = {
    "gen_ai.operation.name": "invoke_agent",
    "gen_ai.provider.name": providerName(turn.connection.api),
    "gen_ai.request.model": turn.model,
  };
  return telemetryUnder(context.active()).startSpan({ name: "invoke_agent", attributes }, (span) => runAgent(pi, streams, turn, span));
}

// Runs the turn on pi's agent loop, under the turn's span.
async function runAgent(pi: Pi, streams: Readonly<Record<string, ProviderStreams>>, turn: Turn, span: TelemetrySpan): Promise<void> {
  const model = buildModel(pi, turn.model, turn.connection, turn.settings, turn.listed);
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
  // The text of the message of the app's that the call going out holds, if
  // any.
  let added: string | undefined;

  // What the request of the call that runs got back, which each call starts
  // afresh.
  let got: CallAnswer | undefined;
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let response: Response;
    try {
      response = await keyless(input, init);
    } catch (error) {
      // The page's fetch fails with a TypeError where it reads no answer, and
      // with an AbortError where the request's signal aborts.
      if (error instanceof TypeError) got = "unread";
      throw error;
    }
    if (response.status === 401 || response.status === 403) got = "refused";
    return response;
  };

  const config: AgentLoopConfig = {
    model,
    reasoning: "medium",
    identity: { attribution: null },
    // Every message goes to the model as it is, but the message of the app's,
    // which goes as a message of the role user.
    convertToLlm: (messages) => llmMessages(messages),
    transformContext: async (_messages, signal) => {
      await turn.beforeCall?.(signal ?? turn.signal);
      const conversation = turn.messages();
      const transformed = turn.transformContext === undefined ? conversation : await turn.transformContext(conversation, signal ?? turn.signal);
      added = turn.appMessage === undefined ? undefined : await turn.appMessage();
      const messages = callMessages(transformed, kept, model, turn.tools, prompt);
      return added === undefined ? messages : [...messages, appMessage(added)];
    },
    getApiKey: async () => (await turn.connection.apiKey()) ?? NO_KEY,
    fetch,
    onPayload: (payload) => {
      const moved = added === undefined ? undefined : markBeforeAppMessage(payload, added, model.api);
      if (turn.onPayload === undefined) return moved;
      return turn.onPayload(moved ?? payload) ?? moved;
    },
  };

  const emit = async (event: AgentEvent): Promise<void> => {
    switch (event.type) {
      case "message_start":
      case "message_update":
        if (event.message.role === "assistant") turn.on.streaming({ parts: partsOf(event.message), reasoning: reasoningOf(event.message) });
        return;
      case "message_end":
        if (event.message.role === "assistant") await turn.on.called(callOf(pi, event.message, model, got));
        return;
      case "tool_execution_end":
        if (!given.has(event.toolCallId) && !turn.signal.aborted) {
          answered.set(event.toolCallId, answeredOf(event.result as AgentToolResult<unknown>, event.isError));
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
  await pi.runAgentLoopContinue(begun, config, emit, turn.signal, (called, messages, options) => {
    got = undefined;
    return models.streamSimple(called, messages, { ...options, telemetry: span });
  });
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

// Makes the call that writes a summary, with the settings of a turn's calls:
// the same model, credential, identity and thinking level. It asks the
// provider to cache nothing, since no later call starts as this one does, as
// pi's own CLI asks for its summaries.
async function summarize(pi: Pi, streams: Readonly<Record<string, ProviderStreams>>, call: SummaryCall): Promise<Summarized> {
  const model = buildModel(pi, call.model, call.connection, call.settings, call.listed);
  const models = modelsAt(pi, streams, call.connection, model);
  const apiKey = (await call.connection.apiKey()) ?? NO_KEY;
  const reply = await models.completeSimple(
    model,
    { systemPrompt: call.systemPrompt, messages: [{ role: "user", content: [{ type: "text", text: call.prompt }], timestamp: Date.now() }] },
    { reasoning: "medium", identity: { attribution: null }, apiKey, fetch: keyless, signal: call.signal, cacheRetention: "none" },
  );
  const usage = { input: reply.usage.input, output: reply.usage.output, total: reply.usage.totalTokens };
  const text = reply.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("").trim();
  const failure = summaryFailure(reply, text);
  return failure === undefined ? { text, usage } : { usage, failure };
}

// Why a call wrote no summary, or undefined where it wrote one. A reply that
// the model's cap for a reply cut off is no summary, since it may end
// mid-sentence, as pi's CLI has it.
function summaryFailure(reply: AssistantMessage, text: string): string | undefined {
  switch (reply.stopReason) {
    case "error":
      return reply.errorMessage ?? "The provider gave no reason.";
    case "aborted":
      return "The call was stopped before the model wrote the summary.";
    case "length":
      return "The summary reached the model's cap for a reply, so it was cut off.";
    default:
      return text === "" ? "The model wrote no summary." : undefined;
  }
}

// The model of the id given, at the connection's base URL, in its API,
// through the plugin's provider. It takes each setting from the first of these
// that gives it
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.1#the-models-settings):
// 1. The deployment's model settings, which give the model's settings by its
//    id (../model-settings).
// 2. The model of pi's catalog of OpenAI's or of Anthropic's models that the
//    model settings name in like, or else the catalog's model of the same id.
//    Such a model takes the catalog's settings, such as the thinking that it
//    takes, which Anthropic's current models refuse in any other form. It
//    takes the catalog's settings for the API alone where the catalog's model
//    speaks the connection's API.
// 3. The base URL's list of models, which may give the model's context window,
//    its cap for a reply and whether it takes images (../models).
// 4. Settings that every API takes:
//    - The model does not reason, so that pi sends no reasoning effort and
//      asks for no thinking, which a model that does not reason refuses, and
//      the model reasons as its provider has it, as today's calls leave it
//      to.
//    - It takes images, so that the plots of inspect_results reach the model,
//      as today's assistant sends them to every model.
//    - Its context window holds 128,000 tokens, as gpt-4o's does, and each
//      call asks for up to 16,384 tokens for its reply, the most that gpt-4o
//      takes. The cap goes out with every call, and pi lowers it only as the
//      input nears the window.
//    - Its cost is unknown, so pi counts none.
//
// A model whose id starts with anthropic/, on OpenRouter's Chat Completions,
// also takes pi's compat with Anthropic's format of cache marks.
// Through OpenRouter, Anthropic's cache keeps only what a call marks
// (https://openrouter.ai/docs/features/prompt-caching), and pi marks the
// calls of such a model only where its provider is named openrouter.
function buildModel(pi: Pi, id: string, connection: Connection, given: ModelSettings = {}, listed: ListedSettings = {}): Model<Api> {
  const at = { id, api: connection.api, provider: PROVIDER, baseUrl: connection.baseUrl };
  const known = catalogModel(pi, given.like ?? id);
  // The catalog's headers belong to the catalog's provider, so they go.
  const base: Model<Api> =
    known === undefined
      ? {
          ...at,
          name: id,
          reasoning: false,
          input: inputOf(["text", "image"], listed.images),
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: listed.contextWindow ?? 128_000,
          maxTokens: listed.maxTokens ?? 16_384,
        }
      : { ...known, ...at, headers: undefined, compat: known.api === connection.api ? known.compat : undefined };
  const anthropicOnOpenRouter = connection.api === "openai-completions" && connection.baseUrl === OPENROUTER_BASE_URL && id.startsWith("anthropic/");
  return {
    ...base,
    reasoning: given.reasoning ?? base.reasoning,
    input: inputOf(base.input, given.images),
    contextWindow: given.contextWindow ?? base.contextWindow,
    maxTokens: given.maxTokens ?? base.maxTokens,
    ...(anthropicOnOpenRouter ? { compat: { ...base.compat, cacheControlFormat: "anthropic" as const } } : {}),
  };
}

// The inputs of a model, with images or without them, as the setting given
// says, or as they are where it says nothing.
function inputOf(input: Model<Api>["input"], images: boolean | undefined): Model<Api>["input"] {
  if (images === undefined) return input;
  const others = input.filter((kind) => kind !== "image");
  return images ? [...others, "image"] : others;
}

// The model of the id given in pi's catalog of OpenAI's or of Anthropic's
// models, or undefined.
function catalogModel(pi: Pi, id: string): Model<Api> | undefined {
  for (const catalog of [pi.ANTHROPIC_MODELS, pi.OPENAI_MODELS] as readonly Readonly<Record<string, Model<Api>>>[]) {
    if (Object.hasOwn(catalog, id)) return catalog[id];
  }
  return undefined;
}

// The page's fetch, but for the placeholder of a call that carries no key,
// which it takes off the request. The SDKs that pi calls give their headers
// with the request's init.
function keyless(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (headers.get("authorization") === `Bearer ${NO_KEY}`) headers.delete("authorization");
  if (headers.get("x-api-key") === NO_KEY) headers.delete("x-api-key");
  return globalThis.fetch(input, { ...init, headers });
}

// A call that ended, with the reply that pi wrote, to the model given, and
// what its request got back, where that says something of the key.
function callOf(pi: Pi, reply: AssistantMessage, model: Model<Api>, answer: CallAnswer | undefined): Call {
  const written = replyOf(reply);
  const failed = reply.stopReason === "error";
  return {
    ...(written === undefined ? {} : { reply: written }),
    usage: { input: reply.usage.input, output: reply.usage.output, total: reply.usage.totalTokens },
    ...(failed ? { failure: reply.errorMessage ?? "The provider gave no reason." } : {}),
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
function answeredOf(result: AgentToolResult<unknown>, isError: boolean): Answered {
  const text = result.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n");
  const images = result.content.flatMap((block): KeptImage[] => (block.type === "image" ? [{ data: block.data, mimeType: block.mimeType }] : []));
  return { text, isError, images };
}

