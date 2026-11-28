// The assistant's commands, one for each change to its state, which its UI
// and its loop run through the plugin's conversations
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.3#commands).
// - Each reads the assistant's state on the board and returns one delta of
//   patches inside it, which the store checks against the state's schema.
// - None takes an undo step, so that no undo takes back a message or a
//   conversation's pick of the model or of the thinking level (./command.ts).
// - Each passes its preflight on a locked board, since it changes the
//   assistant's own state alone, so that a reader of a locked board still
//   chats.
// - A command that names a conversation fails its preflight where the state
//   lacks that conversation. Both add_conversation and add_message fail
//   theirs for an id that the state holds already, and so does
//   compact_conversation for a summary whose id a message that it keeps has,
//   which keeps the ids unique, as no schema can.
// - Each that cuts a conversation to `keep` messages drops its oldest
//   exchanges, as messagesToDrop() counts them (../state/state.ts).
// Each gives its id within the package, as "add_message", and core registers
// it under the package of the assistant's plugin class, as
// core.id("blockr.assistant", "add_message") names it.
// Their descriptions and the schemas of their args describe them to menus and
// to the assistant's tools.

import type { Board, Command, Json, Patch } from "@blockr/core";
import { addedUsage, assistantState, at, canCompact, findConversation, holdsMessage, messagesToDrop, newConversation } from "../state/index.ts";
import type { ConversationId, Message, MessageId, ThinkingLevel } from "../state/index.ts";
import { command } from "./command.ts";
import * as schemas from "./schemas.ts";

interface AddConversation {
  readonly id: ConversationId;
  readonly title: string;
  readonly model?: string | null;
  readonly thinking_level?: ThinkingLevel | null;
}

interface AddMessage {
  readonly conversation: ConversationId;
  readonly message: Message;
  readonly keep?: number;
}

interface CompactConversation {
  readonly conversation: ConversationId;
  readonly summary: Message;
  readonly from: MessageId;
}

interface AddUsage {
  readonly conversation: ConversationId;
  readonly input: number;
  readonly output: number;
  readonly total?: number;
}

// Whether the assistant's state on the board holds the conversation.
function holds(board: Board, conversation: ConversationId): boolean {
  return findConversation(board, conversation) !== undefined;
}

// The patches that drop the oldest `count` messages of the conversation.
function drops(conversation: ConversationId, count: number): Patch[] {
  return Array.from({ length: count }, () => ({ op: "remove", path: at("conversations", conversation, "messages", "0") }));
}

