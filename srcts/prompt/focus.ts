// The Focus section, which the message of the app's holds after the Board
// section: what the user has on screen as the call goes out, under today's
// preamble on the block last clicked (R/system-prompt.R at fcbdb27)
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.5#the-sections).
// - Where the dock is the frontend, the active view (./dock.ts).
// - The blocks and the plugins on screen, from CoreApi.onScreen, where the
//   frontend sets it, but for the assistant's own plugin, which the Board
//   section leaves out too
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.1.12#what-a-frontend-offers-other-plugins).
//   Where every block of the board is on screen, one line says so, as today's
//   says that the view shows every block. Where none is, a line says that
//   too, since onScreen tells a frontend that shows nothing from one that
//   says nothing.
// - The block that has focus, from CoreApi.focus, where one has.
// Where it has nothing to say, the message of the app's has no Focus
// section, as today's prompt has none.

import type { CoreApi } from "@blockr/core";
import { ASSISTANT } from "../state/index.ts";
import { dockViews } from "./dock.ts";
import preamble from "./focus-preamble.md" with { type: "text" };

// What of CoreApi the section reads.
export type Core = Pick<CoreApi, "store" | "plugins" | "focus" | "onScreen">;

// The Focus section as the user's screen is now, or undefined where it has
// nothing to say.
export function focusSection(core: Core): string | undefined {
  const { blocks } = core.store.board();
  const lines: string[] = [];

  const active = dockViews(core)?.active;
  if (active !== undefined && active !== null) lines.push(`The active view is ${active.name} (id: ${active.id}).`);

  const shown = core.onScreen.get();
  if (shown !== null) {
    const held = Object.keys(blocks);
    const seen = [...new Set(shown.blocks)].filter((id) => Object.hasOwn(blocks, id));
    if (held.length > 0 && seen.length === 0) lines.push("No block is on screen.");
    else if (held.length > 0 && seen.length === held.length) lines.push("Every block on the board is on screen.");
    else if (seen.length > 0) lines.push("These blocks are on screen:", ...seen.map((id) => `- ${id}`));

    const plugins = core.plugins.appPlugins();
    const named = [...new Set(shown.plugins)].flatMap((id) => {
      const plugin = id === ASSISTANT || !Object.hasOwn(plugins, id) ? undefined : plugins[id];
      return plugin === undefined ? [] : [`- ${plugin.name} (id: ${id})`];
    });
    if (named.length > 0) lines.push("These plugins are on screen:", ...named);
  }

  const focused = core.focus.get();
  if (focused !== null && Object.hasOwn(blocks, focused)) lines.push(`Block ${focused} has focus.`);

  return lines.length === 0 ? undefined : ["## Focus", preamble.trim(), "", ...lines].join("\n");
}
