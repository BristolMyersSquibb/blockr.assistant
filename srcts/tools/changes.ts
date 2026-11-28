// What the edit tool and undo_edit hear of their step: the changes of the
// assistant's origin, the id of its plugin class, that the store announces
// while the tool runs its commands or its undo, one for each delta of the
// step, each with the board before and after it
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.2#the-edit-tool).
// - The tool subscribes to the store before it runs the commands, and ends the
//   subscription once their call settles.
// - The user and other plugins edit with origins of their own, so the tool
//   takes none of their changes for its own. An undo through the frontend's
//   Undo carries the origin "user", even where it takes back a step of the
//   assistant's.
// - The assistant's chat and loop change its conversations with the
//   assistant's origin too, through patches inside the assistant's state
//   alone. The edit tool refuses a list that would change that state, so the
//   tool takes no change that only patches the assistant's state for its
//   own.

import type { BlockId, Board, CoreApi, Delta } from "@blockr/core";
import { assistantClassId, at } from "../state/index.ts";
import { own } from "./context.ts";

// The path of the assistant's state in the board.
const OWN_STATE = at();

// A change of the step: one of its deltas, as the store expanded it, with the
// board before and after it.
export interface Heard {
  readonly delta: Delta;
  readonly before: Board;
  readonly after: Board;
}

export interface Hearing {
  // The changes of the step heard so far, in the order of the step.
  heard(): readonly Heard[];
  // Ends the subscription.
  stop(): void;
}

// Subscribes to the store, and keeps each change of the step from now on.
export function hear(core: Pick<CoreApi, "store" | "id">): Hearing {
  const heard: Heard[] = [];
  const origin = assistantClassId(core);
  // The board after the last change of any origin, which is the board before
  // the next.
  let last = core.store.board();
  const stop = core.store.subscribe((change, board) => {
    const before = last;
    last = board;
    if (!("delta" in change) || change.origin !== origin || ownStateOnly(change.delta)) return;
    heard.push({ delta: change.delta, before, after: board });
  });
  return { heard: () => heard, stop };
}

// The blocks that the step added, or whose state or links it changed, in the
// order the step changed them. A link that the step removed or moved changed
// the block that it went to, which the board before the change names.
export function changedBlocks(heard: readonly Heard[]): BlockId[] {
  const changed = new Set<BlockId>();
  const add = (id: BlockId | undefined): void => {
    if (id !== undefined) changed.add(id);
  };
  for (const { delta, before, after } of heard) {
    for (const id of Object.keys(delta.blocks?.add ?? {})) add(id);
    for (const [id, mod] of Object.entries(delta.blocks?.mod ?? {})) {
      if (mod.state !== undefined || mod.unset !== undefined) add(id);
    }
    for (const link of Object.values(delta.links?.add ?? {})) add(link.to);
    for (const id of delta.links?.rm ?? []) add(own(before.links, id)?.to);
    for (const id of Object.keys(delta.links?.mod ?? {})) {
      add(own(before.links, id)?.to);
      add(own(after.links, id)?.to);
    }
  }
  return [...changed];
}

// The blocks, links and stacks that the step added and removed, each by its
// id, of each kind that it changed: those that the board after its last
// change holds and the board before its first change lacks, and the other way
// round.
export function addedAndRemoved(heard: readonly Heard[]): { added: Ids; removed: Ids } {
  const first = heard[0];
  const last = heard.at(-1);
  if (first === undefined || last === undefined) return { added: {}, removed: {} };
  return { added: missing(last.after, first.before), removed: missing(first.before, last.after) };
}

export type Ids = Partial<Record<"blocks" | "links" | "stacks", string[]>>;

// The ids of each kind that `board` holds and `other` lacks.
function missing(board: Board, other: Board): Ids {
  const ids: Ids = {};
  for (const kind of ["blocks", "links", "stacks"] as const) {
    const lacking = Object.keys(board[kind]).filter((id) => !Object.hasOwn(other[kind], id));
    if (lacking.length > 0) ids[kind] = lacking;
  }
  return ids;
}

// Whether the delta holds nothing but patches inside the assistant's state.
function ownStateOnly(delta: Delta): boolean {
  const patches = delta.patches ?? [];
  return (
    holds(delta).every((part) => part === "patches") &&
    patches.length > 0 &&
    patches.every(({ path }) => path === OWN_STATE || path.startsWith(`${OWN_STATE}/`))
  );
}

// The parts of the delta that hold a change: the board's name, patches, or a
// collection's part with an entry or an id.
function holds(delta: Delta): string[] {
  return Object.entries(delta)
    .filter(([, part]) => holdsChange(part))
    .map(([key]) => key);
}

function holdsChange(part: unknown): boolean {
  if (typeof part === "string") return true;
  if (Array.isArray(part)) return part.length > 0;
  if (part === null || typeof part !== "object") return false;
  return Object.values(part as Record<string, unknown>).some((member) =>
    Array.isArray(member) ? member.length > 0 : member !== null && typeof member === "object" && Object.keys(member).length > 0,
  );
}
