// The loop on pi's fake provider (./loop.ts), whose replies each test
// scripts: a turn as it streams, its tool calls, its calls to the model, what
// each call sends, the settings of the model that it talks to, the message
// of the app's after the conversation and the mark of Anthropic's cache
// before it, a stop, a failed call, the tree of a turn's spans and the span of
// a model call of the plugin's own. The test plays the turns, which keep each
// message that the loop reports in a conversation of their own.
// One test runs a call on pi's own code for Chat Completions instead, and
// stops the call before it goes out, to read the marks of Anthropic's cache
// that pi puts in the request.

import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace";
import type { Api, Model, SimpleStreamOptions, TranscriptContext } from "@earendil-works/pi-ai";
import { ANTHROPIC_MODELS } from "@earendil-works/pi-ai/providers/anthropic.models";
import { createFauxCore, fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { OPENAI_MODELS } from "@earendil-works/pi-ai/providers/openai.models";
import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";
import { describe, expect, onTestFinished, test, vi } from "vitest";
import type { Kept } from "../conversations/index.ts";
import type { ModelSettings } from "../model-settings/index.ts";
import type { Message } from "../state/index.ts";
import { FAUX_API, fauxLoop, recordSpans, skillsHolding, startAssistant } from "../testing/index.ts";
import { readTools } from "../tools/index.ts";
import type { Tool, ToolResult } from "../tools/index.ts";
import { createLoop, PROVIDER } from "./loop.ts";
import type { Call, Streamed, Turn } from "./loop.ts";
import { STOPPED } from "./messages.ts";
import type { Answered } from "./messages.ts";
import * as pi from "./vendor.ts";

const CREATED = "2026-11-16T08:00:00.000Z";
const asked: Message = { id: "u1", role: "user", parts: [{ type: "text", text: "How many blocks?" }], created: CREATED };

function tool(name: string, run: (signal: AbortSignal) => Promise<ToolResult>, executionMode: Tool["executionMode"] = "parallel"): Tool {
  return { name, description: `The tool ${name}.`, parameters: { type: "object", properties: {} }, executionMode, execute: (_args, signal) => run(signal) };
}

const listed = tool("list_blocks", () => Promise.resolve({ text: '["a","b"]', isError: false, images: [] }));

// A turn of the conversation that the test keeps, on pi's fake provider with
// the replies given, and what the loop reported of it.
function turnWith(
  replies: FauxResponseStep[],
  given: Partial<Pick<Turn, "tools" | "model" | "settings" | "listed" | "systemPrompt" | "transformContext" | "appMessage" | "onPayload" | "beforeCall">> & {
    readonly key?: string | undefined;
  } = {},
  tokensPerSecond?: number,
) {
  const { key, ...rest } = given;
  const { faux, loop, connection } = fauxLoop({ ...(tokensPerSecond === undefined ? {} : { tokensPerSecond }), ...("key" in given ? { key } : {}) });
  faux.setResponses(replies);
  const messages: Message[] = [asked];
  const kept = new Map<string, Kept>();
  const calls: Call[] = [];
  const streamed: Streamed[] = [];
  const returned: [string, Answered][] = [];
  const controller = new AbortController();
  let keys = 0;

  const turn: Turn = {
    connection: {
      ...connection,
      apiKey: () => {
        keys += 1;
        return connection.apiKey();
      },
    },
    model: "faux-1",
    tools: [listed],
    messages: () => messages,
    kept: (id) => kept.get(id),
    signal: controller.signal,
    on: {
      streaming(reply) {
        streamed.push(reply);
      },
      called(call) {
        calls.push(call);
        if (call.reply !== undefined) {
          messages.push(call.reply.message);
          kept.set(call.reply.message.id, call.reply.kept);
        }
        return Promise.resolve();
      },
      returned(id, result) {
        returned.push([id, result]);
      },
      results(message, keptOf) {
        messages.push(message);
        kept.set(message.id, keptOf);
        return Promise.resolve();
      },
    },
    ...rest,
  };

  return { run: () => loop.run(turn), messages, kept, calls, streamed, returned, controller, keys: () => keys };
}

// A reply of pi's fake provider that records the model of the call.
function modelOfCall(into: Model<Api>[]): FauxResponseStep {
  return (_context, _options, _state, model) => {
    into.push(model);
    return fauxAssistantMessage("Two.");
  };
}

// A reply that pi's fake provider writes from a function of the call, which
// the test reads.
function seen(into: { context?: TranscriptContext; options?: SimpleStreamOptions }[], reply: ReturnType<typeof fauxAssistantMessage>): FauxResponseStep {
  return (context, options) => {
    into.push({ context, ...(options === undefined ? {} : { options }) });
    return reply;
  };
}

// The id of the span's parent, or undefined for a root.
function parentOf(span: ReadableSpan): string | undefined {
  return span.parentSpanContext?.spanId;
}

describe("a turn on the loop", () => {
  test("streams the reply, and reports it as one finished message, with its reasoning kept and its tokens, once the call ended", async () => {
    const { run, messages, kept, calls, streamed } = turnWith([fauxAssistantMessage([fauxThinking("Count them."), fauxText("The board holds two blocks.")])]);

    await run();

    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(messages[1]?.parts).toEqual([{ type: "text", text: "The board holds two blocks." }]);
    expect(kept.get(messages[1]?.id ?? "")?.reasoning).toEqual(["Count them."]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.usage.output).toBeGreaterThan(0);
    expect(calls[0]?.usage.total).toBeGreaterThanOrEqual((calls[0]?.usage.input ?? 0) + (calls[0]?.usage.output ?? 0));
    expect(calls[0]?.failure).toBeUndefined();
    // The reply streamed in pieces before it entered the conversation.
    expect(streamed.length).toBeGreaterThan(2);
    expect(streamed.at(-1)?.parts).toEqual([{ type: "text", text: "The board holds two blocks." }]);
  });

  test("runs each tool call, and reports the results of a reply's calls as one message of the role tool, in the order of the calls", async () => {
    const plotted = tool("inspect_results", () => Promise.resolve({ text: "Drew a plot.", isError: false, images: [{ data: "iVBORw0KGgo=", mimeType: "image/png" }] }));
    const { run, messages, kept, returned } = turnWith(
      [
        fauxAssistantMessage([fauxToolCall("inspect_results", {}, { id: "c1" }), fauxToolCall("list_blocks", {}, { id: "c2" })], { stopReason: "toolUse" }),
        fauxAssistantMessage("Two blocks, and a plot."),
      ],
      { tools: [plotted, listed] },
    );

    await run();

    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "tool", "assistant"]);
    expect(messages[2]?.parts).toEqual([
      { type: "tool_result", id: "c1", text: "Drew a plot.", images: 1 },
      { type: "tool_result", id: "c2", text: '["a","b"]' },
    ]);
    expect(kept.get(messages[2]?.id ?? "")?.images).toEqual({ c1: [{ data: "iVBORw0KGgo=", mimeType: "image/png" }] });
    expect(returned.map(([id]) => id).sort()).toEqual(["c1", "c2"]);
  });

  test("builds pi's messages from the conversation before each call, with the reply as pi wrote it and the tools' images", async () => {
    const calls: { context?: TranscriptContext; options?: SimpleStreamOptions }[] = [];
    const plotted = tool("inspect_results", () => Promise.resolve({ text: "Drew a plot.", isError: false, images: [{ data: "iVBORw0KGgo=", mimeType: "image/png" }] }));
    const first = fauxAssistantMessage([fauxThinking("Plot it."), fauxToolCall("inspect_results", {}, { id: "c1" })], { stopReason: "toolUse" });
    const { run } = turnWith([seen(calls, first), seen(calls, fauxAssistantMessage("Here it is."))], { tools: [plotted], systemPrompt: "Be brief." });

    await run();

    const second = calls[1]?.context?.messages ?? [];
    expect(second.map((m) => m.role)).toEqual(["system", "user", "assistant", "toolResult"]);
    expect(second[0]).toMatchObject({ role: "system", content: "Be brief.", toolsAdded: [{ name: "inspect_results" }] });
    expect(second[2]).toMatchObject({ role: "assistant", content: [{ type: "thinking", thinking: "Plot it." }, { type: "toolCall", id: "c1" }] });
    expect(second[3]).toMatchObject({ role: "toolResult", toolCallId: "c1", content: [{ type: "text", text: "Drew a plot." }, { type: "image" }] });
  });

  test("asks for the credential before each call, and sends the thinking level medium and no attribution", async () => {
    const calls: { context?: TranscriptContext; options?: SimpleStreamOptions }[] = [];
    const { run, keys } = turnWith([seen(calls, fauxAssistantMessage([fauxToolCall("list_blocks", {}, { id: "c1" })], { stopReason: "toolUse" })), seen(calls, fauxAssistantMessage("Two."))]);

    await run();

    expect(keys()).toBe(2);
    expect(calls.map((c) => c.options?.apiKey)).toEqual(["test-key", "test-key"]);
    expect(calls[0]?.options?.reasoning).toBe("medium");
    expect(calls[0]?.options?.identity?.attribution).toBeNull();
  });

  // The level off is no level at all, as pi takes it.
  test.each<{ readonly what: string; readonly api: string; readonly model: string; readonly settings?: ModelSettings; readonly level: SimpleStreamOptions["reasoning"] }>([
    { what: "the level off on Chat Completions for a model of pi's catalog of OpenAI's models", api: "openai-completions", model: "gpt-5.4", level: undefined },
    { what: "the level off on Chat Completions for a model whose like names one", api: "openai-completions", model: "company-gpt", settings: { like: "gpt-5.4-nano" }, level: undefined },
    { what: "the level medium on Chat Completions for a model outside that catalog", api: "openai-completions", model: "openai/gpt-5.4", level: "medium" },
    { what: "the level medium on Chat Completions for a model of pi's catalog of Anthropic's models", api: "openai-completions", model: "claude-sonnet-5-5", level: "medium" },
    { what: "the level medium on the Responses API for a model of pi's catalog of OpenAI's models", api: "openai-responses", model: "gpt-5.4", level: "medium" },
    { what: "the level medium on Anthropic's API", api: "anthropic-messages", model: "claude-sonnet-5-5", level: "medium" },
    {
      what: "the level that the deployment's model settings give, before the level off of Chat Completions",
      api: "openai-completions",
      model: "gpt-5.4",
      settings: { thinkingLevel: "high" },
      level: "high",
    },
    { what: "the level off that the deployment's model settings give, before the level medium", api: "openai-responses", model: "gpt-5.4", settings: { thinkingLevel: "off" }, level: undefined },
  ])("gives pi $what, for a turn's calls and for a model call of the plugin's own", async ({ api, model, settings, level }) => {
    const faux = createFauxCore({ api, provider: PROVIDER });
    const calls: { context?: TranscriptContext; options?: SimpleStreamOptions }[] = [];
    faux.setResponses([seen(calls, fauxAssistantMessage("Two.")), seen(calls, fauxAssistantMessage("The user asked how many blocks."))]);
    const loop = createLoop(pi, { [api]: faux });
    const called = {
      connection: { baseUrl: "https://proxy.invalid/v1", api, apiKey: () => Promise.resolve("test-key") },
      model,
      ...(settings === undefined ? {} : { settings }),
    };

    await loop.run({
      ...called,
      tools: [listed],
      messages: () => [asked],
      kept: () => undefined,
      signal: new AbortController().signal,
      on: { streaming: () => undefined, called: () => Promise.resolve(), returned: () => undefined, results: () => Promise.resolve() },
    });
    await loop.callModel({ ...called, systemPrompt: "Summarize.", prompt: "<conversation>[User]: How many blocks?</conversation>", signal: new AbortController().signal });

    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.options?.reasoning)).toEqual([level, level]);
  });

  test("hands pi a placeholder where the connection gives no key, which the loop's fetch takes off the request", async () => {
    const calls: { context?: TranscriptContext; options?: SimpleStreamOptions }[] = [];
    const { run } = turnWith([seen(calls, fauxAssistantMessage("Two."))], { key: undefined });
    await run();
    const sent: Headers[] = [];
    vi.stubGlobal("fetch", (_input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(new Headers(init?.headers));
      return Promise.resolve(new Response("{}"));
    });
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });

    const placeholder = calls[0]?.options?.apiKey ?? "";
    const fetch = calls[0]?.options?.fetch;
    await fetch?.("https://proxy.invalid/v1/chat/completions", { headers: { authorization: `Bearer ${placeholder}`, "content-type": "application/json" } });
    await fetch?.("https://proxy.invalid/v1/messages", { headers: new Headers({ "x-api-key": placeholder, "anthropic-version": "2023-06-01" }) });
    await fetch?.("https://api.openai.com/v1/responses", { headers: { authorization: "Bearer sk-test" } });

    expect(placeholder).not.toBe("");
    expect(sent.map((headers) => Object.fromEntries(headers))).toEqual([
      { "content-type": "application/json" },
      { "anthropic-version": "2023-06-01" },
      { authorization: "Bearer sk-test" },
    ]);
  });

  test("gives a model that pi's catalogs lack settings that every API takes", async () => {
    const models: Model<Api>[] = [];
    const { run } = turnWith(
      [
        (_context, _options, _state, model) => {
          models.push(model);
          return fauxAssistantMessage("Two.");
        },
      ],
      { model: "company-gpt-4o" },
    );

    await run();

    expect(models[0]).toMatchObject({
      id: "company-gpt-4o",
      api: FAUX_API,
      baseUrl: "https://faux.invalid/v1",
      reasoning: false,
      input: ["text", "image"],
      contextWindow: 128_000,
      maxTokens: 16_384,
    });
  });

  test("gives a model that pi's catalog holds the catalog's settings, at the connection's base URL", async () => {
    const models: Model<Api>[] = [];
    const { run } = turnWith(
      [
        (_context, _options, _state, model) => {
          models.push(model);
          return fauxAssistantMessage("Two.");
        },
      ],
      { model: "gpt-5.4" },
    );

    await run();

    const { reasoning, input, contextWindow, maxTokens } = OPENAI_MODELS["gpt-5.4"];
    expect(models[0]).toMatchObject({ id: "gpt-5.4", baseUrl: "https://faux.invalid/v1", reasoning, input, contextWindow, maxTokens });
  });

  test("gives a model the settings that the deployment's model settings give it, before those of pi's catalog", async () => {
    const models: Model<Api>[] = [];
    const { run } = turnWith([modelOfCall(models)], { model: "gpt-5.4", settings: { reasoning: false, images: false, maxTokens: 32_000 } });

    await run();

    const { contextWindow, thinkingLevelMap } = OPENAI_MODELS["gpt-5.4"];
    expect(models[0]).toMatchObject({ id: "gpt-5.4", reasoning: false, input: ["text"], contextWindow, maxTokens: 32_000, thinkingLevelMap });
  });

  test("gives a model the settings of the catalog's model that its like names, under its own id, at the connection's base URL", async () => {
    const models: Model<Api>[] = [];
    const { run } = turnWith([modelOfCall(models)], { model: "company-claude", settings: { like: "claude-sonnet-5-5", contextWindow: 200_000 } });

    await run();

    const { reasoning, input, maxTokens, thinkingLevelMap } = ANTHROPIC_MODELS["claude-sonnet-5-5"];
    expect(models[0]).toMatchObject({ id: "company-claude", api: FAUX_API, baseUrl: "https://faux.invalid/v1", reasoning, input, contextWindow: 200_000, maxTokens, thinkingLevelMap });
    expect(models[0]?.compat).toBeUndefined();
  });

  test("gives a model whose like speaks the connection's API the catalog's settings for that API, such as the thinking of Anthropic's current models", async () => {
    const faux = createFauxCore({ api: "anthropic-messages", provider: PROVIDER });
    const models: Model<Api>[] = [];
    faux.setResponses([modelOfCall(models)]);
    const loop = createLoop(pi, { "anthropic-messages": faux });

    await loop.run({
      connection: { baseUrl: "https://proxy.invalid", api: "anthropic-messages", apiKey: () => Promise.resolve("test-key") },
      model: "company-claude",
      settings: { like: "claude-sonnet-5-5" },
      tools: [],
      messages: () => [asked],
      kept: () => undefined,
      signal: new AbortController().signal,
      on: { streaming: () => undefined, called: () => Promise.resolve(), returned: () => undefined, results: () => Promise.resolve() },
    });

    expect(models[0]).toMatchObject({ id: "company-claude", api: "anthropic-messages", baseUrl: "https://proxy.invalid", compat: ANTHROPIC_MODELS["claude-sonnet-5-5"].compat });
  });

  test("gives a model that neither the model settings nor pi's catalogs hold the settings that the base URL's list gives it", async () => {
    const models: Model<Api>[] = [];
    const { run } = turnWith([modelOfCall(models)], { model: "deepseek/deepseek-v3.2", listed: { contextWindow: 163_840, maxTokens: 147_456, images: false } });

    await run();

    expect(models[0]).toMatchObject({ id: "deepseek/deepseek-v3.2", reasoning: false, input: ["text"], contextWindow: 163_840, maxTokens: 147_456 });
  });

  test("takes each setting from the model settings, then from the list, then from the defaults", async () => {
    const models: Model<Api>[] = [];
    const { run } = turnWith([modelOfCall(models)], { model: "company-gpt", settings: { reasoning: true, contextWindow: 400_000 }, listed: { contextWindow: 128_000, images: false } });

    await run();

    expect(models[0]).toMatchObject({ reasoning: true, input: ["text"], contextWindow: 400_000, maxTokens: 16_384 });
  });

  test("takes the settings of pi's catalog before those of the list", async () => {
    const models: Model<Api>[] = [];
    const { run } = turnWith([modelOfCall(models)], { model: "gpt-5.4", listed: { contextWindow: 8_192, maxTokens: 1_024, images: false } });

    await run();

    const { input, contextWindow, maxTokens } = OPENAI_MODELS["gpt-5.4"];
    expect(models[0]).toMatchObject({ input, contextWindow, maxTokens });
  });

  test("gives a model whose id starts with anthropic/ pi's compat with Anthropic's format of cache marks on OpenRouter's Chat Completions alone", async () => {
    const models: Model<Api>[] = [];
    const runOn = async (baseUrl: string, model: string) => {
      const faux = createFauxCore({ api: "openai-completions", provider: PROVIDER });
      faux.setResponses([modelOfCall(models)]);
      await createLoop(pi, { "openai-completions": faux }).run({
        connection: { baseUrl, api: "openai-completions", apiKey: () => Promise.resolve("test-key") },
        model,
        tools: [],
        messages: () => [asked],
        kept: () => undefined,
        signal: new AbortController().signal,
        on: { streaming: () => undefined, called: () => Promise.resolve(), returned: () => undefined, results: () => Promise.resolve() },
      });
    };

    await runOn("https://openrouter.ai/api/v1", "anthropic/claude-haiku-5.5");
    await runOn("https://gateway.invalid/v1", "anthropic/claude-haiku-5.5");
    await runOn("https://openrouter.ai/api/v1", "openai/gpt-5.4");

    expect(models.map((model) => model.compat)).toEqual([{ cacheControlFormat: "anthropic" }, undefined, undefined]);
  });

  test("hands each call the conversation as the caller's transformContext gives it, which the conversation does not keep", async () => {
    const calls: { context?: TranscriptContext; options?: SimpleStreamOptions }[] = [];
    const board: Message = { id: "board", role: "user", parts: [{ type: "text", text: "The board holds a and b." }], created: CREATED };
    const { run, messages } = turnWith([seen(calls, fauxAssistantMessage("Two."))], { transformContext: (conversation) => Promise.resolve([...conversation, board]) });

    await run();

    expect(calls[0]?.context?.messages.at(-1)).toMatchObject({ role: "user", content: [{ type: "text", text: "The board holds a and b." }] });
    expect(messages.map((m) => m.id)).not.toContain("board");
  });

  test("adds the caller's message of the app's after the conversation's last message of each call, which the conversation does not keep", async () => {
    const calls: { context?: TranscriptContext; options?: SimpleStreamOptions }[] = [];
    let written = 0;
    const appMessage = () => {
      written += 1;
      return Promise.resolve(`The board as call ${String(written)} goes out.`);
    };
    const { run, messages } = turnWith(
      [seen(calls, fauxAssistantMessage([fauxToolCall("list_blocks", {}, { id: "c1" })], { stopReason: "toolUse" })), seen(calls, fauxAssistantMessage("Two."))],
      { appMessage },
    );

    await run();

    expect(calls.map((call) => call.context?.messages.map(({ role }) => role))).toEqual([
      ["system", "user", "user"],
      ["system", "user", "assistant", "toolResult", "user"],
    ]);
    expect(calls.map((call) => call.context?.messages.at(-1))).toMatchObject([
      { role: "user", content: [{ type: "text", text: "The board as call 1 goes out." }] },
      { role: "user", content: [{ type: "text", text: "The board as call 2 goes out." }] },
    ]);
    expect(JSON.stringify(messages)).not.toContain("goes out");
  });

  test("hands pi an onPayload that applies the caller's, and keeps the request of an API other than Anthropic's Messages API and Chat Completions as the caller leaves it", async () => {
    const calls: { context?: TranscriptContext; options?: SimpleStreamOptions }[] = [];
    const given: unknown[] = [];
    const onPayload = (payload: unknown): unknown => {
      given.push(payload);
      return { replaced: payload };
    };
    const { run } = turnWith([seen(calls, fauxAssistantMessage("Two."))], { onPayload, appMessage: () => Promise.resolve("The board.") });

    await run();
    const sent = { messages: [{ role: "user", content: [{ type: "text", text: "The board.", cache_control: { type: "ephemeral" } }] }] };

    await expect(Promise.resolve(calls[0]?.options?.onPayload?.(sent, {} as Model<Api>))).resolves.toEqual({ replaced: sent });
    expect(given).toEqual([sent]);
  });

  test("moves the mark of Anthropic's cache from the message of the app's to the block before it, before the caller's onPayload sees the request", async () => {
    const faux = createFauxCore({ api: "anthropic-messages", provider: PROVIDER });
    const calls: { context?: TranscriptContext; options?: SimpleStreamOptions }[] = [];
    faux.setResponses([seen(calls, fauxAssistantMessage("Two."))]);
    const given: unknown[] = [];
    const messages: Message[] = [asked];
    const mark = { type: "ephemeral" };
    await createLoop(pi, { "anthropic-messages": faux }).run({
      connection: { baseUrl: "https://faux.invalid", api: "anthropic-messages", apiKey: () => Promise.resolve("test-key") },
      model: "faux-1",
      tools: [],
      messages: () => messages,
      kept: () => undefined,
      appMessage: () => Promise.resolve("The board."),
      onPayload: (payload) => {
        given.push(payload);
        return undefined;
      },
      signal: new AbortController().signal,
      on: { streaming: () => undefined, called: () => Promise.resolve(), returned: () => undefined, results: () => Promise.resolve() },
    });
    const sent = {
      messages: [
        { role: "user", content: [{ type: "text", text: "How many blocks?" }] },
        { role: "user", content: [{ type: "text", text: "The board.", cache_control: mark }] },
      ],
    };

    const moved = {
      messages: [
        { role: "user", content: [{ type: "text", text: "How many blocks?", cache_control: mark }] },
        { role: "user", content: [{ type: "text", text: "The board." }] },
      ],
    };
    await expect(Promise.resolve(calls[0]?.options?.onPayload?.(sent, {} as Model<Api>))).resolves.toEqual(moved);
    expect(given).toEqual([moved]);
  });

  test("has pi mark the system prompt, the last tool and the end of the conversation of a call to one of Anthropic's models on OpenRouter's Chat Completions, and not the message of the app's", async () => {
    const sent: unknown[] = [];
    const conversation: Message[] = [
      asked,
      { id: "a1", role: "assistant", parts: [{ type: "tool_call", id: "c1", tool: "list_blocks", args: {} }], created: CREATED },
      { id: "t1", role: "tool", parts: [{ type: "tool_result", id: "c1", text: '["a","b"]' }], created: CREATED },
    ];
    await createLoop(pi).run({
      connection: { baseUrl: "https://openrouter.ai/api/v1", api: "openai-completions", apiKey: () => Promise.resolve("test-key") },
      model: "anthropic/claude-haiku-5.5",
      tools: [listed],
      systemPrompt: "You are an assistant.",
      messages: () => conversation,
      kept: () => undefined,
      appMessage: () => Promise.resolve("The board."),
      onPayload: (payload) => {
        sent.push(payload);
        throw new Error("The test stops the call before it goes out.");
      },
      signal: new AbortController().signal,
      on: { streaming: () => undefined, called: () => Promise.resolve(), returned: () => undefined, results: () => Promise.resolve() },
    });

    const mark = { type: "ephemeral" };
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      model: "anthropic/claude-haiku-5.5",
      messages: [
        { role: "system", content: [{ type: "text", text: "You are an assistant.", cache_control: mark }] },
        { role: "user", content: [{ type: "text", text: "How many blocks?" }] },
        { role: "assistant", tool_calls: [{ id: "c1" }] },
        { role: "tool", tool_call_id: "c1", content: [{ type: "text", text: '["a","b"]', cache_control: mark }] },
        { role: "user", content: [{ type: "text", text: "The board." }] },
      ],
      tools: [{ function: { name: "list_blocks" }, cache_control: mark }],
    });
    expect(JSON.stringify(sent[0]).match(/"cache_control"/g)).toHaveLength(3);
  });

  test("answers a call to a tool that it does not offer as pi answers it, as an error", async () => {
    const { run, messages } = turnWith([fauxAssistantMessage([fauxToolCall("list_views", {}, { id: "c1" })], { stopReason: "toolUse" }), fauxAssistantMessage("No views.")]);

    await run();

    expect(messages[2]?.parts).toEqual([{ type: "tool_result", id: "c1", text: "Tool list_views not found", error: true }]);
  });
});

