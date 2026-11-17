// What the chat shows of a conversation, as the messages that assistant-ui
// draws (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-message-field-and-a-turn).
// The chat hands assistant-ui three kinds of item, in the order of the
// conversation:
// - A message that the user sent, which shows its text and the name of each
//   file that it holds. It leaves out the text of a skill that the user called
//   with /name, so that a slash command shows as the user typed it.
// - A summary, which shows as a message of its own, of assistant-ui's role
//   system.
// - A turn: the replies and the results of their tool calls after a message
//   that the user sent or a summary, up to the next one, with what the turn
//   that runs holds that the conversation does not hold yet. A turn shows as
//   one reply of assistant-ui's, in which each tool call carries its result:
//   each reply's reasoning, which the memory keeps, then its text and its tool
//   calls, and at the end why the turn failed, where it failed.
// A note of what others changed shows nothing, since the user sees on the
// board what changed, and it does not end a turn.
// A reply streams only after the message that opened the turn or after the
// results of the calls before it. So where the turn's last message is a
// reply, the reply that the turn holds as it streams has entered the
// conversation already, in the moment before the turn lets it go, and the
// chat shows it once, from the conversation.
//
// A turn keeps its id while it runs, the id of the message that opened it
// with "-turn", so that React keeps what it drew of the turn as its first
// reply enters the conversation, as a row that the user opened. The chat
// gives assistant-ui the same item while nothing of it changed, so that
// assistant-ui converts only what changed as a reply streams.

import type { ThreadMessageLike } from "@assistant-ui/react";
import type { Kept, KeptImage } from "../conversations/index.ts";
import type { Answered, Streamed } from "../loop/index.ts";
import { isNote } from "../state/index.ts";
import type { Message, MessageId, Part } from "../state/index.ts";
import type { Running } from "../turns/index.ts";

type Content = Exclude<ThreadMessageLike["content"], string>[number];

// The replies of a turn and the results of their tool calls, with what the
// memory keeps of each, and what the turn that runs holds that the
// conversation does not hold yet.
export interface Turn {
  readonly kind: "turn";
  readonly id: string;
  readonly messages: readonly Message[];
  readonly kept: readonly (Kept | undefined)[];
  // Why the turn failed, which the memory keeps by the message at which the
  // turn ended.
  readonly failure: string | undefined;
  // The results of the tool calls that returned while the turn runs.
  readonly results: Readonly<Record<string, Answered>> | undefined;
  // The reply as it streams.
  readonly reply: Streamed | undefined;
}

// An item that the chat shows: a message that the user sent, a summary, or a
// turn.
export type Shown = Message | Turn;

// The result of a tool call, as the chat shows it.
export interface ShownResult {
  readonly text: string;
  // The images of the result that the memory keeps.
  readonly images: readonly KeptImage[];
  // How many images the result carried, which the state counts.
  readonly count: number;
}

// The data part that holds why a turn failed.
export const FAILURE = "failure";

// The data part that names a file that the user attached.
export const ATTACHMENT = "attachment";

// The turns that the chat gave last, by the message that opened each.
const given = new WeakMap<Message, Turn>();

// What the chat shows of a conversation, given its messages, the turn that
// runs in it, if any, and what the memory keeps of each message.
export function shownOf(messages: readonly Message[], running: Running | undefined, kept: (message: MessageId) => Kept | undefined): Shown[] {
  const shown: Shown[] = [];
  let opener: Message | undefined;
  let span: Message[] = [];
  let failure: string | undefined;

  const end = (last: boolean): void => {
    const results = last ? running?.results : undefined;
    const reply = last && span.at(-1)?.role !== "assistant" ? running?.reply : undefined;
    if (span.length > 0 || failure !== undefined || (results !== undefined && Object.keys(results).length > 0) || reply !== undefined) {
      shown.push(turnOf(opener, span, span.map((message) => kept(message.id)), failure, results, reply));
    }
    span = [];
    failure = undefined;
  };

  for (const message of messages) {
    const held = kept(message.id);
    if (isNote(message)) {
      failure = held?.failure ?? failure;
    } else if (message.role === "user" || message.role === "summary") {
      end(false);
      shown.push(message);
      opener = message;
      failure = held?.failure;
    } else {
      span.push(message);
      failure = held?.failure ?? failure;
    }
  }
  end(true);
  return shown;
}

// The message that assistant-ui draws of an item.
export function threadMessageOf(shown: Shown): ThreadMessageLike {
  if ("kind" in shown) return turnMessage(shown);
  const createdAt = new Date(shown.created);
  if (shown.role === "summary") return { role: "system", id: shown.id, createdAt, content: [{ type: "text", text: textOf(shown.parts) }] };
  return { role: "user", id: shown.id, createdAt, content: userContent(shown.parts) };
}

