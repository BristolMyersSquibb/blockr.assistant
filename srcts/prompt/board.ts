// The Board section, which the message of the app's holds after the
// conversation's last message, written from what CoreApi gives as each call
// goes out, in place of R's describe_board()
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.5#the-sections).
// It keeps today's headings, lines and markers (R/describe-board.R at
// fcbdb27), with the client's names in place of R's:
// - A line of counts of the blocks, the links and the stacks, with the blocks
//   by each status that marks one. An empty board has the line of counts
//   alone, marked as empty, as today's has.
// - The blocks, each with its id, the registry id of its class in place of
//   its S3 class, and the names of its state args, none marked with *, since
//   every block's state is open to external control on a board that is not
//   locked. Its markers follow: its status, where it holds no current result,
//   and the counts of its conditions by severity. Then come the links into
//   the block, each with the input that it feeds, the block that it comes
//   from and its id, in place of a part of their own.
// - The stacks that hold a block listed, each by its id and name, with the
//   blocks listed and a count of its others, without the S3 class. A stack
//   that holds no block has nothing to leave out, so it counts as one that
//   holds a block listed.
// The app's plugins and the board options are in the system prompt instead
// (./plugins.ts), since neither changes while the board is open. The section
// gives no plugin's state, which the model reads with get_plugin_state.
//
// One cap, assistant_board_section_max_chars, bounds the whole section,
// rather than each of its parts, so that what a call reads anew stops growing
// with the board
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.5#what-must-hold).
// The section fills the cap in this order, each group of blocks in the
// board's order, so that what the cap leaves out is what a call is least
// likely to need:
// 1. The blocks that failed or are invalid, since a request about what went
//    wrong needs them.
// 2. The block that has focus.
// 3. The blocks that the store's deltas touched since the conversation's
//    previous call: those of the note of what others changed, and those of
//    the conversation's own edits (../notes).
// 4. The blocks on screen.
// 5. The rest of the blocks.
// 6. The stacks.
// Each part takes its lines in order until the next would pass the cap. A
// part that the cap cuts ends with a line that counts what it leaves out and
// names the tool that gives it, as in "… and 88 more blocks: list_blocks
// gives every block". The cap keeps room for that line, and for the parts
// after it to say at least what they leave out. A cap too small even for
// that is passed, so that the model always learns what the section leaves
// out.

import type { Block, BlockStatus, CoreApi, Link } from "@blockr/core";

// What of CoreApi the section reads.
export type Core = Pick<CoreApi, "store" | "scheduler" | "focus" | "onScreen">;

// The statuses under which a block holds no current result, which its line
// marks and the line of counts counts, in the order of the rules.
const MARKED = ["waiting", "invalid", "failed", "unevaluated", "stale"] as const satisfies readonly BlockStatus["status"][];

const NO_RESULT: ReadonlySet<BlockStatus["status"]> = new Set(MARKED);

// The statuses of the blocks that the section lists first.
const WRONG: ReadonlySet<BlockStatus["status"]> = new Set(["failed", "invalid"]);

// The icon of each severity of a condition, in the order of the marker.
const ICONS = { error: "✖", warning: "⚠", message: "ℹ" } as const;

// A part of the section that the cap may cut: its heading, its lines in the
// order in which it takes them, and the line that counts what it leaves out
// where it shows the lines given.
interface Part {
  readonly heading: string;
  readonly lines: readonly string[];
  rest(shown: number): string | undefined;
}

