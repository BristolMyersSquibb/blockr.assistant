// Reading the assistant's state on the board, and what the commands and the
// plugin's memory share in changing a conversation
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.3#how-much-of-a-conversation-the-state-keeps):
// - A note of what others changed in the board is a message of the role user
//   that holds parts of the type changes alone. The plugin adds it before a
//   call, so it is no message that the user sent.
// - An exchange starts at a message that the user sent, or at a summary,
//   which counts as one message and as an exchange of its own.
// - A cap of `keep` messages drops the oldest exchanges of a conversation
//   until the messages left number `keep` or fewer, counting no note, and it
//   never drops the last exchange, however many messages that holds. So what
//   is left starts on a message that the user sent, or on a summary.

import type { Board, Json } from "@blockr/core";
import type { AssistantState, Conversation, ConversationId, Message, MessageId, Usage } from "./types.ts";

// The id of the assistant's plugin class, under which the board holds the
// assistant's state, at /plugins/blockr.assistant-assistant_plugin.
export const ASSISTANT = "blockr.assistant-assistant_plugin";

// The assistant's state on the board, or undefined where the board holds
// none, as where the app does not run the assistant. The store has checked
// the state against its schema.
export function assistantState(board: Board): AssistantState | undefined {
  const state = board.plugins[ASSISTANT];
  return isObject(state) && isObject(state.conversations) ? (state as AssistantState) : undefined;
}

// The conversation that the assistant's state on the board holds under the
// id, or undefined.
export function findConversation(board: Board, id: ConversationId): Conversation | undefined {
  const conversations = assistantState(board)?.conversations;
  return conversations !== undefined && Object.hasOwn(conversations, id) ? conversations[id] : undefined;
}

// The JSON Pointer from the board's root to the segments given, inside the
// assistant's state.
export function at(...segments: string[]): string {
  return ["plugins", ASSISTANT, ...segments].map((segment) => `/${segment.replaceAll("~", "~0").replaceAll("/", "~1")}`).join("");
}

// A new id for a message or a conversation: 128 random bits, as hex.
// They come from crypto.getRandomValues(), which a page has over plain HTTP
// too, where it lacks crypto.randomUUID().
export function newId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// A conversation that holds no message, which spent no token, added now.
export function newConversation(title: string, model: string | null): Conversation {
  return { title, updated: new Date().toISOString(), messages: [], usage: { input: 0, output: 0, last: 0 }, model };
}

// The usage of a conversation once a call's input and output tokens are
// added, with every token of the call, `total`, as its last.
export function addedUsage(usage: Usage, input: number, output: number, total: number): Usage {
  return { input: usage.input + input, output: usage.output + output, last: total };
}

// Whether a conversation holds a message under the id.
export function holdsMessage(conversation: Conversation, id: MessageId): boolean {
  return conversation.messages.some((message) => message.id === id);
}

// Whether a summary can take the place of the messages before `from`: the
// messages hold `from`, and none from it on has the summary's id.
export function canCompact(messages: readonly Message[], summary: Message, from: MessageId): boolean {
  const index = messages.findIndex((message) => message.id === from);
  return index >= 0 && messages.slice(index).every((message) => message.id !== summary.id);
}

// Whether a message is a note of what others changed in the board.
export function isNote(message: Message): boolean {
  return message.role === "user" && message.parts.length > 0 && message.parts.every((part) => part.type === "changes");
}

// How many of the oldest messages a cap of `keep` drops: none where the
// messages number `keep` or fewer, notes left out, and otherwise those before
// the oldest exchange from which they do, or before the last exchange where
// it alone holds more. Where no message opens an exchange, it drops none.
export function messagesToDrop(messages: readonly Message[], keep: number): number {
  let counted = 0;
  let fits: number | undefined;
  let last: number | undefined;

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message === undefined) continue;
    if (!isNote(message)) counted += 1;
    if (opensExchange(message)) {
      last ??= i;
      if (counted <= keep) fits = i;
    }
  }

  if (counted <= keep) return 0;
  return fits ?? last ?? 0;
}

// Whether a message opens an exchange: one that the user sent, or a summary.
export function opensExchange(message: Message): boolean {
  return message.role === "summary" || (message.role === "user" && !isNote(message));
}

function isObject(value: Json | undefined): value is Readonly<Record<string, Json>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
