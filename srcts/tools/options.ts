// The tool list_board_options, which lists every board option that a loaded
// package defines, so that the model can set one that nothing on the page
// uses yet, such as n_rows before any table is drawn
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.2#the-tools).
// It gives the value of each board option that the board holds, and no value
// for the others, since core puts a default on the board only once something
// on the page requires the board option. It gives no default, which today's
// gave beside the value (R/tools-options.R at fcbdb27), since the board's
// value is the default where nobody set one.

import type { Json } from "@blockr/core";
import { object } from "../commands/index.ts";
import type { ToolContext } from "./context.ts";
import { json, tool } from "./tool.ts";
import type { Tool } from "./tool.ts";

export function optionTools({ core }: ToolContext): Tool[] {
  return [
    tool<Record<string, never>>({
      name: "list_board_options",
      description:
        "List every board option that the app's packages define, such as the rows that a table shows, each with its id, its label, its category and the JSON Schema of its value, and the value that the board holds, where it holds one. The board holds the value of each board option that something on the page uses, its default where nobody set one, and blockr.core-set_option sets any board option, on a locked board too.",
      parameters: object({}, []),
      run: () =>
        Promise.resolve(
          json(
            Object.values(core.options.registered()).map((option) => {
              const value = core.options.value(option.id);
              const listed: Record<string, Json> = {
                id: option.id,
                label: option.label,
                category: option.category,
                schema: option.schema,
                ...(value === undefined ? {} : { value }),
              };
              return listed;
            }),
          ),
        ),
    }),
  ];
}
