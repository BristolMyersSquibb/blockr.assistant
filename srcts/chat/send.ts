// Sending the user's message, which starts a turn
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-message-field-and-a-turn):
// 1. Where no conversation is open, the chat adds one with an id that it
//    mints, through blockr.assistant-add_conversation, and opens it. The
//    conversation is titled "New conversation" until the user renames it.
// 2. The chat adds the user's message to the conversation, through
//    blockr.assistant-add_message.
// 3. The chat asks the turns for a turn in the conversation, which runs from
//    the class's start, so that it goes on once the panel closes.
// Steps 1 and 2 go through the plugin's conversations, so where
// chat_save_turns is 0 they change the plugin's memory alone.
// The chat sends only while no turn runs on the board, as the message field
// and the greeting's suggestions hold back a send until the turn ends.

import type { Assistant } from "../assistant/index.ts";
import { newId } from "../state/index.ts";
import type { ConversationId } from "../state/index.ts";

// The title of a conversation that the chat adds.
export const NEW_CONVERSATION = "New conversation";

// Sends the text as the user's message in the open conversation, or in one
// that it adds where none is open, which it hands opened() before it adds
// the message. It resolves once the turn has started, and rejects where the
// message does not enter the conversation.
export async function sendMessage(
  assistant: Assistant,
  open: ConversationId | undefined,
  text: string,
  opened: (conversation: ConversationId) => void,
): Promise<void> {
  const { conversations, turns } = assistant;
  let conversation = open;
  if (conversation === undefined) {
    conversation = newId();
    await conversations.addConversation(conversation, NEW_CONVERSATION);
    opened(conversation);
  }
  await conversations.addMessage(conversation, { id: newId(), role: "user", parts: [{ type: "text", text }], created: new Date().toISOString() });
  // The turn writes what it does to the conversation and raises what fails,
  // so the chat waits for nothing of it. It rejects only at once, where
  // another turn started meanwhile or the board closed, and the message then
  // stays in the conversation, unanswered.
  void turns.run(conversation).catch(() => undefined);
}
