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
// - The plugin takes the notifications of R's reply to each of its requests
//   through the request's notifier, ok or error, so that core raises none of
//   them. Core makes a notification for each condition of the reply, and a
//   single one for conditions that share their severity, class and message.
//   The tools hand them to the model, and the skills, the template and the
//   model settings drop them, since R logs each condition
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.2#how-failures-reach-the-model,
//   https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.1.14#taking-a-calls-notifications).
// - A reply of error still rejects with its conditions, from which the
//   plugin reads R's error.

import type { CoreApi, Json, Notification, RequestError, RequestOpts } from "@blockr/core";
import { assistantClassId } from "../state/index.ts";

// R's answer to one of the assistant's requests, and the notifications of R's
// reply, which core handed the request's notifier: the messages and warnings
// that R raised as it answered, in the order that R first raised each.
export interface Reply {
  readonly answer: Json | Blob;
  readonly notifications: readonly Notification[];
}

// Sends the assistant's request `name`, and resolves with R's answer and the
// notifications of R's reply, which the caller hands on itself. It rejects as
// CoreApi.request() does, so that a reply of error rejects with its
// conditions.
export async function sendRequest(
  core: { readonly request: CoreApi["request"]; readonly id: CoreApi["id"] },
  name: string,
  args: Readonly<Record<string, Json>>,
  opts: Omit<RequestOpts, "notifier"> = {},
): Promise<Reply> {
  let notifications: readonly Notification[] = [];
  const answer = await core.request(assistantClassId(core), name, args, {
    ...opts,
    notifier: (given) => {
      notifications = given;
    },
  });
  return { answer, notifications };
}

// Sends the assistant's request `name` as sendRequest() does, and sends it
// again each time R's session ends before R replies, for a request that
// changes nothing in R, as core sends a request for a blockr option again.
// It rejects as sendRequest() does otherwise, and once the signal aborts.
export async function sendUntilReplied(
  core: { readonly request: CoreApi["request"]; readonly id: CoreApi["id"] },
  name: string,
  args: Readonly<Record<string, Json>>,
  opts: Omit<RequestOpts, "notifier"> = {},
): Promise<Reply> {
  for (;;) {
    try {
      return await sendRequest(core, name, args, opts);
    } catch (error) {
      if (!isSessionEnded(error) || opts.signal?.aborted === true) throw error;
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
