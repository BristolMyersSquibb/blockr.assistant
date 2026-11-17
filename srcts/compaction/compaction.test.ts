// Compaction (./compaction.ts) on core's CoreApi for tests, with the
// conversations and the turns of the board, and the loop on pi's fake
// provider: the summary that goes in before a turn's call past the rule, what
// the calls send, a split exchange, an earlier summary, the retry after a
// call that outgrew the window, a failed summary's warning, a stop, the
// user's ask, a cap of 0 and the next board.
// The tests make the conversations, the compaction and the turns themselves,
// on the assistant's class without its start, which would open the board's
// own.

import type { CoreApi, Json } from "@blockr/core";
import { HELLO, stubCore } from "@blockr/core/stubs";
import type { Context, SystemMessage, UserMessage } from "@earendil-works/pi-ai";
import { fauxAssistantMessage } from "@earendil-works/pi-ai/providers/faux";
import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";
import { describe, expect, onTestFinished, test, vi } from "vitest";
import { createConversations } from "../conversations/index.ts";
import type { Deployment } from "../deployment/index.ts";
import { SUMMARY_PREFIX, SUMMARY_SUFFIX } from "../loop/index.ts";
import type { Offered } from "../models/index.ts";
// The module of the assistant's class, which core imports as the page does.
// eslint-disable-next-line no-restricted-imports
import * as assistant from "../modules/assistant_plugin/index.tsx";
import { heldError } from "../notifications/index.ts";
import type { AssistantState, Conversation, Message, Role } from "../state/index.ts";
import { FAUX_API, fauxLoop } from "../testing/index.ts";
import { createTurns } from "../turns/index.ts";
import { createCompaction } from "./compaction.ts";
import { historyPrompt, mergedSummary, SUMMARY_SYSTEM_PROMPT, turnStartPrompt } from "./prompt.ts";

const ASSISTANT = "blockr.assistant-assistant_plugin";
const EARLY = "2026-11-16T08:00:00.000Z";
const SUMMARY = "## Goal\nA sales chart from the block b1.";
const OVERFLOW = "prompt is too long: 213462 tokens > 200000 maximum";

// The window of the model faux-1 in these tests, under which a call that
// would send more than 23,616 tokens needs a summary first, and a summary
// keeps about 10,000.
const WINDOW = 40_000;

// A message whose text holds the tokens given, 3,000 unless given.
function message(id: string, role: Role, tokens = 3_000): Message {
  return { id, role, parts: [{ type: "text", text: `${id} `.padEnd(tokens * 4, "x") }], created: EARLY };
}

// The results of a reply's tool calls, which hold the tokens given.
function results(id: string, tokens: number): Message {
  return { id, role: "tool", parts: [{ type: "tool_result", id: `${id}-call`, text: "x".repeat(tokens * 4) }], created: EARLY };
}

function conversation(last: number, ...messages: Message[]): Conversation {
  return { title: "Sales", updated: EARLY, messages, usage: { input: 1_000, output: 100, last }, model: null };
}

// Three exchanges of 6,000 tokens, whose last call sent 30,000. A summary
// keeps the last two exchanges.
const exchanges = [message("u1", "user"), message("a1", "assistant"), message("u2", "user"), message("a2", "assistant"), message("u3", "user"), message("a3", "assistant")];
const past = conversation(30_000, ...exchanges);

// R's reply to hello in an app that runs the assistant, on a board that holds
// no block and holds the assistant's state given.
function helloWith(state: AssistantState): typeof HELLO {
  return {
    ...HELLO,
    packages: { ...HELLO.packages, "blockr.assistant": "0.2.0" },
    plugins: {
      ...HELLO.plugins,
      [ASSISTANT]: { name: "Assistant", version: 1, module: "blockr.assistant/js/assistant_plugin.js" },
    },
    board: {
      ...HELLO.board,
      board: {
        ...HELLO.board.board,
        versions: { ...HELLO.board.board.versions, [ASSISTANT]: 1 },
        blocks: {},
        links: {},
        stacks: {},
        plugins: { ...HELLO.board.board.plugins, [ASSISTANT]: state },
      },
    },
  };
}

interface OpenOptions {
  readonly conversations: Readonly<Record<string, Conversation>>;
  readonly replies?: FauxResponseStep[];
  readonly offered?: Offered;
  readonly blockrOptions?: Readonly<Record<string, Json>>;
}

