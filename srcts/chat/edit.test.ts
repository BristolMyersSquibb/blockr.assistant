// What the edit tool's row shows of a call (./edit.ts).

import type { Board, Command, Json } from "@blockr/core";
import { describe, expect, test } from "vitest";
import { editView } from "./edit.ts";
import type { Registered } from "./edit.ts";

const registered: Registered = {
  "blockr.core-add_block": { id: "blockr.core-add_block", label: "Add block" } as Command<Json, unknown>,
  "blockr.core-add_link": { id: "blockr.core-add_link", label: "Add link" } as Command<Json, unknown>,
};

const board = {
  id: "b",
  name: "Board",
  blocks: { a: { registry_id: "dataset_block", state: {}, name: "Iris", locked: null }, c: { registry_id: "head_block", state: {}, name: "", locked: null } },
  links: {},
  stacks: {},
  options: {},
  plugins: {},
} satisfies Board;

const args = { commands: [{ command: "blockr.core-add_block", args: {} }, { command: "blockr.core-add_link" }, { command: "acme-pivot" }] };

describe("the row of an edit", () => {
  test("names its commands by their labels, and a command that the app does not register by its id", () => {
    expect(editView(args, undefined, false, registered, board).commands).toEqual(["Add block", "Add link", "acme-pivot"]);
  });

  test("gives each block of the review with its status, by its name, or by its id once it has left the board", () => {
    const review = { applied: true, undo_step: true, blocks: { a: { status: "ready" }, c: { status: "invalid", reason: "Set n." }, d: { removed: "Gone." } }, removed: { blocks: ["e"] } };

    expect(editView(args, JSON.stringify(review), false, registered, board).blocks).toEqual([
      { id: "a", name: "Iris", status: "ready", removed: false },
      { id: "c", name: "c", status: "invalid", removed: false },
      { id: "d", name: "d", status: undefined, removed: true },
      { id: "e", name: "e", status: undefined, removed: true },
    ]);
  });

  test("gives the command that refused the edit and why", () => {
    const refusal = { applied: false, index: 1, command: "blockr.core-add_link", failures: ["Block z is not on the board.", 7] };

    expect(editView(args, JSON.stringify(refusal), true, registered, board)).toEqual({
      commands: ["Add block", "Add link", "acme-pivot"],
      blocks: [],
      refused: { command: "Add link", failures: ["Block z is not on the board."] },
    });
  });

  test("shows the commands alone where the result holds no JSON, as for a call that the user stopped", () => {
    expect(editView(args, "The user stopped the turn before this call returned.", true, registered, board)).toEqual({
      commands: ["Add block", "Add link", "acme-pivot"],
      blocks: [],
      refused: undefined,
    });
  });

  test("of undo_edit, which runs no command, shows nothing where it had nothing to undo", () => {
    expect(editView({}, JSON.stringify({ applied: false, notes: ["Nothing to undo."] }), false, registered, board)).toEqual({ commands: [], blocks: [], refused: undefined });
  });
});
