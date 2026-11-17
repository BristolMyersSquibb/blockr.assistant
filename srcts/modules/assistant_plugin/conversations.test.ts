// The conversations, which ../../conversations defines, on core's CoreApi for
// tests: the cap that chat_save_turns sets, what the state keeps under it,
// what the plugin's memory keeps, and how the memory follows the state.
// The tests make the conversations themselves, on the assistant's class
// without its start, which would make the board's own.

import type { CoreApi, Json } from "@blockr/core";
import { HELLO, stubCore } from "@blockr/core/stubs";
import { describe, expect, onTestFinished, test } from "vitest";
import { createConversations, readCap } from "../../conversations/index.ts";
import type { AssistantState, Conversation, Message, Role } from "../../state/index.ts";
import * as assistant from "./index.tsx";

const ASSISTANT = "blockr.assistant-assistant_plugin";

function message(id: string, role: Role): Message {
  return { id, role, parts: [{ type: "text", text: id }], created: "2026-11-16T08:00:00.000Z" };
}

function conversation(...messages: Message[]): Conversation {
  return { title: "Sales", updated: "2026-11-16T07:00:00.000Z", messages, usage: { input: 0, output: 0, last: 0 }, model: null };
}

// The conversation c1 of three exchanges, of two messages each.
const three = conversation(
  message("u1", "user"),
  message("a1", "assistant"),
  message("u2", "user"),
  message("a2", "assistant"),
  message("u3", "user"),
  message("a3", "assistant"),
);

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

// Core on a board with the state given, where R holds chat_save_turns where
// the test gives it, and the conversations of that board, once they opened.
// Core stops as the test finishes.
async function opened(state: AssistantState, cap?: Json) {
  const stubbed = await stubCore({
    hello: helloWith(state),
    modules: { [ASSISTANT]: { api: 1, default: { ...assistant.default, start: undefined } } },
    ...(cap === undefined ? {} : { blockrOptions: { chat_save_turns: cap } }),
  });
  const controller = new AbortController();
  onTestFinished(() => {
    controller.abort();
    stubbed.stop();
  });
  const conversations = createConversations(stubbed.core, controller.signal);
  return { core: stubbed.core, conversations };
}

function stateIn(core: CoreApi): AssistantState {
  return core.store.board().plugins[ASSISTANT] as AssistantState;
}

const ids = (held: Conversation | undefined): string[] => held?.messages.map((m) => m.id) ?? [];

describe("the cap that chat_save_turns sets", () => {
  const read = (value: Json | undefined) => readCap({ blockrOption: () => Promise.resolve(value) });

  test("is 50 where nothing sets it, Infinity for -1, and the whole number given otherwise", async () => {
    await expect(read(undefined)).resolves.toBe(50);
    await expect(read(0)).resolves.toBe(0);
    await expect(read(20)).resolves.toBe(20);
    await expect(read(-1)).resolves.toBe(Infinity);
  });

  test("reads a string, as an environment variable gives, as the number that it holds", async () => {
    await expect(read("20")).resolves.toBe(20);
    await expect(read("-1")).resolves.toBe(Infinity);
  });

  test("takes no other value, Inf among them, which R sends as null", async () => {
    await expect(read(null)).rejects.toThrow(
      "The blockr option chat_save_turns is null, where it takes a whole number of 0 or more, or -1 for every message.",
    );
    for (const value of ["Inf", "", "a", 2.5, -2, true]) {
      await expect(read(value)).rejects.toThrow(/^The blockr option chat_save_turns is /);
    }
  });
});

