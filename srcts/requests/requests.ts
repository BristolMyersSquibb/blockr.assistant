// What the plugin sends with the assistant's requests and reads of R's
// answers and failures. R answers each request through the method of
// plugin_requests() for the assistant's class (R/plugin-requests.R)
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.2#the-requests-in-r).
// - R writes an answer with every vector as an array, so a string arrives as
//   an array that holds it alone.
// - The requests list_skills and read_skill read the skills of the app's
//   packages, which the plugin names: those of R's reply to `hello`, which the
//   store holds.
// - Core rejects a request with a RequestError where a block that it reads is
//   not ready, or where R replies error, and with a SessionEndedError where
//   R's session ends before R replies. Core exports neither class to plugins,
//   so the plugin tells them by their names.
// - The plugin takes the conditions of R's reply to each of its requests
//   itself, ok or error, so that core raises no notification for them. The
//   tools hand them to the model, and the skills drop them, since R logs each
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.2#how-failures-reach-the-model).

import type { Condition, CoreApi, Json, RequestError, RequestOpts } from "@blockr/core";
import { ASSISTANT } from "../state/index.ts";

// R's answer to one of the assistant's requests, and the conditions of R's
// reply: the messages and warnings that R raised as it answered, in the order
// that R raised them.
export interface Reply {
  readonly answer: Json | Blob;
  readonly conditions: readonly Condition[];
}

// Sends the assistant's request `name`, and resolves with R's answer and the
// conditions of R's reply, which the caller hands on itself. It rejects as
// CoreApi.request() does, so that a reply of error rejects with its
// conditions.
export async function sendRequest(
  core: { readonly request: CoreApi["request"] },
  name: string,
  args: Readonly<Record<string, Json>>,
  opts: Omit<RequestOpts, "conditions"> = {},
): Promise<Reply> {
  let conditions: readonly Condition[] = [];
  const answer = await core.request(ASSISTANT, name, args, {
    ...opts,
    conditions: (given) => {
      conditions = given;
    },
  });
  return { answer, conditions };
}

// What a request that the plugin sends as each board opens gives, and what it
// raises where it fails.
export interface OnOpen<T> {
  // What the plugin makes of R's answer, which throws for an answer that it
  // cannot read.
  readonly read: (answer: Json | Blob) => T;
  // What the plugin holds where the request fails, or where the next board
  // opens before R replies.
  readonly fallback: T;
  // The code of the error that a failure raises, and its message, written
  // from why the request failed.
  readonly code: string;
  readonly message: (why: string) => string;
}

// Sends the assistant's request `name` as a board opens, as the skills send
// list_skills and the template read_template, and resolves with what R's
// answer gives. It never rejects:
// - Where R's session ends before R replies, it sends the request again,
//   since the request changes nothing, as core asks again for a blockr option.
// - Where R replies error, or R's answer cannot be read, it raises the error
//   of the code given, from start, and resolves with the fallback. Core
//   withdraws the error as the next board opens, which is also when the plugin
//   sends the request again, so the plugin withdraws nothing itself
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#what-fails).
// - Where the signal aborts first, as the next board opens, it raises nothing
//   and resolves with the fallback.
// - It drops the conditions of R's reply, ok or error, since R logs each. So
//   core raises no notification for them, and R's error reaches the user only
//   in the error of the code given.
export async function requestOnOpen<T>(
  core: { readonly request: CoreApi["request"]; readonly notifications: Pick<CoreApi["notifications"], "notify"> },
  signal: AbortSignal,
  name: string,
  args: Readonly<Record<string, Json>>,
  given: OnOpen<T>,
): Promise<T> {
  for (;;) {
    try {
      const { answer } = await sendRequest(core, name, args, { signal });
      return given.read(answer);
    } catch (error) {
      if (signal.aborted) return given.fallback;
      if (isSessionEnded(error)) continue;
      core.notifications.notify(ASSISTANT, { severity: "error", code: given.code, message: given.message(failureMessage(error)) });
      return given.fallback;
    }
  }
}

// The names of the app's packages, those of R's reply to `hello`.
export function appPackages(core: { readonly store: Pick<CoreApi["store"], "packages"> }): string[] {
  return Object.keys(core.store.packages());
}

// The string that R wrote, as an array of one, in its answer to the request
// `name`.
export function answeredText(answer: Json | Blob, name: string): string {
  if (isArray(answer) && answer.length === 1 && typeof answer[0] === "string") return answer[0];
  throw new TypeError(`R answered the request ${name} with ${shown(answer)}, where it writes one string.`);
}

// The strings that R wrote, as an array, in its answer to the request `name`.
export function answeredTexts(answer: Json | undefined, name: string): string[] {
  if (answer !== undefined && isArray(answer) && answer.every((value) => typeof value === "string")) return [...answer];
  throw new TypeError(`R answered the request ${name} with ${shown(answer ?? null)}, where it writes strings.`);
}

// The object that R wrote in its answer to the request `name`.
export function answeredObject(answer: Json | Blob, name: string): Readonly<Record<string, Json>> {
  if (answer !== null && typeof answer === "object" && !isArray(answer) && !(answer instanceof Blob)) return answer;
  throw new TypeError(`R answered the request ${name} with ${shown(answer)}, where it writes an object.`);
}

// Whether a request failed as core rejects it with a RequestError: a block
// that it reads is not ready, or R replied error, missing or cancelled.
export function isRequestError(error: unknown): error is RequestError {
  return error instanceof Error && error.name === "RequestError";
}

// Whether a request failed since R's session ended before R replied, after
// which core does not send it again.
export function isSessionEnded(error: unknown): boolean {
  return error instanceof Error && error.name === "SessionEndedError";
}

// What R said in its error reply to a request, or else the error's message.
export function failureMessage(error: unknown): string {
  if (isRequestError(error)) {
    const said = error.conditions.filter((condition) => condition.severity === "error").map((condition) => condition.message);
    if (said.length > 0) return said.join("\n");
  }
  return error instanceof Error ? error.message : String(error);
}

function isArray(value: Json | Blob): value is readonly Json[] {
  return Array.isArray(value);
}

// The answer as the message names it: the JSON that R wrote, or a file.
function shown(answer: Json | Blob): string {
  return answer instanceof Blob ? "a file" : JSON.stringify(answer);
}
