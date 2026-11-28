// The assistant's commands, which ../../commands defines, run through
// blockr.core's command registry and store on core's CoreApi for tests, as the
// plugin's conversations and the assistant's tools run them.

import type { CommandId, CoreApi } from "@blockr/core";
import { HELLO, id, stubCore } from "@blockr/core/stubs";
import { describe, expect, onTestFinished, test } from "vitest";
import type { AssistantState, Conversation, Message, Role } from "../../state/index.ts";
import { HELLO_ASSISTANT } from "../../testing/index.ts";
import * as assistant from "./index.tsx";

// The id under which core registers the assistant's command of the id given,
// in the package of the assistant's plugin class.
function command(name: string): CommandId {
  return id("blockr.assistant", name);
}

function message(id: string, role: Role, created = "2026-11-16T08:00:00.000Z"): Message {
  return { id, role, parts: [{ type: "text", text: id }], created };
}

function conversation(messages: Message[] = [], title = "Sales"): Conversation {
  return { title, updated: "2026-11-16T07:00:00.000Z", messages, usage: { input: 10, output: 2, last: 12 }, model: null };
}

// R's reply to hello in an app that runs the assistant beside core's plugins,
// on a board that holds no block and holds the assistant's state given, under
// the board lock where `locked` says so.
function helloWith(state: AssistantState, locked = false): typeof HELLO {
  return {
    ...HELLO_ASSISTANT,
    lock: { board: locked, load: false },
    board: {
      ...HELLO_ASSISTANT.board,
      board: {
        ...HELLO_ASSISTANT.board.board,
        blocks: {},
        links: {},
        stacks: {},
        plugins: { ...HELLO_ASSISTANT.board.board.plugins, "blockr.assistant": { assistant_plugin: { state, version: 1 } } },
      },
    },
  };
}

// Core on a board with the conversation c1 of two messages, under the board
// lock where `locked` says so. Core stops as the test finishes.
async function started(state: AssistantState = { conversations: { c1: conversation([message("u1", "user"), message("a1", "assistant")]) } }, locked = false) {
  const stubbed = await stubCore({ hello: helloWith(state, locked), offered: { "blockr.assistant": { assistant_plugin: assistant } } });
  onTestFinished(stubbed.stop);
  return stubbed.core;
}

function stateIn(core: CoreApi): AssistantState {
  return core.store.board().plugins["blockr.assistant"]?.assistant_plugin as AssistantState;
}

function heldIn(core: CoreApi, id: string): Conversation | undefined {
  return stateIn(core).conversations[id];
}

const ids = (held: Conversation | undefined): string[] => held?.messages.map((m) => m.id) ?? [];

