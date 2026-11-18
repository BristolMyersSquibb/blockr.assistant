// The notes of what others changed in the board, one of which a turn adds to
// its conversation before a call, where others changed the board's blocks,
// links or stacks since the conversation's previous call
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.5#what-changed-under-the-model).
// The class's start makes them as each board opens, and they last until the
// next board opens, as the signal aborts. So the first call after the board
// opens again carries no note.
//
// For each conversation that has made a call, the notes keep two things in
// the plugin's memory:
// - A copy of the board's blocks, links and stacks, as the conversation's
//   previous call saw them.
// - Each block, link and stack that another origin touched since then, with
//   who touched it and which of its properties: a block's args by name, its
//   name and its lock, a link's from, to and input, and a stack's name,
//   blocks and color.
//
// They follow the store, and tell who made each change by its origin:
// - The origin "user" is the user.
// - The origin "assistant" is the conversation whose turn runs, since one turn
//   runs at a time. For every other conversation, it is the assistant in
//   another conversation.
// - Any other origin is a plugin, by the name of the app's plugin whose class
//   has that id, or else by the origin.
// - A change that the store announces while asUser() runs is the user's.
//   That is for the undo that /undo asks for (blockr.assistant#233), which
//   takes back the assistant's step with the origin "assistant"
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#slash-commands).
//
// Before each call of a conversation, take() gives the conversation's note:
// 1. Where the conversation has no copy, as at its first call, there is none.
// 2. Otherwise, the note compares the copy's entry of each id that another
//    origin touched with the board's. It has a line for each that differs:
//    added, removed, or changed, with what another origin changed of it, such
//    as a block's name or the names of its args rather than their values, and
//    who changed it. So an arg set and set back leaves no line.
// 3. The board as it is then becomes the conversation's copy.
// The note's list is cut at assistant_board_section_max_chars, as each part
// of the Board section is.
//
// The copy also takes in each of the conversation's own edits, as the store
// announces them, rather than at the conversation's next call. So the note
// compares what another origin changed after such an edit with that edit:
// 1. A call goes out, and the copy holds no block "adults".
// 2. The model's edit adds "adults", which goes into the copy.
// 3. The user removes "adults".
// 4. Before the next call, the copy holds "adults" and the board does not, so
//    the note says that the user removed it.
// The copy takes in only what the edit set, so that what another origin
// changed before the edit, of the same block, still reads as theirs.

import type { Block, Board, CoreApi, Delta, Json, Link, Origin, Stack } from "@blockr/core";
import { newId } from "../state/index.ts";
import type { ConversationId, Message } from "../state/index.ts";
import { cutText, own, readToolCap } from "../tools/index.ts";
import preamble from "./preamble.md" with { type: "text" };

export interface Notes {
  // Resolves with the note of what others changed in the board since the
  // conversation's previous call, as a message of the role user that holds
  // one part of the type changes, or with undefined where there is none, as
  // at the conversation's first call. The board as it is then becomes the
  // conversation's copy. It rejects where
  // assistant_board_section_max_chars holds a value that it does not take.
  take(conversation: ConversationId): Promise<Message | undefined>;
  // Calls the function, and counts each change that the store announces
  // meanwhile as the user's, as for the undo that /undo asks for.
  asUser<T>(fn: () => T): T;
}

export interface NotesOptions {
  // The conversation whose turn runs, if any.
  readonly running: () => ConversationId | undefined;
}

// What of CoreApi the notes read.
export type Core = Pick<CoreApi, "store" | "plugins" | "blockrOption">;

// Who a note names for the changes of the user, and for those of the
// assistant that no turn of the conversation made.
const USER = "the user";
const ANOTHER_CONVERSATION = "the assistant in another conversation";

// What the note says where the cap cuts its list.
const HINT = "the Board section shows the board as it is now";

type Kind = "blocks" | "links" | "stacks";

const KINDS: readonly Kind[] = ["blocks", "links", "stacks"];

// The board's blocks, links and stacks, as a conversation knows them.
type Copy = Pick<Board, Kind>;

// What a change touched of a block, a link or a stack: the whole entry, as
// where the change added or removed it, or some of its properties, and of a
// block its state args by name.
interface Touch {
  readonly kind: Kind;
  readonly id: string;
  readonly whole: boolean;
  readonly properties: readonly string[];
  readonly args: readonly string[];
}