// The tool calls that the turn that runs waits for: those of the reply as it
// streams, and those of the conversation's last message where it is a reply,
// whose results have not entered the conversation.
export function waitingCalls(messages: readonly Message[], running: Running | undefined): ReadonlySet<string> {
  if (running === undefined) return new Set();
  const last = messages.at(-1);
  const calls = [...(last?.role === "assistant" ? last.parts : []), ...(running.reply?.parts ?? [])];
  return new Set(calls.flatMap((part) => (part.type === "tool_call" && !Object.hasOwn(running.results, part.id) ? [part.id] : [])));
}

// The turn after the message that opened it, the same object as last time
// where nothing of it changed.
function turnOf(
  opener: Message | undefined,
  messages: readonly Message[],
  kept: readonly (Kept | undefined)[],
  failure: string | undefined,
  results: Turn["results"],
  reply: Turn["reply"],
): Turn {
  const anchor = opener ?? messages[0];
  const last = anchor === undefined ? undefined : given.get(anchor);
  if (
    last !== undefined &&
    same(last.messages, messages) &&
    same(last.kept, kept) &&
    last.failure === failure &&
    last.results === results &&
    last.reply === reply
  ) {
    return last;
  }
  const turn: Turn = { kind: "turn", id: `${anchor?.id ?? "start"}-turn`, messages, kept, failure, results, reply };
  if (anchor !== undefined) given.set(anchor, turn);
  return turn;
}

function turnMessage(turn: Turn): ThreadMessageLike {
  const results = resultsOf(turn);
  const content: Content[] = [];
  for (const [index, message] of turn.messages.entries()) {
    if (message.role === "assistant") content.push(...replyContent(turn.kept[index]?.reasoning ?? [], message.parts, results));
  }
  if (turn.reply !== undefined) content.push(...replyContent(turn.reply.reasoning, turn.reply.parts, results));
  if (turn.failure !== undefined) content.push({ type: `data-${FAILURE}`, data: turn.failure });
  const first = turn.messages[0];
  return { role: "assistant", id: turn.id, ...(first === undefined ? {} : { createdAt: new Date(first.created) }), content };
}

// The result of each tool call of the turn, by call: those that entered the
// conversation, with the images that the memory keeps, then those that the
// turn that runs holds.
function resultsOf(turn: Turn): ReadonlyMap<string, { readonly result: ShownResult; readonly error: boolean }> {
  const results = new Map<string, { readonly result: ShownResult; readonly error: boolean }>();
  for (const [index, message] of turn.messages.entries()) {
    if (message.role !== "tool") continue;
    const images = turn.kept[index]?.images ?? {};
    for (const part of message.parts) {
      if (part.type !== "tool_result") continue;
      const kept = Object.hasOwn(images, part.id) ? (images[part.id] ?? []) : [];
      results.set(part.id, { result: { text: part.text, images: kept, count: part.images ?? 0 }, error: part.error === true });
    }
  }
  for (const [id, answered] of Object.entries(turn.results ?? {})) {
    if (!results.has(id)) results.set(id, { result: { text: answered.text, images: answered.images, count: answered.images.length }, error: answered.isError });
  }
  return results;
}

// A reply's reasoning, then its text and its tool calls, each call with its
// result where it has one.
function replyContent(reasoning: readonly string[], parts: readonly Part[], results: ReturnType<typeof resultsOf>): Content[] {
  const thought = reasoning.filter((text) => text.trim() !== "").map((text): Content => ({ type: "reasoning", text }));
  const said = parts.flatMap((part): Content[] => {
    switch (part.type) {
      case "text":
        return part.text === "" ? [] : [{ type: "text", text: part.text }];
      case "tool_call": {
        const answered = results.get(part.id);
        return [
          {
            type: "tool-call",
            toolCallId: part.id,
            toolName: part.tool,
            args: part.args,
            ...(answered === undefined ? {} : { result: answered.result, isError: answered.error }),
          },
        ];
      }
      default:
        return [];
    }
  });
  return [...thought, ...said];
}

function userContent(parts: readonly Part[]): Content[] {
  return parts.flatMap((part): Content[] => {
    switch (part.type) {
      case "text":
        return [{ type: "text", text: part.text }];
      case "attachment":
        return [{ type: `data-${ATTACHMENT}`, data: { name: part.name, media_type: part.media_type } }];
      default:
        return [];
    }
  });
}

function textOf(parts: readonly Part[]): string {
  return parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n\n");
}

function same<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}
