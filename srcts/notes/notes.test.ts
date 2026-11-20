// The notes (./notes.ts) on core's CoreApi for tests, on a board of a test
// package's block classes: what a note says of the blocks, links and stacks
// that others added, removed or changed since a conversation's previous call,
// how it groups what one origin added or removed, whom it names for each
// change, what it leaves out, the conversation's own edits, the undo that
// /undo asks for, the cap, and the message that holds the note.

import type { Board, CoreApi, Json } from "@blockr/core";
import { HELLO, stubCore } from "@blockr/core/stubs";
import { describe, expect, onTestFinished, test } from "vitest";
import { isNote } from "../state/index.ts";
import type { ConversationId, Message } from "../state/index.ts";
import { blockClass, helloWith } from "../testing/index.ts";
import { createNotes } from "./notes.ts";

// The block classes of a test package that the board's blocks are of.
const DATA = blockClass("blockr.test-data_block", { category: "input" });
const HEAD = blockClass("blockr.test-head_block", { inputs: ["data"] });
const MERGE = blockClass("blockr.test-merge_block", { inputs: ["x", "y"] });
const SUBSET = blockClass("blockr.test-subset_block", { inputs: ["data"] });
const BIND = blockClass("blockr.test-bind_block", { inputs: ["..."] });
const SCATTER = blockClass("blockr.test-scatter_block", { inputs: ["data"] });

// The board: the data block a, which feeds the head block b, the merge block c
// of a and b, the subset block d and the scatter block f, and the bind block
// e of b and d, with the stack s1 of a and b.
const BOARD = {
  blocks: {
    a: { registry_id: DATA.id, state: { dataset: "iris" }, name: "Iris", locked: null },
    b: { registry_id: HEAD.id, state: { n: 6, direction: "head" }, name: "Head", locked: null },
    c: { registry_id: MERGE.id, state: { by: ["Species"], all_x: false, all_y: false }, name: "Merge", locked: null },
    d: { registry_id: SUBSET.id, state: { subset: "Sepal.Width > 3" }, name: "Wide sepals", locked: null },
    e: { registry_id: BIND.id, state: {}, name: "Bind", locked: null },
    f: { registry_id: SCATTER.id, state: { x: "Sepal.Length", y: "Sepal.Width" }, name: "Scatter", locked: null },
  },
  links: {
    ab: { from: "a", to: "b", input: "data" },
    ac: { from: "a", to: "c", input: "x" },
    bc: { from: "b", to: "c", input: "y" },
    ad: { from: "a", to: "d", input: "data" },
    be: { from: "b", to: "e", input: "" },
    de: { from: "d", to: "e", input: "" },
    af: { from: "a", to: "f", input: "data" },
  },
  stacks: { s1: { name: "Input", blocks: ["a", "b"], color: null } },
} satisfies Partial<Board>;

// A plugin of the app's that tidies the board, whose class keeps no state.
const TIDY = "blockr.test-tidy_plugin";

// Core on that board, in an app that runs core's plugins and the plugin
// Tidy, with the notes of that board.
// Core stops as the test finishes.
async function opened(blockrOptions?: Readonly<Record<string, Json>>) {
  const hello = helloWith(HELLO, { blockClasses: [DATA, HEAD, MERGE, SUBSET, BIND, SCATTER], board: BOARD });
  const stubbed = await stubCore({
    hello: { ...hello, plugins: { ...hello.plugins, [TIDY]: { name: "Tidy", version: 1, module: `app/${TIDY}.js` } } },
    modules: { [TIDY]: { api: 1, default: {} } },
    ...(blockrOptions === undefined ? {} : { blockrOptions }),
  });
  const controller = new AbortController();
  onTestFinished(() => {
    controller.abort();
    stubbed.stop();
  });
  let running: ConversationId | undefined;
  const notes = createNotes(stubbed.core, controller.signal, { running: () => running });
  // Has the conversation's turn run, or none for undefined.
  const turnIn = (conversation: ConversationId | undefined): void => {
    running = conversation;
  };
  const close = (): void => {
    controller.abort();
  };
  return { ...stubbed, notes, turnIn, close };
}

// Runs a command of core's on the board, as the user's unless the origin is
// given.
async function edit(core: CoreApi, id: string, args: Json, origin = "user"): Promise<void> {
  await core.commands.run(id, args, origin);
}

// The text of the note, or undefined for none.
function textOf(note: Message | undefined): string | undefined {
  return note?.parts.map((part) => (part.type === "changes" ? part.text : "")).join("");
}

// The lines of the note's list.
function linesOf(note: Message | undefined): string[] {
  return (textOf(note) ?? "").split("\n").filter((line) => line.startsWith("- "));
}