// Who touched an entry since the conversation's previous call: who last added
// or removed it, who last changed each of its properties and each of its
// args, and who touched it last.
interface Touched {
  whole: string | undefined;
  readonly properties: Map<string, string>;
  readonly args: Map<string, string>;
  last: string;
}

// What the notes keep of a conversation that has made a call.
interface Followed {
  copy: Copy;
  readonly touched: Record<Kind, Map<string, Touched>>;
}

// Who made a change: whom a note names, and the conversation whose own edit
// the change is, where a turn of the assistant made it.
interface Maker {
  readonly who: string;
  readonly conversation?: ConversationId | undefined;
}

export function createNotes(core: Core, signal: AbortSignal, options: NotesOptions): Notes {
  const followed = new Map<ConversationId, Followed>();
  // How many calls of asUser() run.
  let asUser = 0;

  function makerOf(origin: Origin): Maker {
    if (asUser > 0 || origin === "user") return { who: USER };
    if (origin === "assistant") return { who: ANOTHER_CONVERSATION, conversation: options.running() };
    return { who: `the plugin ${own(core.plugins.appPlugins(), origin)?.name ?? origin}` };
  }

  const stop = core.store.subscribe((change, board) => {
    // A change without a delta is a board that the store opened, which it
    // announces before the plugin's start. No copy holds for another board,
    // so each conversation's next call carries no note.
    if (!("delta" in change)) {
      followed.clear();
      return;
    }
    if (followed.size === 0) return;
    const touches = touchesOf(change.delta);
    if (touches.length === 0) return;
    const maker = makerOf(change.origin);
    for (const [conversation, held] of followed) {
      if (maker.conversation === conversation) held.copy = folded(held.copy, touches, board);
      else record(held.touched, touches, maker.who);
    }
  });
  signal.addEventListener(
    "abort",
    () => {
      stop();
      followed.clear();
    },
    { once: true },
  );

  return {
    async take(conversation) {
      const max = await readToolCap(core, "assistant_board_section_max_chars");
      // The board as it is once the cap is read.
      const board = core.store.board();
      const held = followed.get(conversation);
      followed.set(conversation, { copy: { blocks: board.blocks, links: board.links, stacks: board.stacks }, touched: untouched() });
      if (held === undefined || signal.aborted) return undefined;
      const lines = KINDS.flatMap((kind) => linesOf(kind, held, board));
      if (lines.length === 0) return undefined;
      const text = [preamble.trim(), cutText(["## Changes", ...lines].join("\n"), max, HINT)].join("\n\n");
      return { id: newId(), role: "user", parts: [{ type: "changes", text }], created: new Date().toISOString() };
    },

    asUser(fn) {
      asUser += 1;
      try {
        return fn();
      } finally {
        asUser -= 1;
      }
    },
  };
}

function untouched(): Record<Kind, Map<string, Touched>> {
  return { blocks: new Map(), links: new Map(), stacks: new Map() };
}

// What a delta touched of the board's blocks, links and stacks. A block's mod
// that names only the edit id it was built on touches nothing, and neither
// does the place of a link among its target's inputs.
function touchesOf(delta: Delta): Touch[] {
  const touches: Touch[] = [];
  const whole = (kind: Kind, ids: Iterable<string>): void => {
    for (const id of ids) touches.push({ kind, id, whole: true, properties: [], args: [] });
  };
  const changed = (kind: Kind, id: string, properties: readonly string[], args: readonly string[] = []): void => {
    if (properties.length > 0 || args.length > 0) touches.push({ kind, id, whole: false, properties, args });
  };
  const { blocks, links, stacks } = delta;
  whole("blocks", blocks?.rm ?? []);
  whole("blocks", Object.keys(blocks?.add ?? {}));
  for (const [id, mod] of Object.entries(blocks?.mod ?? {})) {
    const properties = [...(mod.name === undefined ? [] : ["name"]), ...(mod.locked === undefined ? [] : ["locked"])];
    changed("blocks", id, properties, [...Object.keys(mod.state ?? {}), ...(mod.unset ?? [])]);
  }
  whole("links", links?.rm ?? []);
  whole("links", Object.keys(links?.add ?? {}));
  for (const [id, mod] of Object.entries(links?.mod ?? {})) {
    changed("links", id, LINK.properties.map(({ key }) => key).filter((key) => mod[key as keyof Link] !== undefined));
  }
  whole("stacks", stacks?.rm ?? []);
  whole("stacks", Object.keys(stacks?.add ?? {}));
  for (const [id, mod] of Object.entries(stacks?.mod ?? {})) {
    changed("stacks", id, STACK.properties.map(({ key }) => key).filter((key) => mod[key as keyof Stack] !== undefined));
  }
  return touches;
}