// Core on a board that holds the conversations given, and the compaction and
// the turns of that board on pi's fake provider, with the replies given. Core
// stops as the test finishes.
async function opened(options: OpenOptions) {
  const stubbed = await stubCore({
    hello: helloWith({ conversations: options.conversations }),
    modules: { [ASSISTANT]: { api: 1, default: { ...assistant.default, start: undefined } } },
    ...(options.blockrOptions === undefined ? {} : { blockrOptions: options.blockrOptions }),
  });
  const controller = new AbortController();
  onTestFinished(() => {
    controller.abort();
    stubbed.stop();
  });
  const conversations = createConversations(stubbed.core, controller.signal);
  await conversations.opened;
  const { faux, loop } = fauxLoop();
  faux.setResponses(options.replies ?? [fauxAssistantMessage(SUMMARY)]);
  const calls = {
    deployment: Promise.resolve(deployed()),
    models: { offered: () => Promise.resolve(options.offered ?? { models: ["faux-1"], named: true }) },
    settings: { checked: () => Promise.resolve(new Map([["faux-1", { contextWindow: WINDOW }]])) },
    load: () => Promise.resolve(loop),
  };
  const compaction = createCompaction(stubbed.core, controller.signal, { conversations, ...calls });
  const turns = createTurns(stubbed.core, controller.signal, {
    conversations,
    tools: [],
    ...calls,
    callFailed: heldError(stubbed.core, controller.signal, "assistant_call_failed"),
    prompt: { system: () => Promise.resolve("You edit a board."), appMessage: () => Promise.resolve("The board holds no block.") },
    compaction,
    locks: undefined,
  });
  const close = (): void => {
    controller.abort();
  };
  return { ...stubbed, conversations, compaction, turns, faux, close };
}

function deployed(): Deployment {
  return { baseUrl: "https://faux.invalid/v1", api: FAUX_API, credential: { kind: "deployment", key: "test-key" }, models: undefined };
}

// A reply that records the request of the call that it answers, and waits
// for the test to let it go, or for the call to stop, where the test gives a
// promise to wait for.
function replying(into: Context["messages"][], text: string, wait?: Promise<void>): FauxResponseStep {
  return async (context, options) => {
    into.push(context.messages);
    if (wait !== undefined) {
      await new Promise<void>((resolve) => {
        void wait.then(resolve);
        const signal = options?.signal;
        if (signal?.aborted === true) resolve();
        signal?.addEventListener("abort", () => {
          resolve();
        });
      });
    }
    return fauxAssistantMessage(text);
  };
}

