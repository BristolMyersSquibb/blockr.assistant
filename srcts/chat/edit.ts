// What the row of the edit tool, and of undo_edit, shows of a call
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#tool-calls):
// - The commands that the edit ran, by the labels that
//   core.commands.registered() gives, as "Add block". A command that the app
//   does not register shows by its id.
// - Each block that the edit's review gives, with the status that the review
//   gave it. The review gives the blocks that the edit changed, then those
//   that feed them, then those downstream, and it does not mark which are
//   which, so the row shows them all
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.2#the-edit-tool).
//   A block shows by its name on the board, and by its id once it has left
//   the board, as a block that the edit removed has.
// - A refused edit shows the command that refused and why, as the model gets
//   it.
// The row reads the call's args and the JSON of its result, which the edit
// tool writes. Where the result holds no JSON, as for a call that the user
// stopped, the row shows the commands alone.

import type { Board, Command, Json } from "@blockr/core";

export interface EditView {
  readonly commands: readonly string[];
  readonly blocks: readonly ReviewedBlock[];
  readonly refused: Refusal | undefined;
}

// A block that the review gives, or that the edit removed.
export interface ReviewedBlock {
  readonly id: string;
  readonly name: string;
  // The status that the review gave, or undefined where it gave none, as for
  // a block that left the board.
  readonly status: string | undefined;
  // Whether the block left the board, through the edit or while the review
  // waited.
  readonly removed: boolean;
}

export interface Refusal {
  // The label of the command that refused, where the result names one.
  readonly command: string | undefined;
  readonly failures: readonly string[];
}

export type Registered = Readonly<Record<string, Command<Json, unknown>>>;

// What the row shows of an edit, given the call's args, the text of its
// result where it has one, whether the result is marked as an error, the
// commands that the app registers and the board.
export function editView(args: unknown, text: string | undefined, error: boolean, registered: Registered, board: Board): EditView {
  const commands = listed(args).map((id) => labelOf(id, registered));
  const result = parsed(text);
  if (result === undefined) return { commands, blocks: [], refused: undefined };

  if (result.applied === false && error) {
    const command = typeof result.command === "string" ? labelOf(result.command, registered) : undefined;
    return { commands, blocks: [], refused: { command, failures: strings(result.failures) } };
  }

  const blocks: ReviewedBlock[] = Object.entries(object(result.blocks)).map(([id, entry]) => {
    const status = object(entry).status;
    const left = typeof status !== "string" || !Object.hasOwn(board.blocks, id);
    return { id, name: nameOf(id, board), status: typeof status === "string" ? status : undefined, removed: left };
  });
  const reviewed = new Set(blocks.map((block) => block.id));
  const removed = strings(object(result.removed).blocks)
    .filter((id) => !reviewed.has(id))
    .map((id) => ({ id, name: id, status: undefined, removed: true }));
  return { commands, blocks: [...blocks, ...removed], refused: undefined };
}

// The ids of the commands that an edit's args list.
function listed(args: unknown): string[] {
  const commands = object(args).commands;
  if (!Array.isArray(commands)) return [];
  return commands.flatMap((entry: unknown) => {
    const id = object(entry).command;
    return typeof id === "string" ? [id] : [];
  });
}

function labelOf(id: string, registered: Registered): string {
  return Object.hasOwn(registered, id) ? (registered[id]?.label ?? id) : id;
}

function nameOf(id: string, board: Board): string {
  const block = Object.hasOwn(board.blocks, id) ? board.blocks[id] : undefined;
  return block === undefined || block.name === "" ? id : block.name;
}

function parsed(text: string | undefined): Readonly<Record<string, unknown>> | undefined {
  if (text === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Readonly<Record<string, unknown>>) : undefined;
  } catch {
    return undefined;
  }
}

function object(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Readonly<Record<string, unknown>>) : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
