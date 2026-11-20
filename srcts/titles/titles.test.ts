// The titles of the conversations (./titles.ts) on core's CoreApi for tests,
// with the conversations of the board, and the turns and the titles' calls on
// pi's fake provider: when the plugin asks for a title, what the call sends,
// the tokens that it counts, a rename that the user made meanwhile, and a
// title that fails.
// The tests make the conversations, the turns and the titles themselves, on
// the assistant's class without its start, which would open the board's own.

import type { CoreApi } from "@blockr/core";
import { HELLO, stubCore } from "@blockr/core/stubs";
import { fauxAssistantMessage } from "@earendil-works/pi-ai/providers/faux";
import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";
import { describe, expect, onTestFinished, test, vi } from "vitest";
import { createConversations } from "../conversations/index.ts";
import type { Deployment } from "../deployment/index.ts";
import { heldError } from "../notifications/index.ts";
// The module of the assistant's class, which core imports as the page does.
// eslint-disable-next-line no-restricted-imports
import * as assistant from "../modules/assistant_plugin/index.tsx";
import type { AssistantState, Conversation, Message, Part } from "../state/index.ts";
import { FAUX_API, fauxLoop, testCatalogs } from "../testing/index.ts";
import { createTurns } from "../turns/index.ts";
import { createVisitorKey } from "../visitor-key/index.ts";
import { buildExcerpt, normalizeTitle, TITLE_PROMPT, titleConversations } from "./titles.ts";

const ASSISTANT = "blockr.assistant-assistant_plugin";
const CREATED = "2026-11-16T08:00:00.000Z";

function message(id: string, role: Message["role"], ...parts: Part[]): Message {
  return { id, role, parts, created: CREATED };
}

function text(value: string): Part {
  return { type: "text", text: value };
}

function conversation(title: string, ...messages: Message[]): Conversation {
  return { title, updated: CREATED, messages, usage: { input: 0, output: 0, last: 0 }, model: null };
}

// What a call of the titles sent the model: its system prompt and the text of
// the user's message.
interface Sent {
  readonly prompt: string;
  readonly text: string;
}

// A reply of pi's fake provider to a call of the titles, which records what
// the call sent, and holds its answer until the test lets it go, where the
// test asks it to.
function titling(into: Sent[], title: string, held = false): { readonly reply: FauxResponseStep; readonly release: () => void } {
  let release = (): void => undefined;
  const released = held
    ? new Promise<void>((resolve) => {
        release = resolve;
      })
    : Promise.resolve();
  const reply: FauxResponseStep = async (context) => {
    const prompt = context.messages.flatMap((sent) => (sent.role === "system" && typeof sent.content === "string" ? [sent.content] : [])).join("\n");
    const user = context.messages.flatMap((sent) => (sent.role === "user" ? [sent.content] : []));
    into.push({ prompt, text: user.map((content) => (typeof content === "string" ? content : content.map((part) => (part.type === "text" ? part.text : "")).join(""))).join("\n") });
    await released;
    return fauxAssistantMessage(title);
  };
  return { reply, release };
}