// Records whom the note names for each touch of another origin's change.
function record(touched: Followed["touched"], touches: readonly Touch[], who: string): void {
  for (const touch of touches) {
    const held = touched[touch.kind].get(touch.id) ?? { whole: undefined, properties: new Map<string, string>(), args: new Map<string, string>(), last: who };
    if (touch.whole) held.whole = who;
    for (const property of touch.properties) held.properties.set(property, who);
    for (const arg of touch.args) held.args.set(arg, who);
    held.last = who;
    touched[touch.kind].set(touch.id, held);
  }
}

// The copy with the conversation's own edit in it: for each entry that the
// edit touched, what the edit set of it, from the board that the edit left.
// An entry that the edit changed and the copy lacks stays out, since another
// origin added it after the conversation's previous call, as its line says.
function folded(copy: Copy, touches: readonly Touch[], board: Board): Copy {
  let { blocks, links, stacks } = copy;
  for (const touch of touches) {
    switch (touch.kind) {
      case "blocks":
        blocks = foldedEntry(blocks, board.blocks, touch, (held, now) => foldedBlock(held, now, touch));
        break;
      case "links":
        links = foldedEntry(links, board.links, touch, (held, now) => ({ ...held, ...picked(LINK, now, touch) }));
        break;
      case "stacks":
        stacks = foldedEntry(stacks, board.stacks, touch, (held, now) => ({ ...held, ...picked(STACK, now, touch) }));
        break;
    }
  }
  return { blocks, links, stacks };
}

// The entries with the touched one as the conversation's own edit left it. A
// touch of the whole entry takes the entry as the board holds it now, or
// drops it where the board lacks it. Any other touch folds what the edit set
// into the copy's entry.
function foldedEntry<T>(
  held: Readonly<Record<string, T>>,
  now: Readonly<Record<string, T>>,
  touch: Touch,
  fold: (held: T, now: T) => T,
): Readonly<Record<string, T>> {
  const after = own(now, touch.id);
  if (touch.whole) return after === undefined ? without(held, touch.id) : { ...held, [touch.id]: after };
  const before = own(held, touch.id);
  return before === undefined || after === undefined ? held : { ...held, [touch.id]: fold(before, after) };
}

// The block with the args and the properties that the touch names as the
// board holds them now.
function foldedBlock(held: Block, now: Block, touch: Touch): Block {
  const state: Record<string, Json> = Object.fromEntries(Object.entries(held.state).filter(([arg]) => !touch.args.includes(arg)));
  for (const arg of touch.args) {
    const value = own(now.state, arg);
    if (value !== undefined) state[arg] = value;
  }
  return {
    ...held,
    state,
    ...(touch.properties.includes("name") ? { name: now.name } : {}),
    ...(touch.properties.includes("locked") ? { locked: now.locked } : {}),
  };
}

// The properties of the entry that the touch names, as the board holds them
// now.
function picked<T>(shape: Shape<T>, now: T, touch: Touch): Partial<T> {
  return Object.fromEntries(shape.properties.filter(({ key }) => touch.properties.includes(key)).map(({ key, read }) => [key, read(now)])) as Partial<T>;
}

// How a note writes the entries of a kind: by its label, with the properties
// that it compares, each by its key in a delta, by the word that names it in
// a note and by how to read it, and a block's state args.
interface Shape<T> {
  readonly label: string;
  readonly properties: readonly { readonly key: string; readonly word: string; readonly read: (entry: T) => Json }[];
  readonly args?: (entry: T) => Readonly<Record<string, Json>>;
}

const BLOCK: Shape<Block> = {
  label: "Block",
  properties: [
    { key: "registry_id", word: "class", read: (block) => block.registry_id },
    { key: "name", word: "name", read: (block) => block.name },
    { key: "locked", word: "lock", read: (block) => block.locked },
  ],
  args: (block) => block.state,
};

