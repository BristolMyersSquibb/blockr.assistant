// The tools that read results, through requests that R answers:
// get_block_result, which sends describe_result for one block, and
// inspect_results, which sends the model's R code
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.2#the-requests-in-r).
// - Core has the blocks that a request reads evaluated first, even off
//   screen, and sends the request only once each reads ready. Otherwise it
//   rejects with their statuses, which the tool gives the model.
// - The tool inspect_results refuses on a locked board before it sends
//   anything, so that core evaluates none of the blocks that the request
//   reads, and the model learns of the lock rather than of a block's status
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.2#on-a-locked-board).
//   R refuses the request there too.
// - R caps what it writes: what describe_result() writes at
//   assistant_summary_max_chars, what the code prints at
//   assistant_eval_max_chars, and the plots at assistant_plot_render_max,
//   each drawn within assistant_plot_render_range.

import { object } from "../commands/index.ts";
import { answeredObject, answeredText, answeredTexts } from "../requests/index.ts";
import { ASSISTANT } from "../state/index.ts";
import { own } from "./context.ts";
import type { ToolContext } from "./context.ts";
import { noBlock, noBlocks } from "./failures.ts";
import { tool } from "./tool.ts";
import type { Tool } from "./tool.ts";

const LOCKED = "The board is locked, so the assistant runs no R code of its own.";

interface Inspection {
  readonly code: string;
  readonly blocks: readonly string[];
  readonly width?: number;
  readonly height?: number;
}

export function resultTools({ core }: ToolContext): Tool[] {
  return [
    tool<{ readonly id: string }>({
      name: "get_block_result",
      description:
        "Give what blockr writes about one block's result for you, such as a data frame's columns and rows, or a short description of another kind of result. Core evaluates the block first, wherever it is. Where the block or one upstream of it fails, the tool gives its status and why. Use inspect_results for what this does not give.",
      parameters: object({ id: { type: "string", description: "The block's id, as list_blocks gives it." } }, ["id"]),
      run: async ({ id }, signal) => {
        if (own(core.store.board().blocks, id) === undefined) throw new Error(noBlock(id));
        const answer = answeredObject(await core.request(ASSISTANT, "describe_result", {}, { reads: [id], signal }), "describe_result");
        return answeredText(own(answer, id) ?? null, "describe_result");
      },
    }),

    tool<Inspection>({
      name: "inspect_results",
      description:
        "Evaluate R code on the results of the blocks that you name in `blocks`, each bound by its block id, so that `utils::head(data)` reads the result of the block `data`. Core evaluates those blocks first. The tool gives what the code prints, and the value of the last expression where it is visible, as R's console prints it, so an assignment or an `invisible()` result prints nothing. The output is cut at a budget of characters, so print only what you need. A data frame prints every row and column, so check its size and columns with `dim()` and `names()` first, then print the rows and columns that you need. A tibble prints only its first rows, rounds numbers and may shorten text, so read exact values from a column itself, as `x$col`. Only base R is attached, so call each function of another package with its namespace, as `graphics::hist()`, `stats::median()` or `ggplot2::ggplot()`. The code runs with a graphics device open, and up to four of the plots that it draws come back as images beside the text. The result of a block that draws a plot, a `captured_plot` or a ggplot, draws again when it is printed, so the code `chart` draws the result of the block `chart`. Use this for what no other tool gives, such as unique values, group counts, filters and joins across blocks, and what you need to see drawn. It changes nothing on the board, and on a locked board it runs no code.",
      parameters: object(
        {
          code: {
            type: "string",
            description: "The R code to evaluate. It may hold several expressions, and the value of the last is printed where it is visible.",
          },
          blocks: {
            type: "array",
            items: { type: "string" },
            description: "The ids of the blocks whose results the code reads, each bound by its id. Give an empty array for code that reads none.",
          },
          width: {
            type: "integer",
            description:
              "The width in pixels of the device that the code draws on, which sizes plots and leaves printed text alone. Optional: 768 by default, within 200 to 2000, unless the deployment sets others. Raise it for a dense plot that you need to read values off, and lower it where the shape is all you need.",
          },
          height: {
            type: "integer",
            description:
              "The height in pixels of the device that the code draws on, which sizes plots and leaves printed text alone. Optional: 768 by default, within 200 to 2000, unless the deployment sets others.",
          },
        },
        ["code", "blocks"],
      ),
      run: async ({ code, blocks, width, height }, signal) => {
        if (core.lock.board) throw new Error(LOCKED);
        const board = core.store.board();
        const absent = blocks.filter((block) => own(board.blocks, block) === undefined);
        if (absent.length > 0) throw new Error(noBlocks(absent));
        const given = { code, ...(width === undefined ? {} : { width }), ...(height === undefined ? {} : { height }) };
        const answer = answeredObject(
          await core.request(ASSISTANT, "inspect_results", given, { reads: [...blocks], signal }),
          "inspect_results",
        );
        return {
          text: answeredText(answer.output ?? null, "inspect_results"),
          isError: false,
          images: answeredTexts(answer.plots, "inspect_results").map((data) => ({ data, mimeType: "image/png" })),
        };
      },
    }),
  ];
}
