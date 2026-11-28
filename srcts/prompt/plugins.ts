// The section on the app's plugins and on the board options that its
// packages define, which the system prompt holds after the rules, since
// neither changes while the board is open, so that the cache serves it rather
// than each call reading it anew
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.5#the-sections).
// It holds two parts, which the Board section held until then, with today's
// lines (R/describe-board.R at fcbdb27):
// - The app's plugins in place of the extensions, but for the assistant's
//   own, which list_plugins leaves out too. Each comes by its name and the id
//   of its class, as `package::id`, with the description of the schema of its
//   class's state, where the schema gives one.
// - The board options that the app's packages define, from
//   options.registered(), rather than those that the board holds, each with
//   its category, and how to read and set their values.
// Each part is cut at assistant_board_section_max_chars, with the tool that
// gives the rest. Where the app runs no other plugin and its packages define
// no board option, the system prompt has no such section.

import type { CoreApi } from "@blockr/core";
import { idForModel } from "../ids/index.ts";
import { assistantClassId } from "../state/index.ts";
import { cutText } from "../tools/index.ts";

// What of CoreApi the section reads.
export type Core = Pick<CoreApi, "options" | "plugins" | "id">;

// The section as the app's plugins and board options are now, each part cut
// at `max` characters, or undefined where it has neither.
export function pluginsSection(core: Core, max: number): string | undefined {
  const part = (heading: string, lines: readonly string[], tool: string): string[] =>
    lines.length === 0 ? [] : [cutText([`### ${heading}`, ...lines].join("\n"), max, `call ${tool} for the full list`)];
  const parts = [...part("Plugins", pluginLines(core), "list_plugins"), ...part("Options", optionLines(core), "list_board_options")];
  return parts.length === 0 ? undefined : ["## Plugins and board options", ...parts].join("\n");
}

// The app's plugins but for the assistant's own, each with the description of
// the schema of its class's state, on a line of its own.
function pluginLines(core: Core): string[] {
  const assistant = assistantClassId(core);
  return [...core.plugins.appPlugins()]
    .filter(([id]) => id !== assistant)
    .flatMap(([id, { name }]) => {
      const described = core.plugins.pluginClass(id).state?.schema.description;
      const line = `- ${name} (id: ${idForModel(id)})`;
      return typeof described === "string" && described.trim() !== "" ? [line, `  ${described.replace(/\s+/g, " ").trim()}`] : [line];
    });
}

// The board options that the app's packages define, each with its category,
// and how to read and set their values.
function optionLines(core: Core): string[] {
  const options = Object.values(core.options.registered());
  if (options.length === 0) return [];
  return [...options.map(({ id, category }) => `- ${id} (${category})`), "Current values via list_board_options; change with blockr.core::set_option."];
}
