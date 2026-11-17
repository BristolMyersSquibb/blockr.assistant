// The turns (./turns.ts) on core's CoreApi for tests, with the conversations
// of the board and the loop on pi's fake provider: a turn's messages and
// tokens in the state, the model that it talks to and its settings, one turn
// at a time, the tab's Web Lock, the reply as it streams, a stop, the error of
// a failed call, the next board, and a conversation that another plugin
// removes.
// The tests make the conversations and the turns themselves, on the
// assistant's class without its start, which would open the board's own.

import type { CoreApi, Json } from "@blockr/core";
import { HELLO, stubCore } from "@blockr/core/stubs";
import type { Api, Model } from "@earendil-works/pi-ai";
import { fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";
import { describe, expect, onTestFinished, test } from "vitest";
import { createConversations } from "../conversations/index.ts";
import type { Deployment } from "../deployment/index.ts";
import type { Loop } from "../loop/index.ts";
import type { ModelSettingsFile } from "../model-settings/index.ts";
import type { Offered } from "../models/index.ts";
import { heldError } from "../notifications/index.ts";
// The module of the assistant's class, which core imports as the page does.
// eslint-disable-next-line no-restricted-imports
import * as assistant from "../modules/assistant_plugin/index.tsx";
import type { AssistantState, Conversation, Message } from "../state/index.ts";
import { FAUX_API, fauxLoop } from "../testing/index.ts";
import type { Tool } from "../tools/index.ts";
import { createTurns } from "./turns.ts";
import type { Locks } from "./lock.ts";

const ASSISTANT = "blockr.assistant-assistant_plugin";
const CREATED = "2026-11-16T08:00:00.000Z";

function asked(id: string, text = "How many blocks?"): Message {
  return { id, role: "user", parts: [{ type: "text", text }], created: CREATED };
}

function conversation(model: string | null, ...messages: Message[]): Conversation {
  return { title: "Blocks", updated: CREATED, messages, usage: { input: 0, output: 0, last: 0 }, model };
}

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

// Web Locks that grant each lock at once, and record each lock that a turn
// asked for and each that it released.
function fakeLocks() {
  const asked: string[] = [];
  let released = 0;
  const locks: Locks = {
    request: ((name: string, callback: (lock: Lock | null) => Promise<unknown>) => {
      asked.push(name);
      return callback({ name, mode: "exclusive" }).then((value) => {
        released += 1;
        return value;
      });
    }) as Locks["request"],
  };
  return { locks, asked, released: () => released };
}

interface OpenOptions {
  readonly replies?: FauxResponseStep[];
  // What the deployment chose, which calls pi's fake provider with the key
  // test-key unless given.
  readonly deployment?: Promise<Deployment>;
  // The models offered, faux-1 alone unless given.
  readonly offered?: Offered;
  // The deployment's model settings, which give no model any unless given.
  readonly settings?: Pick<ModelSettingsFile, "checked">;
  readonly tools?: readonly Tool[];
  readonly load?: () => Promise<Loop>;
  readonly tokensPerSecond?: number;
  readonly blockrOptions?: Readonly<Record<string, Json>>;
}

// Core on a board whose conversations c1 and c2 hold a message that the user
// sent, c1 with the conversation's pick of the model, faux-1, and c2 with
// none, and the turns of that board on pi's fake provider, with the replies
// given. Core stops as the test finishes.
async function opened(options: OpenOptions = {}) {
  const state: AssistantState = {
    conversations: { c1: conversation("faux-1", asked("u1")), c2: conversation(null, asked("u2")) },
  };
  const stubbed = await stubCore({
    hello: helloWith(state),
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
  const { faux, loop } = fauxLoop(options.tokensPerSecond === undefined ? {} : { tokensPerSecond: options.tokensPerSecond });
  faux.setResponses(options.replies ?? [fauxAssistantMessage("The board holds no block.")]);
  const locks = fakeLocks();
  const deployment = options.deployment ?? Promise.resolve(deployed());
  deployment.catch(() => undefined);
  const turns = createTurns(stubbed.core, controller.signal, {
    conversations,
    tools: options.tools ?? [],
    deployment,
    models: { offered: () => Promise.resolve(options.offered ?? { models: ["faux-1"] }) },
    settings: options.settings ?? { checked: () => Promise.resolve(new Map()) },
    callFailed: heldError(stubbed.core, controller.signal, "assistant_call_failed"),
    load: options.load ?? (() => Promise.resolve(loop)),
    locks: locks.locks,
  });
  const close = (): void => {
    controller.abort();
  };
  return { ...stubbed, conversations, turns, faux, locks, close };
}

// A deployment whose calls go to pi's fake provider, with the credential
// given, the key test-key unless given.
function deployed(credential: Deployment["credential"] = { kind: "deployment", key: "test-key" }): Deployment {
  return { baseUrl: "https://faux.invalid/v1", api: FAUX_API, credential, models: undefined };
}

// A reply of pi's fake provider that records the model and the key of each
// call that it answers.
function recording(into: { model: string; key: string | undefined }[], text = "Hello."): FauxResponseStep {
  return (_context, options, _state, model) => {
    into.push({ model: model.id, key: options?.apiKey });
    return fauxAssistantMessage(text);
  };
}

// A reply of pi's fake provider that records the model of each call that it
// answers, with its settings.
function modelOfCall(into: Model<Api>[]): FauxResponseStep {
  return (_context, _options, _state, model) => {
    into.push(model);
    return fauxAssistantMessage("Hello.");
  };
}

function inState(core: CoreApi, id: string): Conversation | undefined {
  return (core.store.board().plugins[ASSISTANT] as AssistantState).conversations[id];
}

function raised(core: CoreApi): string[] {
  return core.notifications
    .get()
    .filter((notification) => notification.source.kind === "module" && notification.source.code === "assistant_call_failed")
    .map((notification) => notification.message);
}

describe("a turn of the assistant", () => {
  test("enters its reply in the state through blockr.assistant-add_message, and its tokens through blockr.assistant-add_usage", async () => {
    const { core, turns } = await opened();

    await turns.run("c1");

    const held = inState(core, "c1");
    expect(held?.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(held?.messages[1]?.parts).toEqual([{ type: "text", text: "The board holds no block." }]);
    expect(held?.usage.output).toBeGreaterThan(0);
    expect(held?.usage.last).toBeGreaterThanOrEqual((held?.usage.input ?? 0) + (held?.usage.output ?? 0));
    expect(turns.current()).toBeUndefined();
  });

  test("runs on the default model where the conversation picked none", async () => {
    const seen: { model: string; key: string | undefined }[] = [];
    const { core, turns } = await opened({ offered: { models: ["faux-default", "faux-1"] }, replies: [recording(seen)] });

    await turns.run("c2");

    expect(seen.map(({ model }) => model)).toEqual(["faux-default"]);
    expect(inState(core, "c2")?.messages).toHaveLength(2);
  });

  test("runs on the conversation's pick where the deployment offers it", async () => {
    const seen: { model: string; key: string | undefined }[] = [];
    const { turns } = await opened({ offered: { models: ["faux-default", "faux-1"] }, replies: [recording(seen)] });

    await turns.run("c1");

    expect(seen.map(({ model }) => model)).toEqual(["faux-1"]);
  });

  test("runs on the default where the deployment does not offer the conversation's pick, which stays in the state", async () => {
    const seen: { model: string; key: string | undefined }[] = [];
    const { core, turns } = await opened({ offered: { models: ["faux-default"] }, replies: [recording(seen)] });

    await turns.run("c1");

    expect(seen.map(({ model }) => model)).toEqual(["faux-default"]);
    expect(inState(core, "c1")?.model).toBe("faux-1");
  });

  test("hands the loop the settings that the deployment's model settings give its model, and those that the base URL's list gives it", async () => {
    const models: Model<Api>[] = [];
    const { turns } = await opened({
      offered: { models: ["faux-1", "faux-2"], settings: new Map([["faux-1", { contextWindow: 400_000, images: false }]]) },
      settings: {
        checked: () =>
          Promise.resolve(
            new Map([
              ["faux-1", { reasoning: true, maxTokens: 32_000 }],
              ["faux-2", { maxTokens: 8_000 }],
            ]),
          ),
      },
      replies: [modelOfCall(models)],
    });

    await turns.run("c1");

    expect(models[0]).toMatchObject({ id: "faux-1", reasoning: true, input: ["text"], contextWindow: 400_000, maxTokens: 32_000 });
  });

  test("has the model settings check each like against pi's catalogs, which the loop holds, once the loop has loaded", async () => {
    const asked: boolean[] = [];
    const { turns } = await opened({
      settings: {
        checked: (inCatalog) => {
          asked.push(inCatalog("claude-sonnet-5-5"), inCatalog("company-claude"));
          return Promise.resolve(new Map());
        },
      },
    });

    await turns.run("c1");

    expect(asked).toEqual([true, false]);
  });

  test("calls with the deployment's key, and hands pi no key of the deployment's where the key is none", async () => {
    const keyed: { model: string; key: string | undefined }[] = [];
    const first = await opened({ replies: [recording(keyed)] });
    await first.turns.run("c1");

    const keyless: { model: string; key: string | undefined }[] = [];
    const second = await opened({ deployment: Promise.resolve(deployed({ kind: "none" })), replies: [recording(keyless)] });
    await second.turns.run("c1");

    expect(keyed.map(({ key }) => key)).toEqual(["test-key"]);
    expect(keyless).toHaveLength(1);
    expect(keyless[0]?.key).not.toBe("test-key");
    expect(raised(second.core)).toEqual([]);
  });

  test("enters the results of its tool calls as one message of the role tool", async () => {
    const listed: Tool = {
      name: "list_blocks",
      description: "List the blocks.",
      parameters: { type: "object", properties: {} },
      executionMode: "parallel",
      execute: () => Promise.resolve({ text: "[]", isError: false, images: [] }),
    };
    const { core, turns } = await opened({
      tools: [listed],
      replies: [fauxAssistantMessage([fauxToolCall("list_blocks", {}, { id: "c-1" })], { stopReason: "toolUse" }), fauxAssistantMessage("No blocks.")],
    });

    await turns.run("c1");

    const held = inState(core, "c1");
    expect(held?.messages.map((m) => m.role)).toEqual(["user", "assistant", "tool", "assistant"]);
    expect(held?.messages[2]?.parts).toEqual([{ type: "tool_result", id: "c-1", text: "[]" }]);
  });

  test("runs one at a time on the board, in whichever conversation", async () => {
    const { core, turns } = await opened({ tokensPerSecond: 400, replies: [fauxAssistantMessage("The board holds no block."), fauxAssistantMessage("Hello.")] });

    const first = turns.run("c1");
    await expect(turns.run("c2")).rejects.toThrow('A turn of the assistant runs already on the board, in the conversation "c1".');
    await first;
    await turns.run("c2");

    expect(inState(core, "c2")?.messages).toHaveLength(2);
  });

  test("holds the tab's Web Lock while it runs, and releases it as it ends", async () => {
    const { turns, locks } = await opened();
    let heldWhileRunning = false;
    turns.subscribe(() => {
      if (turns.current() !== undefined && locks.asked.length === 1 && locks.released() === 0) heldWhileRunning = true;
    });

    await turns.run("c1");

    expect(heldWhileRunning).toBe(true);
    expect(locks.asked).toHaveLength(1);
    expect(locks.asked[0]).toMatch(/^blockr\.assistant-turn-[0-9a-f]{32}$/);
    expect(locks.released()).toBe(1);
  });

  test("gives the reply as it streams through current(), the same object until the turn changes", async () => {
    const { turns } = await opened({ tokensPerSecond: 400 });
    const streamed: string[] = [];
    turns.subscribe(() => {
      const running = turns.current();
      expect(turns.current()).toBe(running);
      const part = running?.reply?.parts[0];
      if (part?.type === "text") streamed.push(part.text);
    });

    await turns.run("c1");

    expect(streamed.length).toBeGreaterThan(1);
    expect(streamed.at(-1)).toBe("The board holds no block.");
    expect(turns.current()).toBeUndefined();
  });
});

describe("a turn that stops", () => {
  test("enters what the reply streamed until stop() as its message, and shows that it stops", async () => {
    const { core, turns } = await opened({ tokensPerSecond: 400 });
    const stopping: boolean[] = [];
    turns.subscribe(() => {
      const running = turns.current();
      if (running === undefined) return;
      stopping.push(running.stopping);
      if (!running.stopping && (running.reply?.parts.length ?? 0) > 0) turns.stop();
    });

    await turns.run("c1");

    const reply = inState(core, "c1")?.messages[1];
    const said = reply?.parts[0]?.type === "text" ? reply.parts[0].text : "";
    expect(said.length).toBeGreaterThan(0);
    expect(said.length).toBeLessThan("The board holds no block.".length);
    expect(stopping).toContain(true);
    expect(raised(core)).toEqual([]);
  });

  test("adds no message for a reply that streamed nothing", async () => {
    let stop = (): void => undefined;
    const { core, turns } = await opened({
      replies: [
        () => {
          stop();
          return fauxAssistantMessage("Never streamed.");
        },
      ],
    });
    stop = () => {
      turns.stop();
    };

    await turns.run("c1");

    expect(inState(core, "c1")?.messages.map((m) => m.id)).toEqual(["u1"]);
  });

  test("writes nothing more once the next board opens", async () => {
    const { core, turns, close } = await opened({ tokensPerSecond: 400 });
    turns.subscribe(() => {
      if ((turns.current()?.reply?.parts.length ?? 0) > 0) close();
    });

    await turns.run("c1");

    expect(inState(core, "c1")?.messages.map((m) => m.id)).toEqual(["u1"]);
    expect(raised(core)).toEqual([]);
    await expect(turns.run("c1")).rejects.toThrow("The board that the assistant's turns ran on is closed.");
  });

  test("stops at its next message where another plugin removes its conversation", async () => {
    const { core, turns, logged } = await opened({ tokensPerSecond: 400 });
    let removed = false;
    turns.subscribe(() => {
      if (!removed && (turns.current()?.reply?.parts.length ?? 0) > 0) {
        removed = true;
        void core.commands.run("blockr.assistant-remove_conversation", { conversation: "c1" }, "assistant");
      }
    });

    await turns.run("c1");

    expect(inState(core, "c1")).toBeUndefined();
    expect(logged.some((line) => line.level === "warn" && line.message.includes("its conversation took no more messages"))).toBe(true);
    expect(raised(core)).toEqual([]);
  });
});

describe("a turn that fails", () => {
  test("raises the error assistant_call_failed for a failed call, and keeps why by the conversation's last message", async () => {
    const { core, turns, conversations } = await opened({
      replies: [fauxAssistantMessage([fauxText("I will look.")], { stopReason: "error", errorMessage: "401 Unauthorized" })],
    });

    await turns.run("c1");

    expect(raised(core)).toEqual(["The assistant's call to the model failed: 401 Unauthorized"]);
    const held = conversations.get("c1");
    expect(held?.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(conversations.kept("c1", held?.messages[1]?.id ?? "")?.failure).toBe("The assistant's call to the model failed: 401 Unauthorized");
  });

  test("withdraws the error once a later call succeeds", async () => {
    const { core, turns, conversations } = await opened({
      replies: [fauxAssistantMessage("", { stopReason: "error", errorMessage: "401 Unauthorized" }), fauxAssistantMessage("Hello.")],
    });

    await turns.run("c1");
    expect(raised(core)).toHaveLength(1);
    expect(conversations.kept("c1", "u1")?.failure).toBe("The assistant's call to the model failed: 401 Unauthorized");

    await conversations.addMessage("c1", asked("u3", "Try again."));
    await turns.run("c1");

    expect(raised(core)).toEqual([]);
  });

  test("keeps why the deployment offers no model by the conversation's last message, and raises nothing of its own", async () => {
    const why = "The assistant offers no model, since the list of models at https://proxy.invalid/v1/models holds none that takes tools.";
    const { core, turns, conversations } = await opened({ offered: { models: [], failure: why } });

    await turns.run("c2");

    expect(raised(core)).toEqual([]);
    expect(conversations.kept("c2", "u2")?.failure).toBe(why);
    expect(inState(core, "c2")?.messages.map((m) => m.id)).toEqual(["u2"]);
  });

  test("raises the error assistant_call_failed where the deployment sets no key", async () => {
    const { core, turns, conversations } = await opened({ deployment: Promise.resolve(deployed({ kind: "visitor" })) });

    await turns.run("c1");

    const why = "The assistant has no key for its calls, since the app sets none in the blockr option assistant_api_key.";
    expect(raised(core)).toEqual([why]);
    expect(conversations.kept("c1", "u1")?.failure).toBe(why);
  });

  test("raises the error assistant_call_failed where a blockr option of the deployment holds a value that it does not take", async () => {
    const wrong = new TypeError('The blockr option assistant_api is "openai", where it takes the API that the base URL speaks.');
    const deployment = Promise.reject(wrong);
    // The turns read the deployment only as a turn starts.
    deployment.catch(() => undefined);
    const { core, turns } = await opened({ deployment });

    await turns.run("c1");

    expect(raised(core)).toEqual(['The assistant cannot call a model: The blockr option assistant_api is "openai", where it takes the API that the base URL speaks.']);
  });

  test("raises the error assistant_call_failed where the loop's code fails to load", async () => {
    const { core, turns } = await opened({ load: () => Promise.reject(new Error("Failed to fetch dynamically imported module")) });

    await turns.run("c1");

    expect(raised(core)).toEqual(["The assistant could not load the code that runs its turns: Failed to fetch dynamically imported module"]);
  });
});
