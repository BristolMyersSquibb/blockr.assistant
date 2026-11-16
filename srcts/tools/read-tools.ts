// The assistant's read tools, which read the board, the block registry, the
// registered commands, the app's plugins, the board options and each block's
// status in the browser, through CoreApi, and send R a request only for what
// needs R: a block's result, the model's own R code and a skill's text
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.2#the-tools).
// The read tools that carry over from today keep today's names, and pi runs
// the calls of each at once, its default, since none changes the board.

import type { CoreApi } from "@blockr/core";
import type { Skills } from "../skills/index.ts";
import { boardTools } from "./board.ts";
import { blockTypeTools } from "./block-types.ts";
import { blockTools } from "./blocks.ts";
import { commandTools } from "./commands.ts";
import { optionTools } from "./options.ts";
import { pluginTools } from "./plugins.ts";
import { skillTools } from "./read-skill.ts";
import { resultTools } from "./results.ts";
import type { Tool } from "./tool.ts";

// The read tools on the CoreApi of the open board, which read the skills
// that R listed for it, in the order of the page's table.
export function readTools(core: CoreApi, skills: Skills): Tool[] {
  const context = { core, skills };
  return [
    ...blockTools(context),
    ...boardTools(context),
    ...blockTypeTools(context),
    ...commandTools(context),
    ...pluginTools(context),
    ...optionTools(context),
    ...resultTools(context),
    ...skillTools(context),
  ];
}
