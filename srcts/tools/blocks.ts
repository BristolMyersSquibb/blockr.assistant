// The tools that read the blocks of the board: list_blocks, describe_block,
// get_block_state and get_block_conditions
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.2#the-tools).
// Each reads the board as it is now and evaluates nothing, so it says of a
// block that reads stale or unevaluated that it does.
// - The tool describe_block bounds its text as today's does
//   (R/tools-read.R and R/describe-block.R at fcbdb27): it leaves out each
//   value of the state whose JSON takes more than
//   assistant_state_value_max_chars, and cuts the whole at
//   assistant_summary_max_chars. It gives the state last, so that the cut
//   takes the state before anything else, and both marks name
//   get_block_state.
// - The tool get_block_state bounds the state at assistant_state_max_chars,
//   which its strings spend in order.

import type { Json } from "@blockr/core";
import { object } from "../commands/index.ts";
import { readToolCap } from "./caps.ts";
import { own, skillsNaming } from "./context.ts";
import type { ToolContext } from "./context.ts";
import { bounded, cutText, leaveOutLong } from "./cut.ts";
import { noBlock } from "./failures.ts";
import { conditionList, conditionsBySeverity, statusNote } from "./statuses.ts";
import { json, tool } from "./tool.ts";
import type { Tool } from "./tool.ts";

const STATE_HINT = "call get_block_state for the full argument values";

const ID = { type: "string", description: "The block's id, as list_blocks gives it." } as const;

export function blockTools(context: ToolContext): Tool[] {
  const { core } = context;

  // The block on the board, or a failure that it is not there.
  const found = (id: string) => {
    const block = own(core.store.board().blocks, id);
    if (block === undefined) throw new Error(noBlock(id));
    return block;
  };

  return [
    tool<Record<string, never>>({
      name: "list_blocks",
      description:
        "List every block on the board, each with its id, its name, the registry id of its block class and its status. A `ready` block holds a current result. An `unevaluated` block has not been evaluated yet. A `stale` block holds a result that is out of date, since something that it depends on has changed after its last evaluation. Core evaluates only what something needs, such as the blocks on screen, so a block off screen may stay `unevaluated` or `stale`, which is no failure. The tools get_block_result and inspect_results have the blocks that they read evaluated first. A `waiting`, `invalid` or `failed` block could not produce a result, and describe_block says why.",
      parameters: object({}, []),
      run: () => {
        const { blocks } = core.store.board();
        return Promise.resolve(
          json(
            Object.entries(blocks).map(([id, block]) => ({
              id,
              name: block.name,
              registry_id: block.registry_id,
              status: core.scheduler.status(id)?.status ?? null,
            })),
          ),
        );
      },
    }),

    tool<{ readonly id: string }>({
      name: "describe_block",
      description:
        "Describe one block on the board: its name, the registry id of its block class, its status, why it is `invalid` or `waiting` where it is, the one-line summary of its result, its conditions, the skills of this deployment that name its class, its data inputs, the links into them, and its state. The state is a summary: a value too long to show is left out and marked, so read the block's state with get_block_state before you change a value that you have not seen whole. A skill named here is more specific than the class's guidance and wins where the two differ; load one with read_skill. The tool evaluates nothing. For a `stale` or `unevaluated` block, a note says what that means.",
      parameters: object({ id: ID }, ["id"]),
      run: async ({ id }) => {
        const [skills, valueMax, summaryMax] = await Promise.all([
          skillsNaming(context, "blocks", found(id).registry_id),
          readToolCap(core, "assistant_state_value_max_chars"),
          readToolCap(core, "assistant_summary_max_chars"),
        ]);
        // The board as it is once the skills and the caps are read.
        const board = core.store.board();
        const block = found(id);
        const status = core.scheduler.status(id);
        const reason = status?.reason ?? null;
        const summary = status?.summary ?? null;
        const note = statusNote(status);
        const described = {
          id,
          name: block.name,
          registry_id: block.registry_id,
          status: status?.status ?? null,
          ...(reason === null ? {} : { reason }),
          ...(note === undefined ? {} : { note }),
          ...(summary === null ? {} : { summary }),
          conditions: conditionList(status?.conditions ?? []),
          ...(skills.length === 0 ? {} : { skills }),
          inputs: [...(own(core.blockRegistry(), block.registry_id)?.inputs ?? [])],
          links: Object.entries(board.links)
            .filter(([, link]) => link.to === id)
            .map(([link, { from, input }]) => ({ id: link, from, input })),
          state: leaveOutLong(block.state, valueMax, STATE_HINT),
        };
        return cutText(json(described), summaryMax, STATE_HINT);
      },
    }),

    tool<{ readonly id: string }>({
      name: "get_block_state",
      description:
        "Give one block's state in full: the value of each of its arguments, as the board holds it, where describe_block shows a summary that leaves out long values. Read the state here before you change a value that you have not seen whole, since an edit sets each value that it changes as a whole. Configuration only: get_block_result and inspect_results read a block's result.",
      parameters: object({ id: ID }, ["id"]),
      run: async ({ id }) => {
        found(id);
        const max = await readToolCap(core, "assistant_state_max_chars");
        // The state as the board holds it once the cap is read.
        return json({ id, state: bounded(found(id).state, max) });
      },
    }),

    tool<{ readonly id: string }>({
      name: "get_block_conditions",
      description:
        "Give the conditions of one block's latest evaluation, the errors, warnings and messages that it raised, by severity, each with the phase that raised it. A block that failed holds no result, so its error shows here. The tool evaluates nothing. An `unevaluated` block has raised nothing yet, and the conditions of a `stale` block come from an evaluation before its latest change, so for either an empty list means unknown rather than healthy.",
      parameters: object({ id: ID }, ["id"]),
      run: ({ id }) => {
        found(id);
        const status = core.scheduler.status(id);
        const note = statusNote(status);
        const given: Record<string, Json> = {
          id,
          status: status?.status ?? null,
          ...(note === undefined ? {} : { note }),
          conditions: conditionsBySeverity(status?.conditions ?? []),
        };
        return Promise.resolve(json(given));
      },
    }),
  ];
}