const LINK: Shape<Link> = {
  label: "Link",
  properties: [
    { key: "from", word: "from", read: (link) => link.from },
    { key: "to", word: "to", read: (link) => link.to },
    { key: "input", word: "input", read: (link) => link.input },
  ],
};

const STACK: Shape<Stack> = {
  label: "Stack",
  properties: [
    { key: "name", word: "name", read: (stack) => stack.name },
    { key: "blocks", word: "blocks", read: (stack) => stack.blocks },
    { key: "color", word: "color", read: (stack) => stack.color },
  ],
};

// The lines of the note for the entries of a kind that another origin
// touched, in the order in which they were first touched.
function linesOf(kind: Kind, held: Followed, board: Board): string[] {
  switch (kind) {
    case "blocks":
      return lines(BLOCK, held.touched.blocks, held.copy.blocks, board.blocks);
    case "links":
      return lines(LINK, held.touched.links, held.copy.links, board.links);
    case "stacks":
      return lines(STACK, held.touched.stacks, held.copy.stacks, board.stacks);
  }
}

function lines<T>(shape: Shape<T>, touched: ReadonlyMap<string, Touched>, copy: Readonly<Record<string, T>>, now: Readonly<Record<string, T>>): string[] {
  return [...touched].flatMap(([id, held]) => {
    const line = lineOf(shape, id, held, own(copy, id), own(now, id));
    return line === undefined ? [] : [line];
  });
}

// The line of an entry that another origin touched, or undefined where the
// copy's entry and the board's do not differ.
function lineOf<T>(shape: Shape<T>, id: string, touched: Touched, before: T | undefined, after: T | undefined): string | undefined {
  const head = `- ${shape.label} ${id}:`;
  if (before === undefined) return after === undefined ? undefined : `${head} added by ${touched.whole ?? touched.last}.`;
  if (after === undefined) return `${head} removed by ${touched.whole ?? touched.last}.`;

  // What differs, by whom the note names for it: where another origin added
  // or removed the entry, every property and arg, and otherwise those that
  // another origin changed.
  const changed = new Map<string, { properties: string[]; args: string[] }>();
  const differs = (who: string | undefined, part: "properties" | "args", word: string): void => {
    const by = who ?? touched.whole ?? touched.last;
    const held = changed.get(by) ?? { properties: [], args: [] };
    held[part].push(word);
    changed.set(by, held);
  };
  for (const { key, word, read } of shape.properties) {
    if ((touched.whole !== undefined || touched.properties.has(key)) && !sameJson(read(before), read(after))) differs(touched.properties.get(key), "properties", word);
  }
  if (shape.args !== undefined) {
    const was = shape.args(before);
    const is = shape.args(after);
    const args = touched.whole === undefined ? [...touched.args.keys()] : [...new Set([...Object.keys(was), ...Object.keys(is)])];
    for (const arg of args) {
      if (!sameJson(own(was, arg), own(is, arg))) differs(touched.args.get(arg), "args", arg);
    }
  }
  if (changed.size === 0) return undefined;
  return `${head} ${[...changed].map(([who, { properties, args }]) => `${listed(properties, args)} changed by ${who}`).join("; ")}.`;
}

// The properties and the args given, as a note names them, as in "name and
// args n, cols".
function listed(properties: readonly string[], args: readonly string[]): string {
  const items = [...properties, ...(args.length === 0 ? [] : [`${args.length === 1 ? "arg" : "args"} ${args.join(", ")}`])];
  const last = items.at(-1) ?? "";
  return items.length <= 1 ? last : `${items.slice(0, -1).join(", ")} and ${last}`;
}

// The record without the entry under the key, or the record itself where it
// holds none.
function without<T>(record: Readonly<Record<string, T>>, key: string): Readonly<Record<string, T>> {
  return Object.hasOwn(record, key) ? Object.fromEntries(Object.entries(record).filter(([id]) => id !== key)) : record;
}

// Whether two values are the same JSON.
function sameJson(a: Json | undefined, b: Json | undefined): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    const other: readonly Json[] = b;
    return (a as readonly Json[]).every((item, index) => sameJson(item, other[index]));
  }
  const keys = Object.keys(a);
  const other = b as Readonly<Record<string, Json>>;
  return keys.length === Object.keys(other).length && keys.every((key) => Object.hasOwn(other, key) && sameJson((a as Readonly<Record<string, Json>>)[key], other[key]));
}
