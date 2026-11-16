// The tools that read the links and the stacks of the board: list_links,
// list_stacks and describe_stack
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.2#the-tools).
// Each reads the board as it is now. The tool describe_stack cuts its text at
// assistant_summary_max_chars, as today's does (R/tools-read.R at fcbdb27).

import { object } from "../commands/index.ts";
import { readToolCap } from "./caps.ts";
import { own } from "./context.ts";
import type { ToolContext } from "./context.ts";
import { cutText } from "./cut.ts";
import { noStack } from "./failures.ts";
import { json, tool } from "./tool.ts";
import type { Tool } from "./tool.ts";

export function boardTools({ core }: ToolContext): Tool[] {
  return [
    tool<Record<string, never>>({
      name: "list_links",
      description:
        "List every link between blocks, each with its id, the block that it comes from, the block that it goes to, and the data input of that block that it feeds.",
      parameters: object({}, []),
      run: () =>
        Promise.resolve(json(Object.entries(core.store.board().links).map(([id, { from, to, input }]) => ({ id, from, to, input })))),
    }),

    tool<Record<string, never>>({
      name: "list_stacks",
      description:
        "List every stack on the board, each with its id, its name and the ids of its blocks. Call describe_stack for one stack's color and its blocks with their names and statuses.",
      parameters: object({}, []),
      run: () =>
        Promise.resolve(
          json(Object.entries(core.store.board().stacks).map(([id, { name, blocks }]) => ({ id, name, blocks: [...blocks] }))),
        ),
    }),

    tool<{ readonly id: string }>({
      name: "describe_stack",
      description: "Describe one stack on the board: its name, its color, and its blocks, each with its id, its name and its status.",
      parameters: object({ id: { type: "string", description: "The stack's id, as list_stacks gives it." } }, ["id"]),
      run: async ({ id }) => {
        if (own(core.store.board().stacks, id) === undefined) throw new Error(noStack(id));
        const max = await readToolCap(core, "assistant_summary_max_chars");
        // The board as it is once the cap is read.
        const board = core.store.board();
        const stack = own(board.stacks, id);
        if (stack === undefined) throw new Error(noStack(id));
        const described = {
          id,
          name: stack.name,
          color: stack.color,
          blocks: stack.blocks.map((block) => ({
            id: block,
            name: own(board.blocks, block)?.name ?? null,
            status: core.scheduler.status(block)?.status ?? null,
          })),
        };
        return cutText(json(described), max, "call list_stacks for every block of the stack");
      },
    }),
  ];
}
