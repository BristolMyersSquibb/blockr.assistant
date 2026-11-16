// What the model reads of the conditions of R's reply to a tool's request
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.2#how-failures-reach-the-model):
// - The tool takes them from R's reply itself, ok or error, so that core
//   raises no notification for them. The user learns of them from the model.
// - The result gives each warning and message on a line of its own, in the
//   order that R raised them. They come after what R answered, or after R's
//   error where R replied error. So the model learns, for instance, that its
//   code introduced NAs by coercion.
// - They are cut at assistant_eval_max_chars, the cap of what the model's own
//   code prints, since a loop can raise a warning on each of its runs.

import type { Condition, CoreApi, Json, RequestOpts } from "@blockr/core";
import { failureMessage, isRequestError, sendRequest } from "../requests/index.ts";
import type { Reply } from "../requests/index.ts";
import { readToolCap } from "./caps.ts";
import { cutText } from "./cut.ts";

// What of CoreApi a tool's request reads.
type Core = Pick<CoreApi, "request" | "blockrOption">;

// Sends the request `name` of a tool, as sendRequest() does. Where R replies
// error with warnings or messages, it rejects with R's error followed by them.
// Otherwise it rejects as core rejects, and the tool's result gives what
// failureText() writes.
export async function toolRequest(
  core: Core,
  name: string,
  args: Readonly<Record<string, Json>>,
  opts: Omit<RequestOpts, "conditions"> = {},
): Promise<Reply> {
  try {
    return await sendRequest(core, name, args, opts);
  } catch (error) {
    if (!isRequestError(error) || !error.conditions.some(isWarningOrMessage)) throw error;
    throw new Error(await withConditions(core, failureMessage(error), error.conditions), { cause: error });
  }
}

// The text, followed after an empty line by the warnings and messages of the
// conditions, cut at assistant_eval_max_chars. Where the conditions hold none,
// the text stays as it is.
export async function withConditions(core: Pick<CoreApi, "blockrOption">, text: string, conditions: readonly Condition[]): Promise<string> {
  const lines = conditions.filter(isWarningOrMessage).map(({ severity, message }) => `${severity === "warning" ? "Warning" : "Message"}: ${message}`);
  if (lines.length === 0) return text;
  const listed = cutText(lines.join("\n"), await readToolCap(core, "assistant_eval_max_chars"));
  return text === "" ? listed : `${text}\n\n${listed}`;
}

function isWarningOrMessage(condition: Condition): boolean {
  return condition.severity !== "error";
}
