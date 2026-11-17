// Compaction (./compaction.ts) on core's CoreApi for tests, with the
// conversations of the board and the loop on pi's fake provider: the summary
// that a conversation past its rule gets as the board opens and as a turn in
// it ends, what the call sends, what the summary keeps, the messages that
// entered meanwhile, a failed call's warning, the user's ask, a cap of 0 and
// the next board.
// The tests make the conversations and the compaction themselves, on the
// assistant's class without its start, which would open the board's own, and
// play the turns, whose ends the compaction follows.

import type { CoreApi } from "@blockr/core";
import { HELLO, stubCore } from "@blockr/core/stubs";
import type { Json } from "@blockr/core";
import type { Context, SystemMessage, UserMessage } from "@earendil-works/pi-ai";
import { fauxAssistantMessage } from "@earendil-works/pi-ai/providers/faux";
import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";
import { describe, expect, onTestFinished, test, vi } from "vitest";
import { createConversations } from "../conversations/index.ts";
import type { Deployment } from "../deployment/index.ts";
import type { Offered } from "../models/index.ts";
// The module of the assistant's class, which core imports as the page does.
// eslint-disable-next-line no-restricted-imports
import * as assistant from "../modules/assistant_plugin/index.tsx";
import type { AssistantState, Conversation, Message, Role } from "../state/index.ts";
import { FAUX_API, fauxLoop } from "../testing/index.ts";
import type { Running, Turns } from "../turns/index.ts";
import { createCompaction } from "./compaction.ts";
import { SUMMARY_SYSTEM_PROMPT, summaryPrompt } from "./prompt.ts";

const ASSISTANT = "blockr.assistant-assistant_plugin";
const EARLY = "2026-11-16T08:00:00.000Z";
const SUMMARY = "The user built a sales chart from the block b1.";

// The window of the model faux-1 in these tests, under which a conversation
// needs a summary once its last call passes 23,616 tokens, and a summary keeps
// up to 10,000.
const WINDOW = 40_000;

// A message whose text holds the tokens given, 3,000 unless given.
function message(id: string, role: Role, tokens = 3_000): Message {
  return { id, role, parts: [{ type: "text", text: `${id} `.padEnd(tokens * 4, "x") }], created: EARLY };
}

function conversation(last: number, ...messages: Message[]): Conversation {
  return { title: "Sales", updated: EARLY, messages, usage: { input: 1_000, output: 100, last }, model: null };
}

// Three exchanges of 6,000 tokens, whose last call passed the rule. A summary
// keeps the last exchange.
const past = conversation(30_000, message("u1", "user"), message("a1", "assistant"), message("u2", "user"), message("a2", "assistant"), message("u3", "user"), message("a3", "assistant"));

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

// The turns of the board, which a test plays: start() runs a turn in a
// conversation, and end() ends it.
function playedTurns() {
  const listeners = new Set<() => void>();
  let running: Running | undefined;
  const changed = (): void => {
    for (const listener of listeners) listener();
  };
  const turns: Pick<Turns, "current" | "subscribe"> = {
    current: () => running,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    turns,
    start(conversation: string) {
      running = { conversation, reply: undefined, results: {}, stopping: false };
      changed();
    },
    end() {
      running = undefined;
      changed();
    },
  };
}

interface OpenOptions {
  readonly conversations: Readonly<Record<string, Conversation>>;
  readonly replies?: FauxResponseStep[];
  readonly offered?: Offered;
  readonly blockrOptions?: Readonly<Record<string, Json>>;
  // The conversation in which a turn runs as the board opens.
  readonly runningIn?: string;
}

// Core on a board that holds the conversations given, and the compaction of
// that board on pi's fake provider, with the replies given. Core stops as the
// test finishes.
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
  const { faux, loop } = fauxLoop();
  faux.setResponses(options.replies ?? [fauxAssistantMessage(SUMMARY)]);
  const played = playedTurns();
  if (options.runningIn !== undefined) played.start(options.runningIn);
  let loads = 0;
  const compaction = createCompaction(stubbed.core, controller.signal, {
    conversations,
    turns: played.turns,
    deployment: Promise.resolve(deployed()),
    models: { offered: () => Promise.resolve(options.offered ?? { models: ["faux-1"] }) },
    settings: { checked: () => Promise.resolve(new Map([["faux-1", { contextWindow: WINDOW }]])) },
    load: () => {
      loads += 1;
      return Promise.resolve(loop);
    },
  });
  const close = (): void => {
    controller.abort();
  };
  return { ...stubbed, conversations, compaction, faux, played, loads: () => loads, close };
}

function deployed(): Deployment {
  return { baseUrl: "https://faux.invalid/v1", api: FAUX_API, credential: { kind: "deployment", key: "test-key" }, models: undefined };
}