describe("the files that a call carries", () => {
  const pdf: Message = {
    id: "u1",
    role: "user",
    parts: [
      { type: "text", text: "Read the report." },
      { type: "attachment", name: "report.pdf", media_type: "application/pdf" },
      { type: "attachment", name: "plot.png", media_type: "image/png" },
    ],
    created: CREATED,
  };

  // The copies of the PDF and of the image that the memory keeps: the start of
  // a PDF, "JVBERi0=" as base64, and the start of a PNG, "iVBORw0KGgo=".
  const report = (): Blob => new Blob(["%PDF-"]);
  const plot = (): Blob => new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])]);

  // A reply of pi's fake provider that first asks the page's fetch, as pi's
  // APIs ask it for each call, and so meets the answer of the status given.
  function answered(status: number, reply: ReturnType<typeof fauxAssistantMessage>): FauxResponseStep {
    return async (_context, options) => {
      await options?.fetch?.("https://faux.invalid/v1/messages", { method: "POST" });
      return reply;
    };
  }

  // A turn of the conversation that holds the user's message with a PDF and
  // an image, of which the memory keeps the PDF as taken where `taken` says
  // so, on replies that the page's fetch meets with the statuses given.
  function filed(replies: FauxResponseStep[], statuses: number[], taken = false) {
    const queue = [...statuses];
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: queue.shift() ?? 200 })));
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    const turn = turnWith(replies);
    turn.messages[0] = pdf;
    turn.kept.set("u1", { files: [{ blob: report(), ...(taken ? { taken: true as const } : {}) }, { blob: plot() }] });
    return turn;
  }

  test("reports each file that the call carried, which no call carried with success before", async () => {
    const turn = filed([answered(200, fauxAssistantMessage("Read."))], [200], true);

    await turn.run();

    expect(turn.calls).toHaveLength(1);
    expect(turn.calls[0]?.files).toEqual([{ message: "u1", index: 1, name: "plot.png" }]);
    expect(turn.calls[0]?.refused).toBe(false);
  });

  test("reports that the provider refused the request where a failed call met an answer of 400, 413, 415 or 422", async () => {
    for (const status of [400, 413, 415, 422]) {
      const turn = filed([answered(status, fauxAssistantMessage("", { stopReason: "error", errorMessage: `${String(status)} Could not process the file` }))], [status]);

      await turn.run();

      expect(turn.calls[0]).toMatchObject({ failure: `${String(status)} Could not process the file`, refused: true });
      expect(turn.calls[0]?.files.map((file) => file.name)).toEqual(["report.pdf", "plot.png"]);
    }
  });

  test("reports no refusal for a call that failed otherwise, as on an answer of 401, 429 or 500 or a failed connection", async () => {
    for (const status of [401, 429, 500]) {
      const turn = filed([answered(status, fauxAssistantMessage("", { stopReason: "error", errorMessage: "No." }))], [status]);

      await turn.run();

      expect(turn.calls[0]?.refused).toBe(false);
    }
    const unasked = filed([fauxAssistantMessage("", { stopReason: "error", errorMessage: "Failed to fetch" })], []);
    await unasked.run();
    expect(unasked.calls[0]?.refused).toBe(false);
  });

  test("hands pi the PDF as an image of its type, after a line that names it", async () => {
    const calls: { context?: TranscriptContext; options?: SimpleStreamOptions }[] = [];
    const turn = filed([seen(calls, fauxAssistantMessage("Read."))], []);

    await turn.run();

    const user = calls[0]?.context?.messages.find((m) => m.role === "user");
    expect(user?.content).toEqual([
      { type: "text", text: "Read the report." },
      { type: "text", text: 'The user attached the file "report.pdf", of the type application/pdf.' },
      { type: "image", data: "JVBERi0=", mimeType: "application/pdf" },
      { type: "text", text: 'The user attached the file "plot.png", of the type image/png.' },
      { type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" },
    ]);
  });

  test("turns the PDF into Anthropic's document before it moves the cache mark, and before the caller's onPayload sees the request", async () => {
    const faux = createFauxCore({ api: "anthropic-messages", provider: PROVIDER });
    const calls: { context?: TranscriptContext; options?: SimpleStreamOptions }[] = [];
    faux.setResponses([seen(calls, fauxAssistantMessage("Read."))]);
    const given: unknown[] = [];
    // The memory gives the same copy of a file at each look, as the loop
    // expects of it.
    const files = [{ blob: report() }, { blob: plot() }];
    await createLoop(pi, { "anthropic-messages": faux }).run({
      connection: { baseUrl: "https://faux.invalid", api: "anthropic-messages", apiKey: () => Promise.resolve("test-key") },
      model: "faux-1",
      tools: [],
      messages: () => [pdf],
      kept: (id) => (id === "u1" ? { files } : undefined),
      appMessage: () => Promise.resolve("The board."),
      onPayload: (payload) => {
        given.push(payload);
        return undefined;
      },
      signal: new AbortController().signal,
      on: { streaming: () => undefined, called: () => Promise.resolve(), returned: () => undefined, results: () => Promise.resolve() },
    });
    const mark = { type: "ephemeral" };
    const said = (text: string) => ({ type: "text", text });
    const reportSource = { type: "base64", media_type: "application/pdf", data: "JVBERi0=" };
    const plotSource = { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" };
    const labels = ['The user attached the file "report.pdf", of the type application/pdf.', 'The user attached the file "plot.png", of the type image/png.'] as const;
    const sent = {
      messages: [
        { role: "user", content: [said("Read the report."), said(labels[0]), { type: "image", source: reportSource }, said(labels[1]), { type: "image", source: plotSource }] },
        { role: "user", content: [{ ...said("The board."), cache_control: mark }] },
      ],
    };
    const filed = {
      messages: [
        {
          role: "user",
          content: [said("Read the report."), said(labels[0]), { type: "document", source: reportSource, title: "report.pdf" }, said(labels[1]), { type: "image", source: plotSource, cache_control: mark }],
        },
        { role: "user", content: [said("The board.")] },
      ],
    };

    await expect(Promise.resolve(calls[0]?.options?.onPayload?.(sent, {} as Model<Api>))).resolves.toEqual(filed);
    expect(given).toEqual([filed]);
  });
});