// Core on a board with two conversations, and with the turns and the titles
// of that board on pi's fake provider, which gives the replies given in
// order. The conversation c1 is titled "New conversation" and holds the
// user's question, and c2 is titled "Sales". Core stops as the test
// finishes.
async function opened(replies: FauxResponseStep[]) {
  const state: AssistantState = {
    conversations: { c1: conversation("New conversation", message("u1", "user", text("How many blocks?"))), c2: conversation("Sales", message("u2", "user", text("And the sales?"))) },
  };
  const stubbed = await stubCore({
    hello: {
      ...HELLO,
      packages: { ...HELLO.packages, "blockr.assistant": "0.2.0" },
      plugins: { ...HELLO.plugins, [ASSISTANT]: { name: "Assistant", version: 1, module: "blockr.assistant/js/assistant_plugin.js" } },
      board: {
        ...HELLO.board,
        board: {
          ...HELLO.board.board,
          blocks: {},
          links: {},
          stacks: {},
          plugins: { ...HELLO.board.board.plugins, [ASSISTANT]: { state, version: 1 } },
        },
      },
    },
    modules: { [ASSISTANT]: { api: 1, default: { ...assistant.default, start: undefined } } },
  });
  const controller = new AbortController();
  onTestFinished(() => {
    controller.abort();
    stubbed.stop();
  });
  const conversations = createConversations(stubbed.core, controller.signal);
  await conversations.opened;
  const { faux, loop } = fauxLoop();
  faux.setResponses(replies);
  const deployment: Promise<Deployment> = Promise.resolve({ baseUrl: "https://faux.invalid/v1", api: FAUX_API, credential: { kind: "deployment", key: "test-key" }, models: undefined });
  const models = {
    offered: () => Promise.resolve({ models: ["faux-1"], named: true }),
    check: () => Promise.resolve({ kind: "failed" as const, message: "The list failed." }),
  };
  const key = createVisitorKey();
  const settings = { checked: () => Promise.resolve(new Map()) };
  const load = () => Promise.resolve(loop);
  const catalogs = testCatalogs;
  const turns = createTurns(stubbed.core, controller.signal, {
    conversations,
    tools: [],
    deployment,
    models,
    settings,
    callFailed: heldError(stubbed.core, controller.signal, "assistant_call_failed"),
    key,
    prompt: { system: () => Promise.resolve("You answer questions about a board."), appMessage: () => Promise.resolve("The board holds no block.") },
    compaction: { beforeCall: () => Promise.resolve(), compact: () => Promise.resolve(false) },
    notes: { take: () => Promise.resolve(undefined), changed: () => [] },
    catalogs,
    load,
    locks: undefined,
  });
  titleConversations(stubbed.core, controller.signal, { conversations, turns, deployment, models, settings, key, catalogs, load });
  return { ...stubbed, conversations, turns, faux };
}

function inState(core: CoreApi, id: string): Conversation | undefined {
  return (core.store.board().plugins[ASSISTANT] as AssistantState).conversations[id];
}