// A reply that records the request that the call sent, and waits for the
// test to let it go, if the test gives a promise to wait for.
function summarizing(into: Context["messages"][], wait?: Promise<void>, text = SUMMARY): FauxResponseStep {
  return async (context) => {
    into.push(context.messages);
    await wait;
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

function inState(core: CoreApi, id: string): Conversation | undefined {
  return (core.store.board().plugins[ASSISTANT] as AssistantState).conversations[id];
}

function ids(held: Conversation | undefined): string[] {
  return held?.messages.map((kept) => kept.id) ?? [];
}

// The ids of the conversation's messages, its summary as "summary".
function shape(held: Conversation | undefined): string[] {
  return held?.messages.map((kept) => (kept.role === "summary" ? "summary" : kept.id)) ?? [];
}

function warnings(core: CoreApi): string[] {
  return core.notifications
    .get()
    .filter((notification) => notification.source.kind === "module" && notification.source.code === "assistant_compaction_failed")
    .map((notification) => `${notification.severity}: ${notification.message}`);
}

describe("compaction", () => {
  test("puts a summary in place of a conversation's older messages as the board opens, where its last call passed the rule", async () => {
    const sent: Context["messages"][] = [];
    const { core, compaction } = await opened({ conversations: { c1: past }, replies: [summarizing(sent)] });

    await compaction.judge("c1");

    const held = inState(core, "c1");
    expect(shape(held)).toEqual(["summary", "u3", "a3"]);
    expect(held?.messages[0]?.parts).toEqual([{ type: "text", text: SUMMARY }]);
    expect(held?.usage.input).toBeGreaterThan(past.usage.input);
    expect(held?.usage.output).toBeGreaterThan(past.usage.output);
    expect(held?.usage.last).toBeLessThan(past.usage.last);
    expect(compaction.writing("c1")).toBe(false);
  });

  test("sends the older messages as text under a system prompt of its own, with no tools and no message of the app's", async () => {
    const sent: Context["messages"][] = [];
    const { compaction } = await opened({ conversations: { c1: past }, replies: [summarizing(sent)] });

    await compaction.judge("c1");

    expect(sent).toHaveLength(1);
    const [system, user, ...rest] = sent[0] ?? [];
    expect((system as SystemMessage | undefined)?.role).toBe("system");
    expect((system as SystemMessage).content).toBe(SUMMARY_SYSTEM_PROMPT);
    expect((system as SystemMessage).toolsAdded ?? []).toEqual([]);
    expect((user as UserMessage).content).toEqual([{ type: "text", text: summaryPrompt(past.messages.slice(0, 4)) }]);
    expect(rest).toEqual([]);
  });

  test("leaves a conversation alone whose last call is within the rule, and loads no loop where no last call counts", async () => {
    const within = await opened({ conversations: { c1: { ...past, usage: { ...past.usage, last: 20_000 } } } });
    await within.compaction.judge("c1");
    expect(ids(inState(within.core, "c1"))).toEqual(ids(past));
    expect(within.faux.state.callCount).toBe(0);
    expect(within.loads()).toBe(1);

    const spent = await opened({ conversations: { c1: { ...past, usage: { ...past.usage, last: 0 } } } });
    await spent.compaction.judge("c1");
    expect(spent.faux.state.callCount).toBe(0);
    expect(spent.loads()).toBe(0);
  });

  test("leaves a conversation alone until a reply follows its summary", async () => {
    const summary: Message = { ...message("s1", "summary", 100), created: "2026-11-16T09:00:00.000Z" };
    const { core, compaction, faux } = await opened({
      conversations: { c1: conversation(30_000, summary, message("u2", "user"), message("a2", "assistant"), message("u3", "user"), message("a3", "assistant")) },
    });

    await compaction.judge("c1");

    expect(ids(inState(core, "c1"))).toEqual(["s1", "u2", "a2", "u3", "a3"]);
    expect(faux.state.callCount).toBe(0);
  });

  test("judges a conversation again as the turn in it ends, and makes no call while the turn runs", async () => {
    const { core, compaction, played, faux } = await opened({ conversations: { c1: past }, runningIn: "c1" });

    await compaction.judge("c1");
    expect(faux.state.callCount).toBe(0);

    played.end();
    await compaction.judge("c1");

    expect(shape(inState(core, "c1"))).toEqual(["summary", "u3", "a3"]);
  });

  test("keeps after the summary the messages that entered the conversation while the model wrote it", async () => {
    const sent: Context["messages"][] = [];
    const held = gate();
    const { core, compaction, conversations } = await opened({ conversations: { c1: past }, replies: [summarizing(sent, held.opened)] });

    const done = compaction.judge("c1");
    await vi.waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(compaction.writing("c1")).toBe(true);
    await conversations.addMessage("c1", message("u4", "user", 10));
    held.open();
    await done;

    expect(shape(inState(core, "c1"))).toEqual(["summary", "u3", "a3", "u4"]);
    expect(compaction.writing("c1")).toBe(false);
  });

  test("summarizes every message where the last exchange alone holds more than a summary keeps, and keeps those that entered meanwhile", async () => {
    const sent: Context["messages"][] = [];
    const held = gate();
    const long = conversation(30_000, message("u1", "user"), message("a1", "assistant"), message("u2", "user"), message("a2", "assistant", 12_000));
    const { core, compaction, conversations } = await opened({ conversations: { c1: long }, replies: [summarizing(sent, held.opened)] });

    const done = compaction.judge("c1");
    await vi.waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    await conversations.addMessage("c1", message("u3", "user", 10));
    held.open();
    await done;

    expect(shape(inState(core, "c1"))).toEqual(["summary", "u3"]);
  });

  test("compacts a conversation whatever the rule says where the user asks", async () => {
    const { core, compaction } = await opened({ conversations: { c1: { ...past, usage: { ...past.usage, last: 0 } } } });

    await compaction.compact("c1");

    expect(shape(inState(core, "c1"))).toEqual(["summary", "u3", "a3"]);
  });

  test("raises the warning assistant_compaction_failed where the call fails, and withdraws it once a later compaction succeeds", async () => {
    const { core, compaction } = await opened({
      conversations: { c1: past },
      replies: [fauxAssistantMessage([], { stopReason: "error", errorMessage: "The provider is down." }), fauxAssistantMessage(SUMMARY)],
    });

    await compaction.judge("c1");

    expect(ids(inState(core, "c1"))).toEqual(ids(past));
    expect(warnings(core)).toEqual(['warning: The assistant could not summarize the earlier messages of the conversation "Sales": The provider is down.']);

    await compaction.compact("c1");

    expect(shape(inState(core, "c1"))).toEqual(["summary", "u3", "a3"]);
    expect(warnings(core)).toEqual([]);
  });

  test("raises the warning where the model's cap for a reply cuts the summary off, and keeps the call's tokens", async () => {
    const { core, compaction } = await opened({ conversations: { c1: past }, replies: [fauxAssistantMessage("The user", { stopReason: "length" })] });

    await compaction.judge("c1");

    expect(ids(inState(core, "c1"))).toEqual(ids(past));
    expect(inState(core, "c1")?.usage.input).toBeGreaterThan(past.usage.input);
    expect(warnings(core)).toEqual([
      'warning: The assistant could not summarize the earlier messages of the conversation "Sales": The summary reached the model\'s cap for a reply, so it was cut off.',
    ]);
  });

  test("withdraws a conversation's warning once the conversation goes", async () => {
    const { core, compaction } = await opened({
      conversations: { c1: past },
      replies: [fauxAssistantMessage([], { stopReason: "error", errorMessage: "The provider is down." })],
    });
    await compaction.judge("c1");
    expect(warnings(core)).toHaveLength(1);

    await core.commands.run("blockr.assistant-remove_conversation", { conversation: "c1" }, "assistant");

    expect(warnings(core)).toEqual([]);
  });

  test("drops a summary whose conversation goes meanwhile, and raises nothing", async () => {
    const sent: Context["messages"][] = [];
    const held = gate();
    const { core, compaction } = await opened({ conversations: { c1: past }, replies: [summarizing(sent, held.opened)] });

    const done = compaction.judge("c1");
    await vi.waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    await core.commands.run("blockr.assistant-remove_conversation", { conversation: "c1" }, "assistant");
    held.open();
    await done;

    expect(inState(core, "c1")).toBeUndefined();
    expect(warnings(core)).toEqual([]);
  });

  test("raises nothing where the deployment offers no model, since the models raised why", async () => {
    const { core, compaction, faux } = await opened({ conversations: { c1: past }, offered: { models: [], failure: "The list offers no model." } });

    await compaction.judge("c1");

    expect(faux.state.callCount).toBe(0);
    expect(warnings(core)).toEqual([]);
  });

  test("puts the summary in the memory alone under a cap of 0", async () => {
    const { core, compaction, conversations } = await opened({ conversations: { c1: past }, blockrOptions: { chat_save_turns: 0 } });

    await compaction.judge("c1");

    expect(shape(conversations.get("c1"))).toEqual(["summary", "u3", "a3"]);
    expect((core.store.board().plugins[ASSISTANT] as AssistantState).conversations).toEqual({});
  });

  test("writes nothing once the next board opens", async () => {
    const sent: Context["messages"][] = [];
    const held = gate();
    const { core, compaction, close } = await opened({ conversations: { c1: past }, replies: [summarizing(sent, held.opened)] });

    const done = compaction.judge("c1");
    await vi.waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    close();
    held.open();
    await done;

    expect(inState(core, "c1")).toEqual(past);
    expect(warnings(core)).toEqual([]);
  });
});
