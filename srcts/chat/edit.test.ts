// What the edit tool's row shows of a call (./edit.ts).

import type { Board, Command, Json } from "@blockr/core";
import { id } from "@blockr/core/stubs";
import { describe, expect, test } from "vitest";
import { editView } from "./edit.ts";
import type { Core } from "./edit.ts";

const registered = new Map([
  [id("blockr.core", "add_block"), { id: "add_block", label: "Add block" } as Command<Json, unknown>],
  [id("blockr.core", "add_link"), { id: "add_link", label: "Add link" } as Command<Json, unknown>],
]);

// What the row reads of CoreApi: the commands above, and the ids that the
// stubs give, which are core's.
const core: Core = { commands: { registered: () => registered }, id };

const board = {
  id: "b",
  name: "Board",
  blocks: {
    a: { registry_id: id("blockr.core", "dataset_block"), state: {}, name: "Iris", locked: null },
    c: { registry_id: id("blockr.core", "head_block"), state: {}, name: "", locked: null },
  },
  links: {},
  stacks: {},
  options: {},
  plugins: {},
} satisfies Board;

const args = {
  commands: [
    { command: { package: "blockr.core", id: "add_block" }, args: {} },
    { command: { package: "blockr.core", id: "add_link" } },
    { command: { package: "acme", id: "pivot" } },
  ],
};

describe("the row of an edit", () => {
  test("names its commands by their labels, and a command that the app does not register by its id, as the user reads one", () => {
    expect(editView(args, undefined, false, core, board).commands).toEqual(["Add block", "Add link", "pivot of acme"]);
  });

  test("gives each block of the review with its status, by its name, or by its id once it has left the board", () => {
    const review = { applied: true, undo_step: true, blocks: { a: { status: "ready" }, c: { status: "invalid", reason: "Set n." }, d: { removed: "Gone." } }, removed: { blocks: ["e"] } };

    expect(editView(args, JSON.stringify(review), false, core, board).blocks).toEqual([
      { id: "a", name: "Iris", status: "ready", removed: false },
      { id: "c", name: "c", status: "invalid", removed: false },
      { id: "d", name: "d", status: undefined, removed: true },
      { id: "e", name: "e", status: undefined, removed: true },
    ]);
  });

  test("gives the command that refused the edit and why", () => {
    const refusal = { applied: false, index: 1, command: { package: "blockr.core", id: "add_link" }, failures: ["Block z is not on the board.", 7] };

    expect(editView(args, JSON.stringify(refusal), true, core, board)).toEqual({
      commands: ["Add block", "Add link", "pivot of acme"],
      blocks: [],
      refused: { command: "Add link", failures: ["Block z is not on the board."] },
    });
  });

  test("shows the commands alone where the result holds no JSON, as for a call that the user stopped", () => {
    expect(editView(args, "The user stopped the turn before this call returned.", true, core, board)).toEqual({
      commands: ["Add block", "Add link", "pivot of acme"],
      blocks: [],
      refused: undefined,
    });
  });

  test("of undo_edit, which runs no command, shows nothing where it had nothing to undo", () => {
    expect(editView({}, JSON.stringify({ applied: false, notes: ["Nothing to undo."] }), false, core, board)).toEqual({ commands: [], blocks: [], refused: undefined });
  });
});
