// When a conversation needs a summary, and where the summary cuts it, as pi's
// own CLI has both
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.3#compaction),
// until the comparisons of the assistant's benchmark settle them
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.8.1#the-decisions-it-compares):
// - A conversation needs a summary once the tokens that its next call would
//   send pass the model's context window less 16,384 tokens, which pi's CLI
//   keeps free for the reply.
// - Those tokens are the tokens of the last call, which usage.last keeps,
//   and an estimate of the messages that entered after the last reply.
//   Where no reply came after the conversation's summary, usage.last counts
//   a call that sent the messages that the summary replaced, so the estimate
//   covers every message. A reply carries the time at which its call went
//   out, as pi stamps it.
// - The summary keeps the newest messages that hold a quarter of the window,
//   where pi's CLI keeps 20,000 tokens, which would pass the rule itself on a
//   window of 32,000. The cut falls before a message that the user sent or
//   before a reply, never before the results of a reply's tool calls.
// - Where the cut falls inside an exchange, a summary of its own covers the
//   exchange's start, so that the model knows what the user asked, as pi's
//   CLI splits such a turn.
// - An earlier summary goes to the call that writes the next one, which
//   updates it rather than summarizing it again.
// The tokens of a message are estimated at four characters to a token, with
// 1,200 tokens for each image, as pi's CLI estimates them.

import { opensExchange } from "../state/index.ts";
import type { Conversation, Message } from "../state/index.ts";

// The tokens of the window that the rule keeps free for the reply.
export const RESERVE = 16_384;

// The tokens that an image is estimated at.
export const IMAGE_TOKENS = 1_200;

// Where a summary cuts a conversation's messages, by their indexes.
export interface Cut {
  // The first message that the summary covers: the one after an earlier
  // summary, or the first.
  readonly start: number;
  // The first message that the conversation keeps after the summary.
  readonly first: number;
  // Where the cut falls inside an exchange, the message that opened the
  // exchange. The messages from it to the cut get a summary of their own.
  readonly turnStart: number | undefined;
}

// The tokens that the conversation's next call would send, as estimated.
export function contextTokens(conversation: Conversation): number {
  const { messages, usage } = conversation;
  const summary = messages.find((message) => message.role === "summary");
  let reply = messages.length - 1;
  while (reply >= 0 && messages[reply]?.role !== "assistant") reply -= 1;
  const replied = messages[reply];
  const counts = replied !== undefined && usage.last > 0 && (summary === undefined || Date.parse(replied.created) > Date.parse(summary.created));
  const estimated = (from: number): number => messages.slice(from).reduce((sum, message) => sum + estimatedTokens(message), 0);
  return counts ? usage.last + estimated(reply + 1) : estimated(0);
}

// Whether the conversation needs a summary, under the context window of its
// model, in tokens.
export function needsSummary(conversation: Conversation, window: number): boolean {
  return contextTokens(conversation) > window - RESERVE;
}

// How many tokens of the newest messages a summary keeps, under the context
// window of the model, in tokens.
export function keptTokens(window: number): number {
  return Math.floor(window / 4);
}

// Where a summary cuts the messages, so that the messages from the cut on
// hold about `kept` tokens, or undefined where the summary would cover
// nothing. As pi's CLI finds the cut, it walks back from the newest message
// until the messages hold `kept` tokens, and cuts before the first message
// from there on that may start what is kept.
export function cutOf(messages: readonly Message[], kept: number): Cut | undefined {
  const start = messages[0]?.role === "summary" ? 1 : 0;
  const cuts = messages.flatMap((message, index) => (index >= start && message.role !== "tool" ? [index] : []));
  if (cuts.length === 0) return undefined;

  let first = cuts[0] ?? start;
  let tokens = 0;
  for (let i = messages.length - 1; i >= start; i -= 1) {
    const message = messages[i];
    if (message === undefined) continue;
    tokens += estimatedTokens(message);
    if (tokens >= kept) {
      first = cuts.find((cut) => cut >= i) ?? cuts.at(-1) ?? first;
      break;
    }
  }

  const opener = messages[first];
  const turnStart = opener === undefined || opensExchange(opener) ? undefined : exchangeStart(messages, first, start);
  const history = (turnStart ?? first) - start;
  const prefix = turnStart === undefined ? 0 : first - turnStart;
  return history > 0 || prefix > 0 ? { start, first, turnStart } : undefined;
}

// The message that opened the exchange in which the message at the index
// lies, searching back no further than `start`, or undefined.
function exchangeStart(messages: readonly Message[], index: number, start: number): number | undefined {
  for (let i = index - 1; i >= start; i -= 1) {
    const message = messages[i];
    if (message !== undefined && opensExchange(message)) return i;
  }
  return undefined;
}

// The tokens of a message, as estimated: the characters that its parts hold,
// by four, and the tokens of the images that its tool results carried.
export function estimatedTokens(message: Message): number {
  let characters = 0;
  let images = 0;
  for (const part of message.parts) {
    switch (part.type) {
      case "text":
      case "changes":
        characters += part.text.length;
        break;
      case "skill":
        characters += part.name.length + part.text.length;
        break;
      case "tool_call":
        characters += part.tool.length + JSON.stringify(part.args).length;
        break;
      case "tool_result":
        characters += part.text.length;
        images += part.images ?? 0;
        break;
      case "attachment":
        characters += part.name.length + part.media_type.length;
        break;
    }
  }
  return Math.ceil(characters / 4) + images * IMAGE_TOKENS;
}