describe("the note of what others changed in the board", () => {
  test("is none at a conversation's first call, and none where nothing changed since the conversation's previous call", async () => {
    const { core, notes } = await opened();
    await edit(core, "blockr.core-rename_block", { id: "b", name: "Top" });

    expect(await notes.take("c1")).toBeUndefined();
    expect(await notes.take("c1")).toBeUndefined();
  });

  test("says which blocks, links and stacks the user added, removed or changed since the conversation's previous call", async () => {
    const { core, notes } = await opened();
    await notes.take("c1");

    await edit(core, "blockr.core-remove_block", { id: "d" });
    await edit(core, "blockr.core-add_block", { registry_id: HEAD.id, id: "g" });
    await edit(core, "blockr.core-rename_block", { id: "b", name: "Top" });
    await edit(core, "blockr.core-set_block", { id: "b", state: { n: 10 } });
    await edit(core, "blockr.core-rename_stack", { id: "s1", name: "Inputs" });

    expect(linesOf(await notes.take("c1"))).toEqual([
      "- Block d, with its links ad and de: removed by the user.",
      "- Block g: added by the user.",
      "- Block b: name and arg n changed by the user.",
      "- Stack s1: name changed by the user.",
    ]);
    expect(await notes.take("c1")).toBeUndefined();
  });

  test("gives what one origin added, and what it removed, a line for each kind, with the links that came or went with its blocks on their line", async () => {
    const { core, notes } = await opened();
    await notes.take("c1");

    await edit(core, "blockr.core-remove_block", { id: "d" });
    await edit(core, "blockr.core-remove_block", { id: "e" });
    await edit(core, "blockr.core-add_block", { registry_id: HEAD.id, id: "g" });
    await edit(core, "blockr.core-add_block", { registry_id: HEAD.id, id: "h" });
    await edit(core, "blockr.core-add_link", { from: "a", to: "g", id: "ag" });
    await edit(core, "blockr.core-remove_link", { id: "ab" });
    await edit(core, "blockr.core-remove_link", { id: "ac" });
    await edit(core, "blockr.core-remove_link", { id: "bc" }, "assistant");
    await edit(core, "blockr.core-add_stack", { id: "s2", name: "Outputs" });
    await edit(core, "blockr.core-add_stack", { id: "s3", name: "Checks" });

    expect(linesOf(await notes.take("c1"))).toEqual([
      "- Blocks d and e, with their links ad, de and be: removed by the user.",
      "- Blocks g and h, with their link ag: added by the user.",
      "- Links ab and ac: removed by the user.",
      "- Link bc: removed by the assistant in another conversation.",
      "- Stacks s2 and s3: added by the user.",
    ]);
  });

  test("names the args that changed rather than their values, and leaves out what was set and set back", async () => {
    const { core, notes } = await opened();
    await notes.take("c1");

    await edit(core, "blockr.core-set_block", { id: "b", state: { n: 10 } });
    await edit(core, "blockr.core-set_block", { id: "b", state: { n: 6 } });
    await edit(core, "blockr.core-set_block", { id: "c", state: { by: ["Sepal.Length"], all_x: true } });
    await edit(core, "blockr.core-set_block", { id: "f", unset: ["y"] });
    await edit(core, "blockr.core-add_stack", { id: "s2", name: "Gone" });
    await edit(core, "blockr.core-remove_stack", { id: "s2" });

    const note = await notes.take("c1");
    expect(linesOf(note)).toEqual(["- Block c: args by, all_x changed by the user.", "- Block f: arg y changed by the user."]);
    expect(textOf(note)).not.toContain("Sepal.Length");
  });

  test("names whom each change is of: the user, the assistant in another conversation, or a plugin, by its name where it is one of the app's", async () => {
    const { core, notes, turnIn } = await opened();
    await notes.take("c1");
    await notes.take("c2");

    turnIn("c2");
    await edit(core, "blockr.core-rename_block", { id: "a", name: "Data" }, "assistant");
    turnIn(undefined);
    await edit(core, "blockr.core-remove_block", { id: "f" }, "blockr.session");
    await edit(core, "blockr.core-rename_stack", { id: "s1", name: "Inputs" }, TIDY);
    await edit(core, "blockr.core-set_block", { id: "b", state: { n: 10 } });

    expect(linesOf(await notes.take("c1"))).toEqual([
      "- Block a: name changed by the assistant in another conversation.",
      "- Block f, with its link af: removed by the plugin blockr.session.",
      "- Block b: arg n changed by the user.",
      "- Stack s1: name changed by the plugin Tidy.",
    ]);
    expect(linesOf(await notes.take("c2"))).toEqual([
      "- Block f, with its link af: removed by the plugin blockr.session.",
      "- Block b: arg n changed by the user.",
      "- Stack s1: name changed by the plugin Tidy.",
    ]);
  });

  test("names each who beside what they changed, where several changed one block", async () => {
    const { core, notes } = await opened();
    await notes.take("c1");

    await edit(core, "blockr.core-rename_block", { id: "b", name: "Top" });
    await edit(core, "blockr.core-set_block", { id: "b", state: { n: 10 } }, "assistant");
    await edit(core, "blockr.core-set_block_lock", { id: "b", locked: true });

    expect(linesOf(await notes.take("c1"))).toEqual(["- Block b: name and lock changed by the user; arg n changed by the assistant in another conversation."]);
  });

  test("compares what another origin changed after one of the conversation's own edits with that edit", async () => {
    const { core, notes, turnIn } = await opened();
    await notes.take("c1");

    turnIn("c1");
    await edit(core, "blockr.core-add_block", { registry_id: HEAD.id, id: "adults" }, "assistant");
    await edit(core, "blockr.core-set_block", { id: "b", state: { n: 10 } }, "assistant");
    await edit(core, "blockr.core-remove_block", { id: "adults" });
    await edit(core, "blockr.core-set_block", { id: "b", state: { n: 6 } });

    expect(linesOf(await notes.take("c1"))).toEqual(["- Block adults: removed by the user.", "- Block b: arg n changed by the user."]);
  });

  test("keeps what another origin changed of a block before the conversation's own edit of it as theirs", async () => {
    const { core, notes, turnIn } = await opened();
    await notes.take("c1");

    await edit(core, "blockr.core-set_block", { id: "b", state: { n: 10 } });
    turnIn("c1");
    await edit(core, "blockr.core-set_block", { id: "b", state: { direction: "tail" } }, "assistant");
    await edit(core, "blockr.core-rename_block", { id: "a", name: "Data" }, "assistant");

    expect(linesOf(await notes.take("c1"))).toEqual(["- Block b: arg n changed by the user."]);
  });

  test("counts the changes that the store announces inside asUser() as the user's, as the undo that /undo asks for", async () => {
    const { core, notes, turnIn } = await opened();
    await notes.take("c1");
    await notes.take("c2");

    turnIn("c1");
    await edit(core, "blockr.core-rename_block", { id: "a", name: "Data" }, "assistant");
    turnIn(undefined);
    notes.asUser(() => {
      core.store.undo("assistant");
    });

    expect(linesOf(await notes.take("c1"))).toEqual(["- Block a: name changed by the user."]);
    expect(await notes.take("c2")).toBeUndefined();
  });

  test("cuts its list at assistant_board_section_max_chars, and says where the board is", async () => {
    const { core, notes } = await opened({ assistant_board_section_max_chars: 120 });
    await notes.take("c1");

    for (const id of ["a", "b", "c", "d", "e", "f"]) await edit(core, "blockr.core-remove_block", { id });

    const text = textOf(await notes.take("c1")) ?? "";
    const list = text.slice(text.indexOf("## Changes"));
    expect(Array.from(list).length).toBeLessThanOrEqual(120);
    expect(list).toMatch(/truncated -- the Board section shows the board as it is now\]$/);
  });

  test("goes in a message of the role user that holds one part of the type changes, whose text opens with the preamble that says that the app writes it", async () => {
    const { core, notes } = await opened();
    await notes.take("c1");
    await edit(core, "blockr.core-rename_block", { id: "b", name: "Top" });

    const note = await notes.take("c1");

    expect(note?.role).toBe("user");
    expect(note?.parts.map((part) => part.type)).toEqual(["changes"]);
    expect(note !== undefined && isNote(note)).toBe(true);
    expect(textOf(note)).toMatch(/^This message comes from the app, not from the user\.\n/);
  });

  test("records nothing more once its board closes", async () => {
    const { core, notes, close } = await opened();
    await notes.take("c1");

    close();
    await edit(core, "blockr.core-rename_block", { id: "b", name: "Top" });

    expect(await notes.take("c1")).toBeUndefined();
  });

  test("matches its snapshot", async () => {
    const { core, notes, turnIn } = await opened();
    await notes.take("c1");
    turnIn("c1");
    await edit(core, "blockr.core-add_block", { registry_id: HEAD.id, id: "adults" }, "assistant");
    turnIn(undefined);
    await edit(core, "blockr.core-remove_block", { id: "adults" });
    await edit(core, "blockr.core-remove_block", { id: "d" });
    await edit(core, "blockr.core-set_block", { id: "b", state: { n: 10 } });
    await edit(core, "blockr.core-add_link", { from: "c", to: "e", id: "l3" }, "assistant");

    await expect(textOf(await notes.take("c1"))).toMatchFileSnapshot("./__snapshots__/note.md");
  });
});