describe("the titles of the conversations", () => {
  test("title a conversation once its first turn that the model answered ends, from shinychat's prompt and the exchange", async () => {
    const sent: Sent[] = [];
    const titled = titling(sent, "  Counting   the blocks \n");
    const { core, turns } = await opened([fauxAssistantMessage("The board holds no block."), titled.reply]);

    await turns.run("c1");
    await vi.waitFor(() => {
      expect(inState(core, "c1")?.title).toBe("Counting the blocks");
    });

    expect(sent).toEqual([{ prompt: TITLE_PROMPT, text: "user: How many blocks?\n\nassistant: The board holds no block." }]);
  });

  test("add the tokens of the title's call to the conversation's usage, and leave its last as the turn's", async () => {
    const titled = titling([], "Counting the blocks", true);
    const { core, turns, faux } = await opened([fauxAssistantMessage("The board holds no block."), titled.reply]);

    await turns.run("c1");
    await vi.waitFor(() => {
      expect(faux.state.callCount).toBe(2);
    });
    const turn = inState(core, "c1")?.usage;
    titled.release();
    await vi.waitFor(() => {
      expect(inState(core, "c1")?.title).toBe("Counting the blocks");
    });

    const usage = inState(core, "c1")?.usage;
    expect(usage?.input).toBeGreaterThan(turn?.input ?? Infinity);
    expect(usage?.output).toBeGreaterThan(turn?.output ?? Infinity);
    expect(usage?.last).toBe(turn?.last);
  });

  test("leave a title that the user gave while the model wrote one", async () => {
    const titled = titling([], "Counting the blocks", true);
    const { core, turns, faux } = await opened([fauxAssistantMessage("The board holds no block."), titled.reply]);

    await turns.run("c1");
    await vi.waitFor(() => {
      expect(faux.state.callCount).toBe(2);
    });
    await core.commands.run("blockr.assistant-rename_conversation", { conversation: "c1", title: "My blocks" }, "user");
    const turn = inState(core, "c1")?.usage;
    titled.release();
    await vi.waitFor(() => {
      expect(inState(core, "c1")?.usage.output).toBeGreaterThan(turn?.output ?? Infinity);
    });

    expect(inState(core, "c1")?.title).toBe("My blocks");
  });

  test("ask for no title of a conversation that has one", async () => {
    const { core, turns, faux } = await opened([fauxAssistantMessage("The sales grew.")]);

    await turns.run("c2");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(faux.state.callCount).toBe(1);
    expect(inState(core, "c2")?.title).toBe("Sales");
  });

  test("title a conversation whose first turn failed before the model replied once a later turn that the model answers ends", async () => {
    const sent: Sent[] = [];
    const failed = fauxAssistantMessage("", { stopReason: "error", errorMessage: "The base URL refused the key." });
    const { core, turns, conversations } = await opened([failed, fauxAssistantMessage("Two blocks."), titling(sent, "Counting the blocks").reply]);

    await turns.run("c1");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sent).toEqual([]);

    await conversations.addMessage("c1", message("u3", "user", text("And now?")));
    await turns.run("c1");
    await vi.waitFor(() => {
      expect(inState(core, "c1")?.title).toBe("Counting the blocks");
    });
    expect(sent.map(({ text: excerpt }) => excerpt)).toEqual(["user: And now?\n\nassistant: Two blocks."]);
  });

  test("leave the title as it was where the call fails, raise no notification, and ask no more while the board stays open", async () => {
    const failed = fauxAssistantMessage("", { stopReason: "error", errorMessage: "The model is overloaded." });
    const { core, turns, faux, conversations, logged } = await opened([fauxAssistantMessage("The board holds no block."), failed, fauxAssistantMessage("Still none.")]);

    await turns.run("c1");
    await vi.waitFor(() => {
      expect(logged.some((line) => line.level === "warn" && line.message.includes("The model is overloaded."))).toBe(true);
    });
    await conversations.addMessage("c1", message("u3", "user", text("And now?")));
    await turns.run("c1");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(inState(core, "c1")?.title).toBe("New conversation");
    expect(faux.state.callCount).toBe(3);
    expect(core.notifications.get().filter((notification) => notification.source.kind === "module")).toEqual([]);
  });
});

describe("what a title's call sends", () => {
  test("is the message that the user sent, as typed, and the model's first reply that holds text, before the next message of the user's", () => {
    const messages = [
      message("n1", "user", { type: "changes", text: "The user added a block." }),
      message("u1", "user", text("/compare the sales"), { type: "skill", name: "compare", text: "How to compare." }),
      message("a1", "assistant", { type: "tool_call", id: "t1", tool: "list_blocks", args: {} }),
      message("r1", "tool", { type: "tool_result", id: "t1", text: "[]" }),
      message("a2", "assistant", text("The board holds no block.")),
      message("u2", "user", text("Thanks.")),
      message("a3", "assistant", text("You are welcome.")),
    ];

    expect(buildExcerpt(messages)).toBe("user: /compare the sales\n\nassistant: The board holds no block.");
  });

  test("cuts each message to 500 characters, and is nothing before the model replied", () => {
    const long = "x".repeat(600);
    const excerpt = buildExcerpt([message("u1", "user", text(long)), message("a1", "assistant", text(long))]);

    expect(excerpt).toBe(`user: ${"x".repeat(500)}\n\nassistant: ${"x".repeat(500)}`);
    expect(buildExcerpt([message("u1", "user", text("Hello."))])).toBeUndefined();
  });
});

describe("the title that the model wrote", () => {
  test("collapses its white space, cuts it to 80 characters, as shinychat does, and is nothing where the model wrote none", () => {
    expect(normalizeTitle("  Sales \n by   region ")).toBe("Sales by region");
    expect(normalizeTitle("y".repeat(100))).toBe(`${"y".repeat(77)}...`);
    expect(normalizeTitle(" \n ")).toBeUndefined();
  });
});
