// The types of the assistant's state, which the board holds at
// /plugins/blockr.assistant-assistant_plugin
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.3#the-state).
// The build generates the JSON Schema of the state from AssistantState and
// writes it beside the class's module, as inst/js/assistant_plugin.schema.json.
// The store checks the state against that schema after every change, and R
// reads the same file to write a board.
// The comment on each type and property becomes its description in the
// schema, which a model reads too.
// Each is a `type` rather than an `interface`, so that a state is a Json.
// The shape is the plugin's own rather than pi's, so that a change to pi's
// messages needs no migration of saved boards.

/* eslint-disable @typescript-eslint/consistent-type-definitions -- an interface would not be assignable to Json */

import type { Json } from "@blockr/core";

/** The id of a conversation, which never changes. */
export type ConversationId = string;

/** The id of a message, which no other message of its conversation has. */
export type MessageId = string;

/** The assistant's conversations. */
export type AssistantState = {
  /** Every conversation, by its id. */
  readonly conversations: Readonly<Record<ConversationId, Conversation>>;
};

/** A conversation with the assistant. */
export type Conversation = {
  /** The title of the conversation. */
  readonly title: string;
  /**
   * When the conversation was added, or when its last message entered it, by which the conversations are ordered.
   * @format date-time
   */
  readonly updated: string;
  /** The messages that the state keeps, in the order in which they entered the conversation. */
  readonly messages: readonly Message[];
  /** The tokens that the conversation's calls to the model spent. */
  readonly usage: Usage;
  /** The conversation's pick of the model, such as "gpt-5.4", or null for the default. */
  readonly model: string | null;
};

/** The tokens that a conversation's calls to the model spent. */
export type Usage = {
  /** The input tokens of every call so far. */
  readonly input: Count;
  /** The output tokens of every call so far. */
  readonly output: Count;
  /** Every token of the last call, its cached input included. */
  readonly last: Count;
};

/**
 * A whole number of 0 or more.
 * @asType integer
 * @minimum 0
 */
type Count = number;

/** A message of a conversation, which never changes once it entered the conversation. */
export type Message = {
  /** The id of the message. */
  readonly id: MessageId;
  /** Who the message is from. */
  readonly role: Role;
  /** What the message holds, in order. */
  readonly parts: readonly Part[];
  /**
   * When the message was made.
   * @format date-time
   */
  readonly created: string;
};

/** Who a message is from: the user, the model, the tools whose results it holds, or a summary of older messages that took their place. */
export type Role = "user" | "assistant" | "tool" | "summary";

/** A part of a message. */
export type Part = TextPart | ToolCallPart | ToolResultPart | AttachmentPart | ChangesPart | SkillPart;

/** Text that the message holds. */
export type TextPart = {
  readonly type: "text";
  readonly text: string;
};

/** A call of a tool that the model asked for. */
export type ToolCallPart = {
  readonly type: "tool_call";
  /** The id of the call, which its result names. */
  readonly id: string;
  /** The name of the tool. */
  readonly tool: string;
  /** The args of the call. */
  readonly args: Readonly<Record<string, Json>>;
};

/** The result of a call of a tool. */
export type ToolResultPart = {
  readonly type: "tool_result";
  /** The id of the call. */
  readonly id: string;
  /** The text of the result. */
  readonly text: string;
  /** Whether the call failed. */
  readonly error?: boolean;
  /** How many images the result carried, which the state leaves out. */
  readonly images?: Count;
};

/** A file that the user attached, which the state leaves out but for its name and its media type. */
export type AttachmentPart = {
  readonly type: "attachment";
  /** The name of the file. */
  readonly name: string;
  /** The media type of the file, such as "image/png". */
  readonly media_type: string;
};

/** The note of what others changed in the board since the conversation's previous call, which the model read and the chat leaves out. */
export type ChangesPart = {
  readonly type: "changes";
  readonly text: string;
};

/** The text of a skill that the user called with /name, which the model gets with the message and the chat leaves out. */
export type SkillPart = {
  readonly type: "skill";
  /** The name of the skill. */
  readonly name: string;
  /** The text of the skill. */
  readonly text: string;
};
