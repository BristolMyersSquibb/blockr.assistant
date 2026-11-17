// When a conversation needs a summary, and how much of it the summary keeps
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.3#compaction),
// until the comparisons of the assistant's benchmark settle both
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.8.1#the-decisions-it-compares):
// - A conversation needs a summary once the tokens of its last call, its
//   usage.last, pass its model's context window less 16,384 tokens, which pi's
//   own CLI keeps free for the reply.
// - Where a conversation holds a summary, its usage.last counts only once a
//   reply was made after the summary. Until then, usage.last counts a call
//   that went out before the summary, and so sent the messages that the
//   summary replaced. A reply carries the time at which its call went out, as
//   pi stamps it.
// - The summary keeps the newest exchanges that together hold a quarter of the
//   window or less. So what it keeps starts on a message that the user sent,
//   as what the state keeps does (../state/state.ts). Where the last exchange
//   alone holds more, the summary keeps no message.
// - The summary covers at least one reply beyond an earlier summary, so where
//   the conversation holds no reply, there is nothing to summarize.
// The tokens of a message are estimated at four characters to a token, with
// 1,200 tokens for each image, as pi's CLI estimates them.

import { opensExchange } from "../state/index.ts";
import type { Conversation, Message } from "../state/index.ts";

// The tokens of the window that the rule keeps free for the reply.
export const RESERVE = 16_384;

// The tokens that an image is estimated at.
export const IMAGE_TOKENS = 1_200;

// Whether the conversation's usage.last counts a call that sent the
// conversation as it is now: the call spent tokens, and no summary came after
// the call went out.
export function lastIsCurrent(conversation: Conversation): boolean {
  if (conversation.usage.last === 0) return false;
  const summary = conversation.messages.find((message) => message.role === "summary");
  if (summary === undefined) return true;
  const summarized = Date.parse(summary.created);
  return conversation.messages.some((message) => message.role === "assistant" && Date.parse(message.created) > summarized);
}

// Whether the conversation needs a summary, under the context window of its
// model, in tokens.
export function needsSummary(conversation: Conversation, window: number): boolean {
  return lastIsCurrent(conversation) && conversation.usage.last > window - RESERVE;
}

// How many tokens of the newest messages a summary keeps, under the context
// window of the model, in tokens.
export function keptTokens(window: number): number {
  return Math.floor(window / 4);
}

// The index of the first message that a summary keeps, the number of messages
// where it keeps none, or undefined where the messages hold nothing to
// summarize. It keeps the newest exchanges whose messages hold `kept` tokens
// or fewer, but none from the first reply back.
export function firstKept(messages: readonly Message[], kept: number): number | undefined {
  const reply = messages.findIndex((message) => message.role === "assistant");
  if (reply < 0) return undefined;
  let tokens = 0;
  let first = messages.length;
  for (let i = messages.length - 1; i > reply; i -= 1) {
    const message = messages[i];
    if (message === undefined) continue;
    tokens += estimatedTokens(message);
    if (tokens > kept) break;
    if (opensExchange(message)) first = i;
  }
  return first;
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