// The Board section of the board as it is now, within `max` characters, with
// the blocks that the store's deltas touched since the conversation's
// previous call among those that it lists first.
export function boardSection(core: Core, max: number, changed: Iterable<string> = []): string {
  const board = core.store.board();
  const blocks = Object.entries(board.blocks);
  const links = Object.entries(board.links);
  const stacks = Object.entries(board.stacks);
  const statuses = new Map(blocks.map(([id]) => [id, core.scheduler.status(id)]));
  const counts = countsLine(blocks.length, links.length, stacks.length, [...statuses.values()]);
  if (blocks.length + links.length + stacks.length === 0) return ["## Board", `${counts} (empty board -- no blocks yet)`].join("\n");

  const order = blockOrder(core, blocks, statuses, new Set(changed));
  const into = linksInto(links);
  const blockPart: Part = {
    heading: "### Blocks",
    lines: order.map(([id, block]) => blockLine(id, block, statuses.get(id), into.get(id) ?? [])),
    rest: (shown) => {
      const left = order.slice(shown);
      if (left.length === 0) return undefined;
      const linked = left.reduce((sum, [id]) => sum + (into.get(id)?.length ?? 0), 0);
      const tail = linked === 0 ? "" : `, with the ${counted(linked, "link")} into ${left.length === 1 ? "it" : "them"}`;
      return `${more(left.length, shown, "block")}${tail}: list_blocks gives every block${linked === 0 ? "" : ", list_links every link"}`;
    },
  };
  // The stacks' part, once the blocks' part has listed the blocks given.
  const stackPart = (listed: ReadonlySet<string>): Part => {
    const shown = stacks.filter(([, { blocks: held }]) => held.length === 0 || held.some((id) => listed.has(id)));
    return {
      heading: "### Stacks",
      lines: shown.map(([id, stack]) => stackLine(id, stack.name, stack.blocks, listed)),
      rest: (taken) => (taken === stacks.length ? undefined : `${more(stacks.length - taken, taken, "stack")}: list_stacks gives every stack`),
    };
  };

  // The heading and the line of counts, then an empty line, as today's.
  const lines = ["## Board", counts, ""];
  let room = max - width(lines.join("\n"));
  // Adds the lines of the part that fit, keeping `kept` characters for the
  // parts after it, and gives how many of the part's lines it shows.
  const add = (part: Part, kept: number): number => {
    const { shown, filled } = fill(part, room - kept);
    lines.push(...filled);
    room -= width(["", ...filled].join("\n"));
    return shown;
  };

  const forStacks = stacks.length === 0 ? 0 : least(stackPart(new Set()));
  const shown = blocks.length === 0 ? 0 : add(blockPart, forStacks);
  const listed = new Set(order.slice(0, shown).map(([id]) => id));
  if (stacks.length > 0) add(stackPart(listed), 0);
  return lines.join("\n");
}

// The lines of the part that fit in `room` characters, each after a line
// break: its heading, its lines in order until the next would not fit, and
// the line that counts what it leaves out, for which the room is kept. Where
// not even the heading and that line fit, they come all the same. It gives
// how many of the part's lines it shows, too.
function fill(part: Part, room: number): { readonly shown: number; readonly filled: string[] } {
  let used = width(`\n${part.heading}`);
  let shown = 0;
  for (const line of part.lines) {
    const rest = part.rest(shown + 1);
    if (used + width(`\n${line}`) + (rest === undefined ? 0 : width(`\n${rest}`)) > room) break;
    used += width(`\n${line}`);
    shown += 1;
  }
  const rest = part.rest(shown);
  return { shown, filled: [part.heading, ...part.lines.slice(0, shown), ...(rest === undefined ? [] : [rest])] };
}

// The room that the part takes where it shows none of its lines: its heading
// and the line that counts what it leaves out.
function least(part: Part): number {
  const rest = part.rest(0);
  return width(["", part.heading, ...(rest === undefined ? [] : [rest])].join("\n"));
}

// The characters that the text takes, as R counts them.
function width(text: string): number {
  return Array.from(text).length;
}