describe("the catalogs of the loop", () => {
  test("hold the models of pi's catalogs of OpenAI's and Anthropic's models, by their ids", () => {
    const { loop } = fauxLoop();

    expect(["gpt-5.4", "claude-sonnet-5-5", "company-gpt", "openai/gpt-5.4"].map((id) => loop.inCatalog(id))).toEqual([true, true, false, false]);
  });

  test("give the context window of a model as pi takes it, from the model settings, the catalog, the list or the default", () => {
    const { loop, connection } = fauxLoop();

    expect(loop.contextWindow({ connection, model: "gpt-5.4" })).toBe(OPENAI_MODELS["gpt-5.4"].contextWindow);
    expect(loop.contextWindow({ connection, model: "gpt-5.4", settings: { contextWindow: 100_000 } })).toBe(100_000);
    expect(loop.contextWindow({ connection, model: "deepseek/deepseek-v3.2", listed: { contextWindow: 163_840 } })).toBe(163_840);
    expect(loop.contextWindow({ connection, model: "company-gpt" })).toBe(128_000);
  });
});

describe("a model call of the plugin's own", () => {
  const call = { model: "faux-1", systemPrompt: "Summarize.", prompt: "<conversation>[User]: Hi.</conversation>", signal: new AbortController().signal };

  test("sends the system prompt and one message of the role user, with no tools, and gives the text with the call's tokens", async () => {
    const calls: { context?: TranscriptContext; options?: SimpleStreamOptions }[] = [];
    const { faux, loop, connection } = fauxLoop();
    faux.setResponses([seen(calls, fauxAssistantMessage([fauxThinking("Short."), fauxText("The user said hi.")]))]);

    const reply = await loop.callModel({ ...call, connection });

    expect(reply.text).toBe("The user said hi.");
    expect(reply.failure).toBeUndefined();
    expect(reply.usage.input).toBeGreaterThan(0);
    expect(reply.usage.total).toBe(reply.usage.input + reply.usage.output);
    const messages = calls[0]?.context?.messages ?? [];
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: "system", content: "Summarize." });
    expect(messages[0]).not.toHaveProperty("toolsAdded");
    expect(messages[1]).toMatchObject({ role: "user", content: [{ type: "text", text: call.prompt }] });
    expect(calls[0]?.options).toMatchObject({ apiKey: "test-key", reasoning: "medium", cacheRetention: "none" });
    expect(calls[0]?.options?.identity?.attribution).toBeNull();
  });

  test("gives why the model wrote no text, as for a failed call, a reply that the cap cut off or an empty one", async () => {
    const { faux, loop, connection } = fauxLoop();
    faux.setResponses([
      fauxAssistantMessage([], { stopReason: "error", errorMessage: "Rate limited." }),
      fauxAssistantMessage("The user", { stopReason: "length" }),
      fauxAssistantMessage(" "),
    ]);

    const failures = [];
    for (let i = 0; i < 3; i += 1) failures.push((await loop.callModel({ ...call, connection })).failure);

    expect(failures).toEqual(["Rate limited.", "The reply reached the model's cap for a reply, so it was cut off.", "The model wrote no text."]);
  });

  test("runs in a span invoke_agent of its own, under which pi records the span of the call", async () => {
    const recorded = recordSpans();
    const { faux, loop, connection } = fauxLoop();
    faux.setResponses([fauxAssistantMessage("The user said hi.")]);

    await loop.callModel({ ...call, connection });

    const made = recorded.span("invoke_agent");
    const called = recorded.span("chat faux-1");
    expect(parentOf(made)).toBeUndefined();
    expect(made.attributes).toEqual({ "gen_ai.operation.name": "invoke_agent", "gen_ai.provider.name": "faux", "gen_ai.request.model": "faux-1" });
    expect(parentOf(called)).toBe(made.spanContext().spanId);
    expect(called.kind).toBe(SpanKind.CLIENT);
    expect(called.attributes).toMatchObject({ "gen_ai.operation.name": "chat", "gen_ai.provider.name": "faux", "gen_ai.request.model": "faux-1" });
  });
});