describe("the conversations under a cap above 0", () => {
  test("cut every conversation to the cap as they open, and keep what the cap cut in the memory", async () => {
    const { core, conversations } = await opened({ conversations: { c1: three, c2: conversation(message("u1", "user")) } }, 4);
    await conversations.opened;

    expect(ids(stateIn(core).conversations.c1)).toEqual(["u2", "a2", "u3", "a3"]);
    expect(ids(conversations.get("c1"))).toEqual(["u1", "a1", "u2", "a2", "u3", "a3"]);
    expect(ids(conversations.all().c2)).toEqual(["u1"]);
  });

  test("keep 50 messages of each conversation unless chat_save_turns says otherwise", async () => {
    const { core, conversations } = await opened({ conversations: { c1: three } });
    await conversations.opened;

    expect(stateIn(core).conversations.c1).toEqual(three);
  });

  test("add a message through the command, and keep what the cap cut in the memory", async () => {
    const { core, conversations } = await opened({ conversations: { c1: three } }, 6);

    await conversations.addMessage("c1", message("u4", "user"));

    expect(ids(stateIn(core).conversations.c1)).toEqual(["u2", "a2", "u3", "a3", "u4"]);
    expect(ids(conversations.get("c1"))).toEqual(["u1", "a1", "u2", "a2", "u3", "a3", "u4"]);
    expect(core.store.canUndo()).toBe(false);
  });

  test("change a conversation through the commands of their names", async () => {
    const { core, conversations } = await opened({ conversations: {} }, 6);

    await conversations.addConversation("c1", "New conversation");
    await conversations.renameConversation("c1", "Regions");
    await conversations.setModel("c1", "gpt-5.4");
    await conversations.addUsage("c1", 100, 20, 130);

    expect(stateIn(core).conversations.c1).toMatchObject({
      title: "Regions",
      model: "gpt-5.4",
      usage: { input: 100, output: 20, last: 130 },
    });
    await expect(conversations.addConversation("c1", "Again")).rejects.toThrow(/fails its preflight/);
  });

  test("drop what the memory holds of a conversation that the state no longer holds, whoever removed it", async () => {
    const { core, conversations } = await opened({ conversations: { c1: three } }, 2);
    await conversations.opened;

    await core.commands.run("blockr.assistant-remove_conversation", { conversation: "c1" });
    await conversations.addConversation("c1", "New conversation");

    expect(ids(conversations.get("c1"))).toEqual([]);
  });

  test("compact a conversation in the state while it holds the message after the summary's last, and drop the memory's messages", async () => {
    const { core, conversations } = await opened({ conversations: { c1: three } }, 4);
    await conversations.opened;

    await conversations.compactConversation("c1", message("s1", "summary"), "a2");

    expect(ids(stateIn(core).conversations.c1)).toEqual(["s1", "u3", "a3"]);
    expect(ids(conversations.get("c1"))).toEqual(["s1", "u3", "a3"]);
  });

  test("compact every message of a conversation where the summary covers its last message", async () => {
    const { core, conversations } = await opened({ conversations: { c1: three } }, 4);
    await conversations.opened;

    await conversations.compactConversation("c1", message("s1", "summary"), "a3");

    expect(ids(stateIn(core).conversations.c1)).toEqual(["s1"]);
    expect(ids(conversations.get("c1"))).toEqual(["s1"]);
  });

  test("keep after the summary the messages that entered the conversation after its last", async () => {
    const { core, conversations } = await opened({ conversations: { c1: three } }, 50);
    await conversations.opened;

    await conversations.addMessage("c1", message("u4", "user"));
    await conversations.compactConversation("c1", message("s1", "summary"), "a3");

    expect(ids(stateIn(core).conversations.c1)).toEqual(["s1", "u4"]);
  });

  test("compact a conversation in the memory where the cap cut it past the message after the summary's last, and leave the state as it is", async () => {
    const { core, conversations } = await opened({ conversations: { c1: three } }, 2);
    await conversations.opened;

    await conversations.compactConversation("c1", message("s1", "summary"), "u1");

    expect(ids(stateIn(core).conversations.c1)).toEqual(["u3", "a3"]);
    expect(ids(conversations.get("c1"))).toEqual(["s1", "a1", "u2", "a2", "u3", "a3"]);
    await expect(conversations.compactConversation("c1", message("s2", "summary"), "u1")).rejects.toThrow(/holds no message "u1"/);
  });
});

describe("the conversations under -1", () => {
  test("cut no conversation, and add every message to the state", async () => {
    const { core, conversations } = await opened({ conversations: { c1: three } }, -1);
    await conversations.opened;

    await conversations.addMessage("c1", message("u4", "user"));

    expect(ids(stateIn(core).conversations.c1)).toEqual(["u1", "a1", "u2", "a2", "u3", "a3", "u4"]);
  });
});

