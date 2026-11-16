// The caps on what the tools return, which are today's blockr options at
// today's defaults (R/utils-bounds.R and R/stage-review.R at fcbdb27)
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.2#the-tools).
// A tool reads each cap that it needs through CoreApi.blockrOption(), which
// asks R once per page. The caps of what R writes, such as the text of
// describe_result(), R reads itself.
// - A cap is the default below where nothing sets it.
// - A string, as an environment variable gives, reads as the number that it
//   holds, so that "200" is 200.
// - Any other value than a whole number of 0 or more fails the tool, with a
//   message that names the value as R sent it, so that no cap holds that
//   nobody set.

import type { CoreApi } from "@blockr/core";
import { sentNumber } from "../blockr-options/index.ts";

const DEFAULTS = {
  // What describe_block and describe_stack give, and what describe_result()
  // writes, which R cuts.
  assistant_summary_max_chars: 2000,
  // What get_block_state and get_plugin_state give.
  assistant_state_max_chars: 20000,
  // A value of the state that describe_block gives.
  assistant_state_value_max_chars: 128,
  // A description in a list: of a block class, a command or a plugin.
  assistant_description_max_chars: 1000,
  // The description of a skill that names a class.
  assistant_skill_description_max_chars: 1024,
  // What the model's own R code prints, which R cuts, and the warnings and
  // messages of R's reply to a tool's request.
  assistant_eval_max_chars: 16000,
  // The blocks that the review of an edit covers.
  assistant_review_max_blocks: 50,
} as const;

export type Cap = keyof typeof DEFAULTS;

export async function readToolCap(core: Pick<CoreApi, "blockrOption">, name: Cap): Promise<number> {
  const sent = await core.blockrOption(name);
  if (sent === undefined) return DEFAULTS[name];
  const value = sentNumber(sent);
  if (Number.isInteger(value) && value >= 0) return value;
  throw new RangeError(`The blockr option ${name} is ${JSON.stringify(sent)}, where it takes a whole number of 0 or more.`);
}