describe("a turn that stops or fails", () => {
  // A turn whose reply streams on timers and which stops once a streamed
  // reply passes the check given.
  function stoppedWhen(check: (reply: Streamed) => boolean) {
    const reply = fauxAssistantMessage([fauxText("The board holds two blocks, and I will list them."), fauxToolCall("list_blocks", {}, { id: "c1" })], { stopReason: "toolUse" });
    const turn = turnWith([reply], {}, 400);
    const push = turn.streamed.push.bind(turn.streamed);
    turn.streamed.push = (...items: Streamed[]) => {
      if (items.some(check)) turn.controller.abort();
      return push(...items);
    };
    return turn;
  }

  test("enters what the reply streamed until the stop as its message, which the memory does not keep as pi wrote it", async () => {
    const turn = stoppedWhen((reply) => reply.parts.length > 0);

    await turn.run();

    const [, written, ...rest] = turn.messages;
    const said = written?.parts[0]?.type === "text" ? written.parts[0].text : "";
    expect(said.length).toBeGreaterThan(0);
    expect(said.length).toBeLessThan("The board holds two blocks, and I will list them.".length);
    expect("The board holds two blocks, and I will list them.".startsWith(said)).toBe(true);
    expect(turn.kept.get(written?.id ?? "")?.reply).toBeUndefined();
    expect(rest).toEqual([]);
    expect(turn.calls.every((call) => call.failure === undefined)).toBe(true);
  });

  test("gives the tool calls that the reply streamed until the stop results that say the user stopped the turn", async () => {
    const turn = stoppedWhen((reply) => reply.parts.some((part) => part.type === "tool_call"));

    await turn.run();

    expect(turn.messages.map((m) => m.role)).toEqual(["user", "assistant", "tool"]);
    expect(turn.messages[1]?.parts.map((part) => part.type)).toEqual(["text", "tool_call"]);
    expect(turn.messages[2]?.parts).toEqual([{ type: "tool_result", id: "c1", text: STOPPED, error: true }]);
  });

  test("keeps the results that the tools gave before a stop, and says that the user stopped the turn for each call left without one", async () => {
    let stop = (): void => undefined;
    const waits = tool(
      "describe_block",
      (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(signal.reason as Error);
          });
          stop();
        }),
    );
    const turn = turnWith(
      [fauxAssistantMessage([fauxToolCall("list_blocks", {}, { id: "c1" }), fauxToolCall("describe_block", {}, { id: "c2" })], { stopReason: "toolUse" }), fauxAssistantMessage("Never sent.")],
      { tools: [listed, waits] },
    );
    stop = () => {
      queueMicrotask(() => {
        turn.controller.abort();
      });
    };

    await turn.run();

    expect(turn.messages.map((m) => m.role)).toEqual(["user", "assistant", "tool"]);
    expect(turn.messages[2]?.parts).toEqual([
      { type: "tool_result", id: "c1", text: '["a","b"]' },
      { type: "tool_result", id: "c2", text: STOPPED, error: true },
    ]);
    // The call after the stop streamed nothing, so it adds no message.
    expect(turn.calls.at(-1)?.reply).toBeUndefined();
  });

  test("keeps a result that a tool gives after the stop, as the edit tool gives one once its commands applied", async () => {
    let stop = (): void => undefined;
    const edits = tool(
      "edit",
      (signal) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () => {
            setTimeout(() => {
              resolve({ text: "The commands applied.", isError: false, images: [] });
            }, 10);
          });
          stop();
        }),
      "sequential",
    );
    const turn = turnWith([fauxAssistantMessage([fauxToolCall("edit", {}, { id: "c1" })], { stopReason: "toolUse" }), fauxAssistantMessage("Never sent.")], {
      tools: [edits],
    });
    stop = () => {
      queueMicrotask(() => {
        turn.controller.abort();
      });
    };

    await turn.run();

    expect(turn.messages[2]?.parts).toEqual([{ type: "tool_result", id: "c1", text: "The commands applied." }]);
  });

  test("reports a failed call with why it failed, after the reply that it streamed until then", async () => {
    const { run, messages, kept, calls } = turnWith([fauxAssistantMessage([fauxText("I will look.")], { stopReason: "error", errorMessage: "401 Unauthorized" })]);

    await run();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.failure).toBe("401 Unauthorized");
    expect(calls[0]?.overflow).toBeUndefined();
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(kept.get(messages[1]?.id ?? "")?.reply).toBeUndefined();
  });

  test("reports a call that failed since the conversation outgrew the window, as pi tells it from the provider's error", async () => {
    const { run, calls } = turnWith([fauxAssistantMessage([], { stopReason: "error", errorMessage: "Your input exceeds the context window of this model." })]);

    await run();

    expect(calls[0]?.overflow).toBe(true);
  });
});

