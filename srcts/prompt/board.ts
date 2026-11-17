// The Board section, which the message of the app's holds after the
// conversation's last message, written from what CoreApi gives as each call
// goes out, in place of R's describe_board()
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.5#the-sections).
// It keeps today's headings, lines and markers (R/describe-board.R at
// fcbdb27), with the client's names in place of R's:
// - A line of counts, then the blocks, the links, the stacks and the board
//   options that the board holds. An empty board has the line of counts alone,
//   marked as empty, as today's has.
// - Each block with its id, the registry id of its class in place of its S3
//   class, and the names of its state args, none marked with *, since every
//   block's state is open to external control on a board that is not locked.
//   Its markers follow: its status, where it holds no current result, and the
//   counts of its conditions by severity.
// - Each stack by its id and name with its blocks, without the S3 class.
// - The app's plugins in place of the extensions, but for the assistant's
//   own, which list_plugins leaves out too. Each comes by its name and the id
//   of its class, with the description of the schema of its class's state,
//   where the schema gives one.
// - Where the dock is the frontend and has more than one view, its views,
//   each with the panels that it shows and the active one marked (./dock.ts).
// - The new tools and commands in place of those that today's lines name:
//   list_plugins in place of list_extensions, get_plugin_state in place of
//   list_views and blockr.core-set_option in place of set_board_option.
// Each part is cut at assistant_board_section_max_chars, with the tool that
// gives the rest, as today's parts are, so that a long list of blocks leaves
// room for the parts after it.

import type { BlockStatus, CoreApi } from "@blockr/core";
import { ASSISTANT } from "../state/index.ts";
import { cutText } from "../tools/index.ts";
import { DOCK, dockViews } from "./dock.ts";

// What of CoreApi the section reads.
export type Core = Pick<CoreApi, "store" | "scheduler" | "options" | "plugins">;

// The statuses under which a block holds no current result, which its line
// marks.
const NO_RESULT: ReadonlySet<BlockStatus["status"]> = new Set(["waiting", "invalid", "failed", "unevaluated", "stale"]);

// The icon of each severity of a condition, in the order of the marker.
const ICONS = { error: "✖", warning: "⚠", message: "ℹ" } as const;

// The Board section of the board as it is now, each part cut at `max`
// characters.
export function boardSection(core: Core, max: number): string {
  const board = core.store.board();
  const blocks = Object.entries(board.blocks);
  const links = Object.entries(board.links);
  const stacks = Object.entries(board.stacks);
  const counts = `${String(blocks.length)} block(s), ${String(links.length)} link(s), ${String(stacks.length)} stack(s).`;
  const part = (heading: string, lines: readonly string[], tool: string): string[] =>
    lines.length === 0 ? [] : [cutText([`### ${heading}`, ...lines].join("\n"), max, `call ${tool} for the full list`)];

  const parts =
    blocks.length + links.length + stacks.length === 0
      ? [`${counts} (empty board -- no blocks yet)`]
      : [
          counts,
          "",
          ...part("Blocks", blocks.map(([id, block]) => withMarkers(`- ${id} <${block.registry_id}>${joinNames(Object.keys(block.state))}`, core.scheduler.status(id))), "list_blocks"),
          ...part("Links", links.map(([id, { from, to, input }]) => `- ${id}: ${from} -> ${to}${input === "" ? "" : `$${input}`}`), "list_links"),
          ...part("Stacks", stacks.map(([id, { name, blocks: held }]) => `- ${id} "${name}"${held.length === 0 ? "" : `: ${held.join(", ")}`}`), "list_stacks"),
          ...optionPart(core, Object.keys(board.options), part),
        ];
  return ["## Board", ...parts, ...part("Plugins", pluginLines(core), "list_plugins"), ...part("Views", viewLines(core), `get_plugin_state("${DOCK}")`)].join("\n");
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
    return count === 0 ? [] : [`${ICONS[severity]} ${String(count)} ${severity}${count === 1 ? "" : "s"}`];
  });
  const markers = [...(NO_RESULT.has(status.status) ? [`[${status.status}]`] : []), ...(counts.length === 0 ? [] : [`[${counts.join(", ")}]`])];
  return markers.length === 0 ? line : `${line} ${markers.join(" ")}`;
}

// The board options that the board holds, each with its category, where a
// loaded package defines it, and how to read and set their values.
function optionPart(core: Core, ids: readonly string[], part: (heading: string, lines: readonly string[], tool: string) => string[]): string[] {
  if (ids.length === 0) return [];
  const registered = core.options.registered();
  const lines = ids.map((id) => {
    const category = Object.hasOwn(registered, id) ? registered[id]?.category : undefined;
    return category === undefined ? `- ${id}` : `- ${id} (${category})`;
  });
  return part("Options", [...lines, "Current values via list_board_options; change with blockr.core-set_option."], "list_board_options");
}

// The app's plugins but for the assistant's own, each with the description of
// the schema of its class's state, on a line of its own.
function pluginLines(core: Core): string[] {
  return Object.entries(core.plugins.appPlugins())
    .filter(([id]) => id !== ASSISTANT)
    .flatMap(([id, { name }]) => {
      const described = core.plugins.pluginClass(id).state?.schema.description;
      const line = `- ${name} (id: ${id})`;
      return typeof described === "string" && described.trim() !== "" ? [line, `  ${described.replace(/\s+/g, " ").trim()}`] : [line];
    });
}

// The dock's views, where the dock is the frontend and has more than one.
function viewLines(core: Core): string[] {
  const views = dockViews(core);
  if (views === undefined || views.views.length <= 1) return [];
  return views.views.map(({ id, name, panels }) => {
    const active = views.active?.id === id ? " (active)" : "";
    return `- ${name} (id: ${id})${active} ${panels.length === 0 ? "(empty)" : panels.join(", ")}`;
  });
}