export const assistantCommands: readonly Command<Json, unknown>[] = [
  command<AddConversation>({
    id: "add_conversation",
    label: "Add conversation",
    description:
      "Adds a conversation that holds no message, under the id given, with its title, its pick of the model, or null for the default where that is left out, and its pick of the thinking level, which it lacks where that is null or left out. It fails its preflight for an id that a conversation has already.",
    args: schemas.object(
      {
        id: { type: "string", minLength: 1, description: "The id of the new conversation." },
        title: schemas.title,
        model: schemas.model,
        thinking_level: schemas.thinkingLevel,
      },
      ["id", "title"],
    ),
    preflight: (board, { id }) => {
      const state = assistantState(board);
      return state !== undefined && !Object.hasOwn(state.conversations, id);
    },
    run: (_board, { id, title, model, thinking_level: level }) => ({
      patches: [{ op: "add", path: at("conversations", id), value: newConversation(title, model ?? null, level) }],
    }),
  }),

  command<{ readonly conversation: ConversationId; readonly title: string }>({
    id: "rename_conversation",
    label: "Rename conversation",
    description: "Gives a conversation a new title.",
    args: schemas.object({ conversation: schemas.conversation, title: schemas.title }, ["conversation", "title"]),
    preflight: (board, { conversation }) => holds(board, conversation),
    run: (_board, { conversation, title }) => ({
      patches: [{ op: "replace", path: at("conversations", conversation, "title"), value: title }],
    }),
  }),

  command<{ readonly conversation: ConversationId }>({
    id: "remove_conversation",
    label: "Remove conversation",
    description: "Removes a conversation with its messages.",
    args: schemas.object({ conversation: schemas.conversation }, ["conversation"]),
    preflight: (board, { conversation }) => holds(board, conversation),
    run: (_board, { conversation }) => ({ patches: [{ op: "remove", path: at("conversations", conversation) }] }),
  }),

  command<AddMessage>({
    id: "add_message",
    label: "Add message",
    description:
      "Adds a finished message at the end of a conversation, and sets the conversation's `updated` to the message's `created`. Where `keep` is given, it then drops the conversation's oldest exchanges until `keep` messages or fewer are left, counting no note of what others changed in the board. An exchange starts at a message that the user sent, or at a summary, and the last exchange is never dropped, however many messages it holds. It fails its preflight for a message whose id a message of the conversation has.",
    args: schemas.object(
      {
        conversation: schemas.conversation,
        message: schemas.message,
        keep: schemas.keep("How many messages the conversation keeps, every one where this is left out."),
      },
      ["conversation", "message"],
    ),
    preflight: (board, { conversation, message }) => {
      const held = findConversation(board, conversation);
      return held !== undefined && !holdsMessage(held, message.id);
    },
    run: (board, { conversation, message, keep }) => {
      const messages = [...(findConversation(board, conversation)?.messages ?? []), message];
      return {
        patches: [
          { op: "add", path: at("conversations", conversation, "messages", "-"), value: message },
          ...drops(conversation, keep === undefined ? 0 : messagesToDrop(messages, keep)),
          { op: "replace", path: at("conversations", conversation, "updated"), value: message.created },
        ],
      };
    },
  }),

  command<{ readonly keep: number }>({
    id: "trim_conversations",
    label: "Trim conversations",
    description:
      "Drops the oldest exchanges of every conversation until `keep` messages or fewer are left of each, as add_message drops them.",
    args: schemas.object({ keep: schemas.keep("How many messages each conversation keeps.") }, ["keep"]),
    preflight: (board) => assistantState(board) !== undefined,
    run: (board, { keep }) => ({
      patches: Object.entries(assistantState(board)?.conversations ?? {}).flatMap(([id, conversation]) =>
        drops(id, messagesToDrop(conversation.messages, keep)),
      ),
    }),
  }),

  command<CompactConversation>({
    id: "compact_conversation",
    label: "Compact conversation",
    description:
      "Puts a summary in place of the messages of a conversation before `from`, the first message that it keeps. It fails its preflight where the conversation no longer holds `from`.",
    args: schemas.object(
      {
        conversation: schemas.conversation,
        summary: schemas.summary,
        from: { type: "string", description: "The id of the first message that the conversation keeps after the summary." },
      },
      ["conversation", "summary", "from"],
    ),
    preflight: (board, { conversation, summary, from }) => {
      const held = findConversation(board, conversation);
      return held !== undefined && canCompact(held.messages, summary, from);
    },
    run: (board, { conversation, summary, from }) => {
      const index = (findConversation(board, conversation)?.messages ?? []).findIndex((message) => message.id === from);
      return {
        patches: [
          ...drops(conversation, Math.max(index, 0)),
          { op: "add", path: at("conversations", conversation, "messages", "0"), value: summary },
        ],
      };
    },
  }),

  command<AddUsage>({
    id: "add_usage",
    label: "Add usage",
    description:
      "Adds a call's input and output tokens to a conversation's count, and keeps `total`, every token of the call, its cached input included, as the conversation's `last`. A call that leaves `total` out, as one that titles the conversation, leaves `last` as it was.",
    args: schemas.object(
      {
        conversation: schemas.conversation,
        input: schemas.tokens("The input tokens of the call."),
        output: schemas.tokens("The output tokens of the call."),
        total: schemas.tokens("Every token of the call, its cached input included, which the conversation keeps as its `last`, as it was where this is left out."),
      },
      ["conversation", "input", "output"],
    ),
    preflight: (board, { conversation }) => holds(board, conversation),
    run: (board, { conversation, input, output, total }) => {
      const usage = findConversation(board, conversation)?.usage ?? { input: 0, output: 0, last: 0 };
      return {
        patches: [{ op: "replace", path: at("conversations", conversation, "usage"), value: addedUsage(usage, input, output, total) }],
      };
    },
  }),

  command<{ readonly conversation: ConversationId; readonly model: string | null }>({
    id: "set_model",
    label: "Set model",
    description:
      "Sets a conversation's pick of the model, or removes it with null, after which the conversation talks to the default.",
    args: schemas.object({ conversation: schemas.conversation, model: schemas.model }, ["conversation", "model"]),
    preflight: (board, { conversation }) => holds(board, conversation),
    run: (_board, { conversation, model }) => ({
      patches: [{ op: "replace", path: at("conversations", conversation, "model"), value: model }],
    }),
  }),

  command<{ readonly conversation: ConversationId; readonly thinking_level: ThinkingLevel | null }>({
    id: "set_thinking_level",
    label: "Set thinking level",
    description:
      "Sets a conversation's pick of the thinking level, or removes it with null, after which the conversation's calls reason at the level that the deployment's model settings give the model, or else at the assistant's default.",
    args: schemas.object({ conversation: schemas.conversation, thinking_level: schemas.thinkingLevel }, ["conversation", "thinking_level"]),
    preflight: (board, { conversation }) => holds(board, conversation),
    run: (board, { conversation, thinking_level: level }) => {
      const path = at("conversations", conversation, "thinking_level");
      if (level !== null) return { patches: [{ op: "add", path, value: level }] };
      return { patches: findConversation(board, conversation)?.thinking_level === undefined ? [] : [{ op: "remove", path }] };
    },
  }),
];
