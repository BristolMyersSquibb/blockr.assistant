// What the model reads of the conditions of R's reply to a tool's request
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.2#how-failures-reach-the-model):
// - The tool takes the notifications of R's reply through the request's
//   notifier, ok or error, so that core raises none of them
//   (../requests/requests.ts). The user learns of them from the model.
// - The result gives each warning and message on a line of its own, in the
//   order that R first raised each. They come after what R answered. Where R
//   replied error, they come after R's error, read from the conditions with
//   which the request rejects. So the model learns, for instance, that its
//   code introduced NAs by coercion.
// - Core makes a single notification of the conditions of a reply that share
//   their severity, class and message. So a warning that the model's code
//   raises on each run of a loop gives one line, where R replied ok.
// - They are cut at assistant_eval_max_chars, the cap of what the model's own
//   code prints, since a loop can raise a warning with another message on
//   each of its runs.

import type { Condition, CoreApi, Json, RequestOpts } from "@blockr/core";
import { failureMessage, isRequestError, sendRequest } from "../requests/index.ts";
import type { Reply } from "../requests/index.ts";
import { readToolCap } from "./caps.ts";
import { cutText } from "./cut.ts";

// What of CoreApi a tool's request reads.
type Core = Pick<CoreApi, "request" | "blockrOption" | "id">;

// Sends the request `name` of a tool, as sendRequest() does. Where R replies
// error with warnings or messages, it rejects with R's error followed by them.
// Otherwise it rejects as core rejects, and the tool's result gives what
// failureText() writes.
export async function toolRequest(
  core: Core,
  name: string,
  args: Readonly<Record<string, Json>>,
  opts: Omit<RequestOpts, "notifier"> = {},
): Promise<Reply> {
  try {
    return await sendRequest(core, name, args, opts);
  } catch (error) {
    if (!isRequestError(error) || !error.conditions.some(isWarningOrMessage)) throw error;
    throw new Error(await withConditions(core, failureMessage(error), error.conditions), { cause: error });
  }
}

// The text, followed after an empty line by the warnings and messages of the
// conditions, cut at assistant_eval_max_chars. The conditions are those of
// R's reply, each as its notification, which core hands the request's
// notifier, or as a reply of error rejects with it. Where they hold no warning
// or message, the text stays as it is.
export async function withConditions(
  core: Pick<CoreApi, "blockrOption">,
  text: string,
  conditions: readonly Pick<Condition, "severity" | "message">[],
): Promise<string> {
  const lines = conditions.filter(isWarningOrMessage).map(({ severity, message }) => `${severity === "warning" ? "Warning" : "Message"}: ${message}`);
  if (lines.length === 0) return text;
  const listed = cutText(lines.join("\n"), await readToolCap(core, "assistant_eval_max_chars"));
  return text === "" ? listed : `${text}\n\n${listed}`;
}

function isWarningOrMessage(condition: Pick<Condition, "severity">): boolean {
  return condition.severity !== "error";
}