describe("the conversations under a cap of 0", () => {
  test("move every conversation into the memory as they open, so that the state holds none", async () => {
    const { core, conversations } = await opened({ conversations: { c1: three } }, 0);
    await conversations.opened;

    expect(stateIn(core)).toEqual({ conversations: {} });
    expect(conversations.get("c1")).toEqual(three);
    expect(core.store.canUndo()).toBe(false);
  });

  test("change the memory alone, with the checks of the commands", async () => {
    const { core, conversations } = await opened({ conversations: { c1: three } }, 0);

    await conversations.addConversation("c2", "New conversation", "gpt-5.4");
    await conversations.addMessage("c2", message("u1", "user"));
    await conversations.renameConversation("c2", "Plots");
    await conversations.addUsage("c2", 100, 20, 130);
    await conversations.compactConversation("c1", message("s1", "summary"), "a2");
    expect(ids(conversations.get("c1"))).toEqual(["s1", "u3", "a3"]);
    await conversations.compactConversation("c1", message("s2", "summary"), "a3");
    expect(ids(conversations.get("c1"))).toEqual(["s2"]);
    await conversations.removeConversation("c1");

    expect(stateIn(core)).toEqual({ conversations: {} });
    expect(Object.keys(conversations.all())).toEqual(["c2"]);
    expect(conversations.get("c2")).toMatchObject({
      title: "Plots",
      model: "gpt-5.4",
      usage: { input: 100, output: 20, last: 130 },
      updated: "2026-11-16T08:00:00.000Z",
    });
    expect(ids(conversations.get("c2"))).toEqual(["u1"]);
    await expect(conversations.addConversation("c2", "Again")).rejects.toThrow(/holds a conversation "c2" already/);
    await expect(conversations.addMessage("c2", message("u1", "user"))).rejects.toThrow(/holds a message "u1" already/);
    await expect(conversations.setModel("c9", null)).rejects.toThrow(/holds no conversation "c9"/);
  });
});

describe("the conversations under a value of chat_save_turns that the cap does not take", () => {
  test("fail to open, and so does each change, leaving the state as it is", async () => {
    const { core, conversations } = await opened({ conversations: { c1: three } }, "Inf");

    await expect(conversations.opened).rejects.toThrow(/chat_save_turns is "Inf"/);
    await expect(conversations.addMessage("c1", message("u4", "user"))).rejects.toThrow(/chat_save_turns is "Inf"/);
    expect(stateIn(core).conversations.c1).toEqual(three);
  });
});