// A promise that the test resolves.
function gate() {
  let open = (): void => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

function asked(id: string): Message {
  return message(id, "user", 10);
}

function inState(core: CoreApi, id: string): Conversation | undefined {
  return (core.store.board().plugins[ASSISTANT] as AssistantState).conversations[id];
}

// The ids of the conversation's messages as the test gave them, its summary
// as "summary" and each reply that a turn added as "reply".
function shape(held: Conversation | undefined): string[] {
  return held?.messages.map((kept) => (kept.role === "summary" ? "summary" : /^[uars]\d+$/.test(kept.id) ? kept.id : "reply")) ?? [];
}

function summaryOf(held: Conversation | undefined): string | undefined {
  const part = held?.messages.find((kept) => kept.role === "summary")?.parts[0];
  return part?.type === "text" ? part.text : undefined;
}

function noticed(core: CoreApi, code: string): string[] {
  return core.notifications
    .get()
    .filter((notification) => notification.source.kind === "module" && notification.source.code === code)
    .map((notification) => `${notification.severity}: ${notification.message}`);
}

function userText(sent: Context["messages"] | undefined, index: number): string | undefined {
  const content = (sent?.[index] as UserMessage | undefined)?.content;
  return Array.isArray(content) && content[0]?.type === "text" ? content[0].text : undefined;
}

describe("before a turn's call", () => {
  test("a summary takes the place of the older messages where the call would pass the rule, and the call sends it instead", async () => {
    const sent: Context["messages"][] = [];
    const { core, conversations, turns } = await opened({
      conversations: { c1: past },
      replies: [replying(sent, SUMMARY), replying(sent, "Done.")],
    });

    await conversations.addMessage("c1", asked("u4"));
    await turns.run("c1");

    const held = inState(core, "c1");
    expect(shape(held)).toEqual(["summary", "u2", "a2", "u3", "a3", "u4", "reply"]);
    expect(summaryOf(held)).toBe(SUMMARY);
    expect(held?.usage.input).toBeGreaterThan(past.usage.input);
    expect(sent[0]).toHaveLength(2);
    const system = sent[0]?.[0] as SystemMessage | undefined;
    expect(system?.content).toBe(SUMMARY_SYSTEM_PROMPT);
    expect(system?.toolsAdded ?? []).toEqual([]);
    expect(userText(sent[0], 1)).toBe(historyPrompt(exchanges.slice(0, 2)));
    expect(userText(sent[1], 1)).toBe(`${SUMMARY_PREFIX}${SUMMARY}${SUMMARY_SUFFIX}`);
  });

  test("no summary goes in where the call is within the rule", async () => {
    const { core, conversations, turns, faux } = await opened({ conversations: { c1: { ...past, usage: { ...past.usage, last: 20_000 } } }, replies: [fauxAssistantMessage("Done.")] });

    await conversations.addMessage("c1", asked("u4"));
    await turns.run("c1");

    expect(faux.state.callCount).toBe(1);
    expect(shape(inState(core, "c1"))).toEqual(["u1", "a1", "u2", "a2", "u3", "a3", "u4", "reply"]);
  });

  test("the rule estimates every message until a reply follows the summary, since the last call sent what the summary replaced", async () => {
    const summary: Message = { ...message("s1", "summary", 100), created: "2026-11-16T09:00:00.000Z" };
    const { faux, conversations, turns } = await opened({
      conversations: { c1: conversation(30_000, summary, message("u2", "user", 10), message("a2", "assistant", 10)) },
      replies: [fauxAssistantMessage("Done.")],
    });

    await conversations.addMessage("c1", asked("u3"));
    await turns.run("c1");

    expect(faux.state.callCount).toBe(1);
  });

  test("a turn waits for the summary that the user asked for, and its call sends that summary", async () => {
    const sent: Context["messages"][] = [];
    const held = gate();
    const { core, compaction, conversations, turns } = await opened({
      conversations: { c1: past },
      replies: [replying(sent, SUMMARY, held.opened), replying(sent, "Done.")],
    });

    const compacted = compaction.compact("c1");
    await vi.waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(compaction.writing("c1")).toBe(true);
    await conversations.addMessage("c1", asked("u4"));
    const turn = turns.run("c1");
    held.open();
    await compacted;
    await turn;

    expect(shape(inState(core, "c1"))).toEqual(["summary", "u2", "a2", "u3", "a3", "u4", "reply"]);
    expect(userText(sent[1], 1)).toBe(`${SUMMARY_PREFIX}${SUMMARY}${SUMMARY_SUFFIX}`);
    expect(compaction.writing("c1")).toBe(false);
  });

  test("a summary that the turn waits for stops with the turn, and writes nothing", async () => {
    const sent: Context["messages"][] = [];
    const held = gate();
    const { core, compaction, conversations, turns } = await opened({
      conversations: { c1: past },
      replies: [replying(sent, SUMMARY, held.opened), fauxAssistantMessage("Done.")],
    });

    await conversations.addMessage("c1", asked("u4"));
    const turn = turns.run("c1");
    await vi.waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    turns.stop();
    await turn;

    expect(shape(inState(core, "c1"))).toEqual(["u1", "a1", "u2", "a2", "u3", "a3", "u4"]);
    expect(compaction.writing("c1")).toBe(false);
    expect(noticed(core, "assistant_compaction_failed")).toEqual([]);
  });
});

describe("a call that outgrew the window", () => {
  test("gets a summary in place, and the turn tries it once more, raising nothing", async () => {
    const { core, conversations, turns } = await opened({
      conversations: { c1: { ...past, usage: { ...past.usage, last: 20_000 } } },
      replies: [fauxAssistantMessage([], { stopReason: "error", errorMessage: OVERFLOW }), fauxAssistantMessage(SUMMARY), fauxAssistantMessage("Done.")],
    });

    await conversations.addMessage("c1", asked("u4"));
    await turns.run("c1");

    expect(shape(inState(core, "c1"))).toEqual(["summary", "u2", "a2", "u3", "a3", "u4", "reply"]);
    expect(noticed(core, "assistant_call_failed")).toEqual([]);
  });
});

describe("a summary", () => {
  test("of a cut inside an exchange holds a summary of the exchange's start of its own", async () => {
    const sent: Context["messages"][] = [];
    const split = [message("u1", "user", 100), message("a1", "assistant"), results("r1", 4_000), message("a2", "assistant"), results("r2", 4_000), message("a3", "assistant", 100)];
    const { core, compaction } = await opened({ conversations: { c1: conversation(30_000, ...split) }, replies: [replying(sent, "## Original Request\nA chart.")] });

    await compaction.compact("c1");

    expect(sent).toHaveLength(1);
    expect(userText(sent[0], 1)).toBe(turnStartPrompt(split.slice(0, 3)));
    expect(shape(inState(core, "c1"))).toEqual(["summary", "a2", "r2", "a3"]);
    expect(summaryOf(inState(core, "c1"))).toBe(mergedSummary("No prior history.", "## Original Request\nA chart."));
  });

  test("updates an earlier summary rather than summarizing it", async () => {
    const sent: Context["messages"][] = [];
    const earlier: Message = { id: "s1", role: "summary", parts: [{ type: "text", text: "## Goal\nCharts." }], created: EARLY };
    const { core, compaction } = await opened({ conversations: { c1: conversation(30_000, earlier, ...exchanges) }, replies: [replying(sent, SUMMARY)] });

    await compaction.compact("c1");

    expect(userText(sent[0], 1)).toBe(historyPrompt(exchanges.slice(0, 2), "## Goal\nCharts."));
    expect(shape(inState(core, "c1"))).toEqual(["summary", "u2", "a2", "u3", "a3"]);
  });

  test("that the user asks for goes in whatever the rule says, but makes no call where nothing is to summarize", async () => {
    const asks = await opened({ conversations: { c1: { ...past, usage: { ...past.usage, last: 0 } } } });
    expect(await asks.compaction.compact("c1")).toBe(true);
    expect(shape(inState(asks.core, "c1"))).toEqual(["summary", "u2", "a2", "u3", "a3"]);

    const small = await opened({ conversations: { c1: conversation(100, message("u1", "user", 10), message("a1", "assistant", 10)) } });
    expect(await small.compaction.compact("c1")).toBe(false);
    expect(small.faux.state.callCount).toBe(0);
  });

  test("goes into the memory alone under a cap of 0", async () => {
    const { core, compaction, conversations } = await opened({ conversations: { c1: past }, blockrOptions: { chat_save_turns: 0 } });

    await compaction.compact("c1");

    expect(shape(conversations.get("c1"))).toEqual(["summary", "u2", "a2", "u3", "a3"]);
    expect((core.store.board().plugins[ASSISTANT] as AssistantState).conversations).toEqual({});
  });

  test("that fails raises the warning assistant_compaction_failed, which a later summary withdraws, and the turn's call goes out as it was", async () => {
    const { core, compaction, conversations, turns } = await opened({
      conversations: { c1: past },
      replies: [fauxAssistantMessage([], { stopReason: "error", errorMessage: "The provider is down." }), fauxAssistantMessage("Done."), fauxAssistantMessage(SUMMARY)],
    });

    await conversations.addMessage("c1", asked("u4"));
    await turns.run("c1");

    expect(shape(inState(core, "c1"))).toEqual(["u1", "a1", "u2", "a2", "u3", "a3", "u4", "reply"]);
    expect(noticed(core, "assistant_compaction_failed")).toEqual([
      'warning: The assistant could not summarize the earlier messages of the conversation "Sales": The provider is down.',
    ]);

    expect(await compaction.compact("c1")).toBe(true);
    expect(noticed(core, "assistant_compaction_failed")).toEqual([]);
  });

  test("that fails has its warning withdrawn once the conversation goes", async () => {
    const { core, compaction } = await opened({
      conversations: { c1: past },
      replies: [fauxAssistantMessage([], { stopReason: "error", errorMessage: "The provider is down." })],
    });
    await compaction.compact("c1");
    expect(noticed(core, "assistant_compaction_failed")).toHaveLength(1);

    await core.commands.run("blockr.assistant-remove_conversation", { conversation: "c1" }, "assistant");

    expect(noticed(core, "assistant_compaction_failed")).toEqual([]);
  });

  test("whose conversation goes meanwhile goes with it, and raises nothing", async () => {
    const sent: Context["messages"][] = [];
    const held = gate();
    const { core, compaction } = await opened({ conversations: { c1: past }, replies: [replying(sent, SUMMARY, held.opened)] });

    const compacted = compaction.compact("c1");
    await vi.waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    await core.commands.run("blockr.assistant-remove_conversation", { conversation: "c1" }, "assistant");
    held.open();

    expect(await compacted).toBe(false);
    expect(noticed(core, "assistant_compaction_failed")).toEqual([]);
  });

  test("raises nothing where the deployment offers no model, since the models raised why", async () => {
    const { core, compaction, faux } = await opened({ conversations: { c1: past }, offered: { models: [], named: false, failure: "The list offers no model." } });

    expect(await compaction.compact("c1")).toBe(false);
    expect(faux.state.callCount).toBe(0);
    expect(noticed(core, "assistant_compaction_failed")).toEqual([]);
  });

  test("writes nothing once the next board opens", async () => {
    const sent: Context["messages"][] = [];
    const held = gate();
    const { core, compaction, close } = await opened({ conversations: { c1: past }, replies: [replying(sent, SUMMARY, held.opened)] });

    const compacted = compaction.compact("c1");
    await vi.waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    close();
    held.open();

    expect(await compacted).toBe(false);
    expect(inState(core, "c1")).toEqual(past);
    expect(noticed(core, "assistant_compaction_failed")).toEqual([]);
  });
});
