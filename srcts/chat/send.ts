// Sending the user's message, which starts a turn
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-message-field-and-a-turn):
// 1. Where no conversation is open, the chat adds one with an id that it
//    mints, through blockr.assistant-add_conversation, and opens it. The
//    conversation is titled "New conversation" until a model call titles it
//    or the user renames it, and starts on the picks of the model and of the
//    thinking level that the chat gives, which the footer shows while no
//    conversation is open
//    (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-model).
// 2. The chat adds the user's message to the conversation, through
//    blockr.assistant-add_message. The message holds the text that the user
//    typed, if any, and then a part of the type attachment for each file that
//    the user attached, which names the file and its media type. The files'
//    content goes into the plugin's memory with the message
//    (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#attachments).
//    The message of a skill that the user called with /name holds the line
//    that the user typed and then a part of the type skill, with the skill's
//    name and its text, which the loop sends to the model and the transcript
//    leaves out
//    (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#slash-commands).
// 3. The chat asks the turns for a turn in the conversation, which runs from
//    the class's start, so that it goes on once the panel closes.
// Steps 1 and 2 go through the plugin's conversations, so where
// chat_save_turns is 0 they change the plugin's memory alone.
// The chat sends only while no turn runs on the board, as the message field
// and the greeting's suggestions hold back a send until the turn ends.

import type { Assistant } from "../assistant/index.ts";
import type { KeptFile, Picks } from "../conversations/index.ts";
import { NEW_CONVERSATION, newId } from "../state/index.ts";
import type { ConversationId, Part } from "../state/index.ts";

// A file that the user attached to the message: its name, its media type and
// its content, as the plugin's memory keeps it.
export interface Attached {
  readonly name: string;
  readonly mediaType: string;
  readonly kept: KeptFile;
}

// A skill that the user called with /name: its name and its text, as R read
// it.
export interface Called {
  readonly name: string;
  readonly text: string;
}

// Sends the text and the files as the user's message in the open
// conversation, or in one that it adds where none is open, with the picks
// given, which it hands opened() before it adds the message. The message
// carries the skill given after the text, if any. It resolves once
// the turn has started, and rejects where the message does not enter the
// conversation.
export async function sendMessage(
  assistant: Assistant,
  open: ConversationId | undefined,
  text: string,
  files: readonly Attached[],
  picks: Picks,
  opened: (conversation: ConversationId) => void,
  skill?: Called,
): Promise<void> {
  const { conversations, turns } = assistant;
  let conversation = open;
  if (conversation === undefined) {
    conversation = newId();
    await conversations.addConversation(conversation, NEW_CONVERSATION, picks);
    opened(conversation);
  }
  const parts: Part[] = [
    ...(text.trim() === "" ? [] : [{ type: "text" as const, text }]),
    ...(skill === undefined ? [] : [{ type: "skill" as const, name: skill.name, text: skill.text }]),
    ...files.map((file) => ({ type: "attachment" as const, name: file.name, media_type: file.mediaType })),
  ];
  const message = { id: newId(), role: "user" as const, parts, created: new Date().toISOString() };
  await conversations.addMessage(conversation, message, files.length === 0 ? undefined : { files: files.map((file) => file.kept) });
  // The turn writes what it does to the conversation and raises what fails,
  // so the chat waits for nothing of it. It rejects only at once, where
  // another turn started meanwhile or the board closed, and the message then
  // stays in the conversation, unanswered.
  void turns.run(conversation).catch(() => undefined);
}