// The count with the word, as in "1 block" or "2 blocks".
function counted(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? "" : "s"}`;
}

// The start of the line that counts what a part leaves out, as in "… and 88
// more blocks", or "… 10 stacks" where the part shows none.
function more(left: number, shown: number, word: string): string {
  return shown === 0 ? `… ${counted(left, word)}` : `… and ${counted(left, `more ${word}`)}`;
}

// The line of counts: of the blocks, with those of each status that marks
// one, of the links and of the stacks.
function countsLine(blocks: number, links: number, stacks: number, statuses: readonly (BlockStatus | undefined)[]): string {
  const marked = MARKED.flatMap((status) => {
    const count = statuses.filter((held) => held?.status === status).length;
    return count === 0 ? [] : [`${String(count)} ${status}`];
  });
  return `${String(blocks)} block(s)${marked.length === 0 ? "" : ` (${marked.join(", ")})`}, ${String(links)} link(s), ${String(stacks)} stack(s).`;
}

// The blocks in the order in which the section lists them: those that failed
// or are invalid, the block that has focus, the blocks that changed, those
// on screen and then the rest, each group in the board's order.
function blockOrder(
  core: Pick<Core, "focus" | "onScreen">,
  blocks: readonly (readonly [string, Block])[],
  statuses: ReadonlyMap<string, BlockStatus | undefined>,
  changed: ReadonlySet<string>,
): (readonly [string, Block])[] {
  const focused = core.focus.get();
  const shown = new Set(core.onScreen.get()?.blocks ?? []);
  const groups: readonly ((id: string) => boolean)[] = [
    (id) => {
      const status = statuses.get(id)?.status;
      return status !== undefined && WRONG.has(status);
    },
    (id) => id === focused,
    (id) => changed.has(id),
    (id) => shown.has(id),
    () => true,
  ];
  const order = new Map<string, Block>();
  for (const inGroup of groups) for (const [id, block] of blocks) if (!order.has(id) && inGroup(id)) order.set(id, block);
  return [...order];
}

// The links into each block, in the board's order, by the block's id.
function linksInto(links: readonly (readonly [string, Link])[]): Map<string, (readonly [string, Link])[]> {
  const into = new Map<string, (readonly [string, Link])[]>();
  for (const entry of links) into.set(entry[1].to, [...(into.get(entry[1].to) ?? []), entry]);
  return into;
}

// The block's line: its id, its class, the names of its state args and its
// markers, then the links into it after an arrow, each as the input that it
// feeds, the block that it comes from and its id, as in
// `<- x: flights (keen_finch)`. A link into a variadic block feeds no input
// by name, as in `<- head (l3)`.
function blockLine(id: string, block: Block, status: BlockStatus | undefined, into: readonly (readonly [string, Link])[]): string {
  const line = withMarkers(`- ${id} <${block.registry_id}>${joinNames(Object.keys(block.state))}`, status);
  if (into.length === 0) return line;
  const fed = into.map(([link, { from, input }]) => `${input === "" ? "" : `${input}: `}${from} (${link})`);
  return `${line} <- ${fed.join(", ")}`;
}

// The stack's line: its id and name, then the blocks of it that the section
// lists, in the stack's order, and a count of its others, as in
// `- s1 "Input": iris, head and 8 more blocks`.
function stackLine(id: string, name: string, held: readonly string[], listed: ReadonlySet<string>): string {
  const shown = held.filter((block) => listed.has(block));
  const others = held.length - shown.length;
  const tail = others === 0 ? "" : ` and ${counted(others, "more block")}`;
  return `- ${id} "${name}"${held.length === 0 ? "" : `: ${shown.join(", ")}${tail}`}`;
}

// The names given after a space, separated by commas, or nothing for none.
function joinNames(names: readonly string[]): string {
  return names.length === 0 ? "" : ` ${names.join(", ")}`;
}

// The line with the block's markers after it, where it has any: its status,
// where it holds no current result, and the counts of its conditions.
function withMarkers(line: string, status: BlockStatus | undefined): string {
  if (status === undefined) return line;
  const counts = (["error", "warning", "message"] as const).flatMap((severity) => {
    const count = status.conditions.filter((condition) => condition.severity === severity).length;
    return count === 0 ? [] : [`${ICONS[severity]} ${counted(count, severity)}`];
  });
  const markers = [...(NO_RESULT.has(status.status) ? [`[${status.status}]`] : []), ...(counts.length === 0 ? [] : [`[${counts.join(", ")}]`])];
  return markers.length === 0 ? line : `${line} ${markers.join(" ")}`;
}