describe("what the memory keeps of a message", () => {
  const reasoning = { reasoning: ["Count the blocks."], reply: { role: "assistant" } };

  test("comes with a message that addMessage() adds, and grows through keep()", async () => {
    const { conversations } = await opened({ conversations: { c1: conversation(message("u1", "user")) } });

    await conversations.addMessage("c1", message("a1", "assistant"), reasoning);
    conversations.keep("c1", "a1", { failure: "The call failed." });

    expect(conversations.kept("c1", "a1")).toEqual({ ...reasoning, failure: "The call failed." });
    expect(conversations.kept("c1", "u1")).toBeUndefined();
    expect(() => {
      conversations.keep("c1", "a9", { failure: "No such message." });
    }).toThrow(/holds no message "a9"/);
  });

  test("stays with the messages that the cap cuts from the state into the memory", async () => {
    const { conversations } = await opened({ conversations: { c1: three } }, 4);

    await conversations.addMessage("c1", message("u4", "user"), { failure: "Kept." });
    await conversations.addMessage("c1", message("a4", "assistant"));
    await conversations.addMessage("c1", message("u5", "user"));

    expect(conversations.kept("c1", "u4")).toEqual({ failure: "Kept." });
  });

  test("goes with a conversation that the state no longer holds, whoever removed it", async () => {
    const { core, conversations } = await opened({ conversations: { c1: conversation(message("u1", "user")) } });
    await conversations.addMessage("c1", message("a1", "assistant"), reasoning);

    await core.commands.run("blockr.assistant-remove_conversation", { conversation: "c1" }, "assistant");
    await core.commands.run("blockr.assistant-add_conversation", { id: "c1", title: "Again" }, "assistant");
    await conversations.addMessage("c1", message("a1", "assistant"));

    expect(conversations.kept("c1", "a1")).toBeUndefined();
  });

  test("goes with the messages that a summary replaces", async () => {
    const { conversations } = await opened({ conversations: { c1: conversation(message("u1", "user")) } });
    await conversations.addMessage("c1", message("a1", "assistant"), reasoning);
    await conversations.addMessage("c1", message("u2", "user"), { failure: "Kept." });

    await conversations.compactConversation("c1", message("s1", "summary"), "a1");

    expect(conversations.kept("c1", "a1")).toBeUndefined();
    expect(conversations.kept("c1", "u2")).toEqual({ failure: "Kept." });
  });

  test("goes with a conversation that the memory removes under a cap of 0", async () => {
    const { conversations } = await opened({ conversations: { c1: conversation(message("u1", "user")) } }, 0);
    await conversations.addMessage("c1", message("a1", "assistant"), reasoning);
    expect(conversations.kept("c1", "a1")).toEqual(reasoning);

    await conversations.removeConversation("c1");

    expect(conversations.kept("c1", "a1")).toBeUndefined();
  });
});

describe("whoever follows the conversations", () => {
  test("hears each change of the state and of the memory, until it stops following", async () => {
    const { conversations } = await opened({ conversations: { c1: conversation(message("u1", "user")) } });
    let heard = 0;
    const stop = conversations.subscribe(() => {
      heard += 1;
    });

    await conversations.addMessage("c1", message("a1", "assistant"));
    const afterMessage = heard;
    conversations.keep("c1", "a1", { failure: "The call failed." });
    const afterKeep = heard;
    stop();
    await conversations.addMessage("c1", message("u2", "user"));

    expect(afterMessage).toBeGreaterThan(0);
    expect(afterKeep).toBeGreaterThan(afterMessage);
    expect(heard).toBe(afterKeep);
  });

  test("hears each change of the memory alone where chat_save_turns is 0", async () => {
    const { conversations } = await opened({ conversations: {} }, 0);
    await conversations.opened;
    let heard = 0;
    conversations.subscribe(() => {
      heard += 1;
    });

    await conversations.addConversation("c1", "Sales");
    await conversations.addMessage("c1", message("u1", "user"));

    expect(heard).toBe(2);
    expect(ids(conversations.all().c1)).toEqual(["u1"]);
  });

  test("gets the same object from all() until something of it changes, and the same conversation while that conversation stays as it was", async () => {
    const { core, conversations } = await opened({ conversations: { c1: three, c2: conversation(message("u9", "user")) } }, 4);
    await conversations.opened;
    const before = conversations.all();

    expect(conversations.all()).toBe(before);
    await core.commands.run("blockr.core-add_stack", { name: "Unrelated" }, "user");
    expect(conversations.all()).toBe(before);

    await conversations.addMessage("c1", message("u4", "user"));
    const after = conversations.all();
    expect(after).not.toBe(before);
    expect(after.c2).toBe(before.c2);
    expect(ids(after.c1)).toEqual(["u1", "a1", "u2", "a2", "u3", "a3", "u4"]);
    expect(conversations.all().c1).toBe(after.c1);
  });

  test("reads a message that addMessage() adds with what the memory keeps of it, as soon as the message shows", async () => {
    const { conversations } = await opened({ conversations: { c1: conversation(message("u1", "user")) } });
    await conversations.opened;
    const seen: unknown[] = [];
    conversations.subscribe(() => {
      if (conversations.all().c1?.messages.some((m) => m.id === "a1") === true) seen.push(conversations.kept("c1", "a1"));
    });

    await conversations.addMessage("c1", message("a1", "assistant"), { reasoning: ["Count."] });

    expect(seen[0]).toEqual({ reasoning: ["Count."] });
  });
});
