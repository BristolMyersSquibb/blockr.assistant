// Sending the user's message, which starts a turn
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-message-field-and-a-turn):
// 1. Where no conversation is open, the chat adds one with an id that it
//    mints, through blockr.assistant-add_conversation, and opens it. The
//    conversation is titled "New conversation" until a model call titles it
//    or the user renames it, and starts on the pick of the model that the
//    chat gives, which the footer shows while no conversation is open
//    (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-model).
// 2. The chat adds the user's message to the conversation, through
//    blockr.assistant-add_message.
// 3. The chat asks the turns for a turn in the conversation, which runs from
//    the class's start, so that it goes on once the panel closes.
// Steps 1 and 2 go through the plugin's conversations, so where
// chat_save_turns is 0 they change the plugin's memory alone.
// The chat sends only while no turn runs on the board, as the message field
// and the greeting's suggestions hold back a send until the turn ends.

import type { Assistant } from "../assistant/index.ts";
import { NEW_CONVERSATION, newId } from "../state/index.ts";
import type { ConversationId } from "../state/index.ts";

// Sends the text as the user's message in the open conversation, or in one
// that it adds where none is open, with the pick of the model given, which it
// hands opened() before it adds the message. It resolves once the turn has
// started, and rejects where the message does not enter the conversation.
export async function sendMessage(
  assistant: Assistant,
  open: ConversationId | undefined,
  text: string,
  pick: string | null,
  opened: (conversation: ConversationId) => void,
): Promise<void> {
  const { conversations, turns } = assistant;
  let conversation = open;
  if (conversation === undefined) {
    conversation = newId();
    await conversations.addConversation(conversation, NEW_CONVERSATION, pick);
    opened(conversation);
  }
  await conversations.addMessage(conversation, { id: newId(), role: "user", parts: [{ type: "text", text }], created: new Date().toISOString() });
  // The turn writes what it does to the conversation and raises what fails,
  // so the chat waits for nothing of it. It rejects only at once, where
  // another turn started meanwhile or the board closed, and the message then
  // stays in the conversation, unanswered.
  void turns.run(conversation).catch(() => undefined);
}