describe("before each call", () => {
  test("the loop waits for what the caller does, and then reads the conversation", async () => {
    const contexts: TranscriptContext[] = [];
    const record: FauxResponseStep = (context) => {
      contexts.push(context);
      return fauxAssistantMessage("Two.");
    };
    let before = 0;
    const turn = turnWith([record], {
      beforeCall: async () => {
        before += 1;
        await Promise.resolve();
        turn.messages.splice(0, 1, { ...asked, parts: [{ type: "text", text: "How many blocks now?" }] });
      },
    });

    await turn.run();

    expect(before).toBe(1);
    expect(contexts[0]?.messages.at(-1)).toMatchObject({ role: "user", content: [{ type: "text", text: "How many blocks now?" }] });
  });
});

describe("the spans of a turn", () => {
  test("hold each call to the model and each tool call under the turn's span, and core's span of a tool's request under the tool's span", async () => {
    const recorded = recordSpans();
    const stub = await startAssistant({ answers: { describe_result: ({ reads }) => Object.fromEntries(reads.map(({ block }) => [block, [`The result of ${block}.`]])) } });
    await stub.settled();
    const tools = readTools(stub.core, skillsHolding());
    const { run } = turnWith(
      [fauxAssistantMessage([fauxToolCall("get_block_result", { id: "a" }, { id: "c1" })], { stopReason: "toolUse" }), fauxAssistantMessage("The block a holds a dataset.")],
      { tools },
    );

    await run();

    const turn = recorded.span("invoke_agent");
    const calls = recorded.spans().filter((span) => span.name === "chat faux-1");
    const tool = recorded.span("execute_tool get_block_result");
    const request = recorded.span("request describe_result");
    expect(parentOf(turn)).toBeUndefined();
    expect(turn.attributes).toEqual({ "gen_ai.operation.name": "invoke_agent", "gen_ai.provider.name": "faux", "gen_ai.request.model": "faux-1" });
    expect(calls.map(parentOf)).toEqual([turn.spanContext().spanId, turn.spanContext().spanId]);
    expect(calls.map((call) => call.kind)).toEqual([SpanKind.CLIENT, SpanKind.CLIENT]);
    expect(calls[0]?.attributes).toMatchObject({ "gen_ai.operation.name": "chat", "gen_ai.provider.name": "faux", "gen_ai.request.model": "faux-1", stop: "toolUse" });
    expect(parentOf(tool)).toBe(turn.spanContext().spanId);
    expect(tool.attributes).toEqual({
      "gen_ai.operation.name": "execute_tool",
      "gen_ai.tool.name": "get_block_result",
      "gen_ai.tool.description": tools.find((offered) => offered.name === "get_block_result")?.description,
      "gen_ai.tool.call.id": "c1",
    });
    expect(parentOf(request)).toBe(tool.spanContext().spanId);
    expect(new Set([turn, ...calls, tool, request].map((span) => span.spanContext().traceId)).size).toBe(1);
    // The turn's span ends last, once the turn ended.
    expect(recorded.spans().indexOf(turn)).toBeGreaterThan(recorded.spans().indexOf(calls[1] ?? turn));
  });

  test("give a call that failed the provider's message in its span's status", async () => {
    const recorded = recordSpans();
    const { run } = turnWith([fauxAssistantMessage([fauxText("I will look.")], { stopReason: "error", errorMessage: "401 Unauthorized" })]);

    await run();

    const call = recorded.span("chat faux-1");
    expect(call.status).toEqual({ code: SpanStatusCode.ERROR, message: "401 Unauthorized" });
    expect(call.attributes["error.type"]).toBe("provider_error");
    expect(recorded.span("invoke_agent").status.code).toBe(SpanStatusCode.UNSET);
  });

  test("mark the span of a tool call that the user stopped as failed", async () => {
    const recorded = recordSpans();
    let stop = (): void => undefined;
    const waits = tool(
      "describe_block",
      (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(signal.reason as Error);
          });
          stop();
        }),
    );
    const turn = turnWith([fauxAssistantMessage([fauxToolCall("describe_block", {}, { id: "c1" })], { stopReason: "toolUse" }), fauxAssistantMessage("Never sent.")], {
      tools: [waits],
    });
    stop = () => {
      queueMicrotask(() => {
        turn.controller.abort(new DOMException("The user stopped the turn.", "AbortError"));
      });
    };

    await turn.run();

    const called = recorded.span("execute_tool describe_block");
    expect(called.status).toEqual({ code: SpanStatusCode.ERROR, message: "The user stopped the turn." });
    expect(called.attributes["error.type"]).toBe("AbortError");
  });
});