describe("the assistant's commands", () => {
  test("are registered with the class, and the board holds the state's default where it holds none", async () => {
    const stubbed = await stubCore({ hello: helloWith({ conversations: {} }), offered: { "blockr.assistant": { assistant_plugin: assistant } } });
    onTestFinished(stubbed.stop);

    expect([...stubbed.core.commands.registered().keys()].filter(({ package: pkg }) => pkg === "blockr.assistant")).toEqual([
      command("add_conversation"),
      command("rename_conversation"),
      command("remove_conversation"),
      command("add_message"),
      command("trim_conversations"),
      command("compact_conversation"),
      command("add_usage"),
      command("set_model"),
      command("set_thinking_level"),
    ]);

    const fresh = await stubCore({
      hello: { ...helloWith({ conversations: {} }), board: HELLO.board },
      offered: { "blockr.assistant": { assistant_plugin: assistant } },
    });
    onTestFinished(fresh.stop);
    expect(stateIn(fresh.core)).toEqual({ conversations: {} });
  });

  test("add_conversation adds a conversation with no message, and fails its preflight for an id that one has", async () => {
    const core = await started();

    await core.commands.run(command("add_conversation"), { id: "c2", title: "New conversation" });
    await core.commands.run(command("add_conversation"), { id: "c3", title: "Plots", model: "gpt-5.4" });
    await core.commands.run(command("add_conversation"), { id: "c4", title: "Joins", model: null, thinking_level: "high" });
    await core.commands.run(command("add_conversation"), { id: "c5", title: "Maps", thinking_level: null });

    expect(heldIn(core, "c2")).toEqual({
      title: "New conversation",
      updated: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/) as unknown,
      messages: [],
      usage: { input: 0, output: 0, last: 0 },
      model: null,
    });
    expect(heldIn(core, "c3")?.model).toBe("gpt-5.4");
    expect(heldIn(core, "c4")).toMatchObject({ model: null, thinking_level: "high" });
    expect(heldIn(core, "c5")).not.toHaveProperty("thinking_level");
    expect(core.commands.preflight(command("add_conversation"), { id: "c6", title: "Odd", thinking_level: "extreme" })).toBe(false);
    expect(core.commands.preflight(command("add_conversation"), { id: "c1", title: "Again" })).toBe(false);
    await expect(core.commands.run(command("add_conversation"), { id: "c1", title: "Again" })).rejects.toMatchObject({ by: "preflight" });
  });

  test("rename_conversation, set_model and add_usage change the conversation that they name", async () => {
    const core = await started();

    await core.commands.run(command("rename_conversation"), { conversation: "c1", title: "Regions" });
    await core.commands.run(command("set_model"), { conversation: "c1", model: "claude-opus-5-5" });
    await core.commands.run(command("add_usage"), { conversation: "c1", input: 100, output: 20, total: 130 });

    expect(heldIn(core, "c1")).toMatchObject({ title: "Regions", model: "claude-opus-5-5", usage: { input: 110, output: 22, last: 130 } });

    await core.commands.run(command("set_model"), { conversation: "c1", model: null });
    expect(heldIn(core, "c1")?.model).toBeNull();
  });

  test("set_thinking_level sets the conversation's pick of the level, or removes it with null, with no undo step", async () => {
    const core = await started();

    await core.commands.run(command("set_thinking_level"), { conversation: "c1", thinking_level: "high" });
    expect(heldIn(core, "c1")?.thinking_level).toBe("high");
    await core.commands.run(command("set_thinking_level"), { conversation: "c1", thinking_level: "low" });
    expect(heldIn(core, "c1")?.thinking_level).toBe("low");
    expect(core.store.canUndo()).toBe(false);

    await core.commands.run(command("set_thinking_level"), { conversation: "c1", thinking_level: null });
    expect(heldIn(core, "c1")).not.toHaveProperty("thinking_level");
    await core.commands.run(command("set_thinking_level"), { conversation: "c1", thinking_level: null });
    expect(heldIn(core, "c1")).not.toHaveProperty("thinking_level");

    expect(core.commands.preflight(command("set_thinking_level"), { conversation: "c1", thinking_level: "extreme" })).toBe(false);
    expect(core.commands.preflight(command("set_thinking_level"), { conversation: "gone", thinking_level: "high" })).toBe(false);
  });

  test("add_usage without a total, as for a call that titles the conversation, leaves the conversation's last as it was", async () => {
    const core = await started();

    await core.commands.run(command("add_usage"), { conversation: "c1", input: 100, output: 20, total: 130 });
    await core.commands.run(command("add_usage"), { conversation: "c1", input: 40, output: 8 });

    expect(heldIn(core, "c1")?.usage).toEqual({ input: 150, output: 30, last: 130 });
  });

  test("remove_conversation removes the conversation", async () => {
    const core = await started();

    await core.commands.run(command("remove_conversation"), { conversation: "c1" });

    expect(stateIn(core)).toEqual({ conversations: {} });
  });

  test("each that names a conversation fails its preflight where the state lacks it", async () => {
    const core = await started();
    const lacking = { conversation: "c9" };

    expect(core.commands.preflight(command("rename_conversation"), { ...lacking, title: "x" })).toBe(false);
    expect(core.commands.preflight(command("remove_conversation"), lacking)).toBe(false);
    expect(core.commands.preflight(command("add_message"), { ...lacking, message: message("u2", "user") })).toBe(false);
    expect(
      core.commands.preflight(command("compact_conversation"), { ...lacking, summary: message("s", "summary"), from: "u1" }),
    ).toBe(false);
    expect(core.commands.preflight(command("add_usage"), { ...lacking, input: 1, output: 1, total: 1 })).toBe(false);
    expect(core.commands.preflight(command("set_model"), { ...lacking, model: null })).toBe(false);
  });

  test("add_message adds the message at the end, makes its time the conversation's updated, and refuses an id that a message has", async () => {
    const core = await started();

    await core.commands.run(command("add_message"), {
      conversation: "c1",
      message: message("u2", "user", "2026-11-16T09:30:00.000Z"),
    });

    expect(ids(heldIn(core, "c1"))).toEqual(["u1", "a1", "u2"]);
    expect(heldIn(core, "c1")?.updated).toBe("2026-11-16T09:30:00.000Z");
    expect(core.commands.preflight(command("add_message"), { conversation: "c1", message: message("a1", "assistant") })).toBe(
      false,
    );
  });

  test("add_message drops the oldest exchanges past keep, but never the last one", async () => {
    const core = await started();

    await core.commands.run(command("add_message"), { conversation: "c1", message: message("u2", "user"), keep: 3 });
    expect(ids(heldIn(core, "c1"))).toEqual(["u1", "a1", "u2"]);

    await core.commands.run(command("add_message"), { conversation: "c1", message: message("a2", "assistant"), keep: 3 });
    expect(ids(heldIn(core, "c1"))).toEqual(["u2", "a2"]);

    await core.commands.run(command("add_message"), { conversation: "c1", message: message("t2", "tool"), keep: 2 });
    expect(ids(heldIn(core, "c1"))).toEqual(["u2", "a2", "t2"]);
  });

  test("add_message takes no message that fails the state's schema", async () => {
    const core = await started();

    await expect(
      core.commands.run(command("add_message"), { conversation: "c1", message: { ...message("u2", "user"), role: "system" } }),
    ).rejects.toThrow(/fail their schema/);
    await expect(
      core.commands.run(command("add_message"), { conversation: "c1", message: message("u2", "user"), keep: 0 }),
    ).rejects.toThrow(/fail their schema/);
  });

  test("trim_conversations cuts every conversation to keep", async () => {
    const core = await started({
      conversations: {
        c1: conversation([message("u1", "user"), message("a1", "assistant"), message("u2", "user"), message("a2", "assistant")]),
        c2: conversation([message("u1", "user"), message("a1", "assistant")]),
      },
    });

    await core.commands.run(command("trim_conversations"), { keep: 2 });

    expect(ids(heldIn(core, "c1"))).toEqual(["u2", "a2"]);
    expect(ids(heldIn(core, "c2"))).toEqual(["u1", "a1"]);
  });

  test("compact_conversation puts a summary in place of the messages before from, while the state holds from", async () => {
    const core = await started({
      conversations: {
        c1: conversation([message("u1", "user"), message("a1", "assistant"), message("u2", "user"), message("a2", "assistant")]),
      },
    });
    const summary = { ...message("s1", "summary"), parts: [{ type: "text", text: "The user asked for sales by region." }] };

    expect(
      core.commands.preflight(command("compact_conversation"), { conversation: "c1", summary, from: "u9" }),
    ).toBe(false);
    await expect(
      core.commands.run(command("compact_conversation"), { conversation: "c1", summary: message("s1", "user"), from: "u2" }),
    ).rejects.toThrow(/fail their schema/);

    await core.commands.run(command("compact_conversation"), { conversation: "c1", summary, from: "u2" });

    expect(ids(heldIn(core, "c1"))).toEqual(["s1", "u2", "a2"]);
    expect(heldIn(core, "c1")?.messages[0]).toEqual(summary);
  });

  test("none takes an undo step", async () => {
    const core = await started();

    await core.commands.run(command("add_message"), { conversation: "c1", message: message("u2", "user") });
    await core.commands.run(command("rename_conversation"), { conversation: "c1", title: "Regions" });
    await core.commands.run(command("set_model"), { conversation: "c1", model: "gpt-5.4" });

    expect(core.store.canUndo()).toBe(false);
  });

  test("each passes its preflight on a locked board, where core's command for a plugin's state fails its own", async () => {
    const core = await started(undefined, true);

    await core.commands.run(command("add_conversation"), { id: "c2", title: "New conversation" });
    await core.commands.run(command("add_message"), { conversation: "c2", message: message("u1", "user") });
    await core.commands.run(command("set_thinking_level"), { conversation: "c2", thinking_level: "high" });
    await core.commands.run(command("remove_conversation"), { conversation: "c1" });

    expect(Object.keys(stateIn(core).conversations)).toEqual(["c2"]);
    expect(heldIn(core, "c2")?.thinking_level).toBe("high");
    expect(
      core.commands.preflight(id("blockr.core", "set_plugin_state"), {
        plugin: { package: "blockr.assistant", id: "assistant_plugin" },
        patches: [{ op: "replace", path: "/conversations/c2/title", value: "x" }],
      }),
    ).toBe(false);
  });
});
