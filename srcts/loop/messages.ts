// A conversation in the state's shape as pi's messages for a call, and pi's
// messages back in the state's shape
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.3#the-state).
// The loop builds pi's messages for each call from the conversation as the
// plugin holds it then: the messages in the memory, then those in the state.
// So nothing that a call needs may get lost on the way into pi's messages and
// back.
//
// On the way into pi's messages:
// - A message that the user sent, a note of what others changed and the
//   text of a skill that the user called become text in a message of pi's
//   role user. A file that the user attached reads as its name and its media
//   type, since the memory keeps no file's bytes yet.
// - A reply that finished goes as pi wrote it, where the memory keeps it, so
//   that its reasoning goes with it. Where another model wrote the reply, pi
//   leaves the reasoning out itself.
// - Any other reply goes as the state holds it: one that the board held when
//   it opened, one that the user stopped and one whose call failed. It goes
//   as the reply of another model of the same API, so that pi sends it
//   without reasoning and without the ids of OpenAI's items, by which OpenAI
//   would ask for that reasoning.
// - Each tool call of a reply goes with its result, from the message of the
//   role tool that follows the reply, with the images that the memory keeps.
//   A result whose images the memory lacks says how many it carried. A call
//   that has no result gets one that says the turn ended before the call
//   returned, since a provider takes a tool call only with its result.
// - A summary goes as a message of the role user, which says that it holds
//   the summary of the conversation before it, as pi's own CLI sends one. So
//   the messages that the summary keeps may start on a reply.
// - The message of the app's, which the loop adds after the conversation for
//   the call alone, goes as a message of the role app, which the loop
//   declares among the messages of pi's agent, so that pi's messages tell it
//   from the user's. Before the call, pi's convertToLlm turns it into text in
//   a message of the role user, which the model takes, and whose text opens
//   with the preamble that says that the app writes it.
//
// On the way back, a reply holds its text and its tool calls, in the order
// that it gave them, while the memory keeps its reasoning, as text, and the
// reply as pi wrote it, where it finished.

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
  Api,
  AssistantMessage,
  ImageContent,
  Message as PiMessage,
  Model,
  SystemMessage,
  TextContent,
  ToolResultMessage,
  Usage,
  UserMessage,
} from "@earendil-works/pi-ai";
import type { Kept, KeptImage } from "../conversations/index.ts";
import { newId } from "../state/index.ts";
import type { Message, MessageId, Part, ToolCallPart, ToolResultPart } from "../state/index.ts";
import type { Tool } from "../tools/index.ts";

// The result of a tool call that has no result, as in a board saved during a
// turn.
export const ENDED = "The turn ended before this call returned.";

// The result of a tool call that the user stopped.
export const STOPPED = "The user stopped the turn before this call returned.";

// What a summary's text goes between in pi's messages, as pi's CLI frames
// one.
export const SUMMARY_PREFIX = "The conversation history before this point was compacted into the following summary:\n\n<summary>\n";
export const SUMMARY_SUFFIX = "\n</summary>";

// The ends of a reply that finished, which pi takes back as it wrote it.
// Where a reply ended otherwise, pi drops it whole, with the reasoning that
// it holds.
const FINISHED: ReadonlySet<AssistantMessage["stopReason"]> = new Set(["stop", "toolUse", "length"]);

const NO_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

// A tool call's result, as the loop gives it back.
export interface Answered {
  readonly text: string;
  readonly isError: boolean;
  readonly images: readonly KeptImage[];
}

// The messages of pi for a call: the system prompt with the tools, which pi
// declares to the model, then the conversation.
export function callMessages(
  messages: readonly Message[],
  kept: (message: MessageId) => Kept | undefined,
  model: Model<Api>,
  tools: readonly Tool[],
  systemPrompt: string,
): PiMessage[] {
  return [systemMessage(systemPrompt, tools), ...piMessages(messages, kept, model)];
}

// The system prompt with the declarations of the tools, as pi's message of the
// role system.
function systemMessage(prompt: string, tools: readonly Tool[]): SystemMessage {
  const declared = tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters }));
  return { role: "system", content: prompt, ...(declared.length > 0 ? { toolsAdded: declared } : {}), timestamp: Date.now() };
}

// A message of the app's, as the messages of pi's agent hold it.
export interface AppMessage {
  role: "app";
  content: TextContent[];
  timestamp: number;
}

// The role app among the messages of pi's agent, as pi's agent lets an app
// declare roles of its own.
declare module "@earendil-works/pi-agent-core" {
  interface CustomAgentMessages {
    app: AppMessage;
  }
}

// The message of the app's that the text given makes.
export function appMessage(written: string): AppMessage {
  return { role: "app", content: [text(written)], timestamp: Date.now() };
}

// The messages of pi's agent as the model takes them: a message of the app's
// as a message of the role user, and every other as it is.
export function llmMessages(messages: readonly AgentMessage[]): PiMessage[] {
  return messages.map((message): PiMessage => (message.role === "app" ? appAsUser(message) : message));
}

function appAsUser(message: AppMessage): UserMessage {
  return { role: "user", content: message.content, timestamp: message.timestamp };
}

// The conversation as pi's messages, for a call to the model given.
export function piMessages(messages: readonly Message[], kept: (message: MessageId) => Kept | undefined, model: Model<Api>): PiMessage[] {
  const out: PiMessage[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    if (message === undefined) continue;
    const at = Date.parse(message.created);
    if (message.role === "user") {
      const content = userContent(message.parts);
      if (content.length > 0) out.push({ role: "user", content, timestamp: at });
    } else if (message.role === "summary") {
      const summary = message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n\n");
      out.push({ role: "user", content: [text(`${SUMMARY_PREFIX}${summary}${SUMMARY_SUFFIX}`)], timestamp: at });
    } else if (message.role === "assistant") {
      out.push(asWritten(kept(message.id)?.reply) ?? otherReply(message.parts, model, at));
      const calls = message.parts.filter(isToolCall);
      if (calls.length === 0) continue;
      const next = messages[i + 1];
      const results = next?.role === "tool" ? next : undefined;
      if (results !== undefined) i += 1;
      const images = results === undefined ? undefined : kept(results.id)?.images;
      out.push(...calls.map((call) => resultFor(call, results?.parts ?? [], images?.[call.id] ?? [], at)));
    }
    // A message of the role tool that follows no reply's calls holds results
    // that no provider takes, so it goes.
  }
  return out;
}

// What a message that the user sent holds, as text.
function userContent(parts: readonly Part[]): TextContent[] {
  return parts.flatMap((part) => {
    switch (part.type) {
      case "text":
      case "changes":
      case "skill":
        return [text(part.text)];
      case "attachment":
        return [text(`The user attached the file "${part.name}", of the type ${part.media_type}, whose content is no longer available.`)];
      default:
        return [];
    }
  });
}

// The reply as pi wrote it, where the memory kept it, which only a reply that
// finished keeps.
function asWritten(reply: unknown): AssistantMessage | undefined {
  return typeof reply === "object" && reply !== null && (reply as { role?: unknown }).role === "assistant" ? (reply as AssistantMessage) : undefined;
}

// A reply as the state holds it, as the reply of another model of the same
// provider and API, which pi sends without reasoning and without the ids of
// OpenAI's items. No model has the empty id.
function otherReply(parts: readonly Part[], model: Model<Api>, at: number): AssistantMessage {
  const content = parts.flatMap((part): AssistantMessage["content"] => {
    if (part.type === "text") return [text(part.text)];
    if (part.type === "tool_call") return [{ type: "toolCall", id: part.id, name: part.tool, arguments: { ...part.args } }];
    return [];
  });
  return {
    role: "assistant",
    content,
    api: model.api,
    provider: model.provider,
    model: "",
    usage: NO_USAGE,
    stopReason: content.some((block) => block.type === "toolCall") ? "toolUse" : "stop",
    timestamp: at,
  };
}

// The result of a tool call, from the results given, or one that says the
// turn ended before the call returned.
function resultFor(call: ToolCallPart, results: readonly Part[], images: readonly KeptImage[], at: number): ToolResultMessage {
  const result = results.find((part): part is ToolResultPart => part.type === "tool_result" && part.id === call.id);
  if (result === undefined) return toolResult(call, [text(ENDED)], true, at);
  const carried = result.images ?? 0;
  const said = images.length === 0 && carried > 0 ? `${result.text}\n\n${imagesGone(carried)}` : result.text;
  return toolResult(call, [text(said), ...images.map(image)], result.error === true, at);
}

function imagesGone(count: number): string {
  const which = count === 1 ? "an image, which is" : `${String(count)} images, which are`;
  return `The result also held ${which} no longer available, since the board was opened again.`;
}

function toolResult(call: ToolCallPart, content: (TextContent | ImageContent)[], isError: boolean, at: number): ToolResultMessage {
  return { role: "toolResult", toolCallId: call.id, toolName: call.tool, content, isError, timestamp: at };
}

// A reply that pi wrote, in the state's shape, with what the memory keeps of
// it, or undefined where it holds no text and no tool call, as a reply that
// streamed nothing before the user stopped it or its call failed.
export function replyOf(reply: AssistantMessage): { readonly message: Message; readonly kept: Kept } | undefined {
  const parts = partsOf(reply);
  if (parts.length === 0) return undefined;
  const reasoning = reasoningOf(reply);
  return {
    message: { id: newId(), role: "assistant", parts, created: new Date(reply.timestamp).toISOString() },
    kept: { ...(reasoning.length > 0 ? { reasoning } : {}), ...(FINISHED.has(reply.stopReason) ? { reply } : {}) },
  };
}

// The text and the tool calls of a reply, as it streams or once it ended, in
// the state's shape. Text that holds nothing but white space is left out.
export function partsOf(reply: AssistantMessage): Part[] {
  return reply.content.flatMap((block): Part[] => {
    if (block.type === "text") return block.text.trim() === "" ? [] : [{ type: "text", text: block.text }];
    if (block.type === "toolCall") return [{ type: "tool_call", id: block.id, tool: block.name, args: block.arguments }];
    return [];
  });
}

// A reply's reasoning, as the text of each part of it that the provider gave as
// text. A part that the provider gave encrypted alone has none.
export function reasoningOf(reply: AssistantMessage): string[] {
  return reply.content.flatMap((block) => (block.type === "thinking" && block.redacted !== true && block.thinking.trim() !== "" ? [block.thinking] : []));
}

// The results of a reply's tool calls, as one message of the role tool, in the
// order of the calls, with the images that the memory keeps.
export function resultsOf(
  calls: readonly ToolCallPart[],
  answered: (call: ToolCallPart) => Answered,
): { readonly message: Message; readonly kept: Kept } {
  const answers = calls.map((call) => [call, answered(call)] as const);
  const parts = answers.map(([call, answer]): ToolResultPart => ({
    type: "tool_result",
    id: call.id,
    text: answer.text,
    ...(answer.isError ? { error: true } : {}),
    ...(answer.images.length > 0 ? { images: answer.images.length } : {}),
  }));
  const images = Object.fromEntries(answers.filter(([, answer]) => answer.images.length > 0).map(([call, answer]) => [call.id, answer.images]));
  return {
    message: { id: newId(), role: "tool", parts, created: new Date().toISOString() },
    kept: Object.keys(images).length > 0 ? { images } : {},
  };
}

export function isToolCall(part: Part): part is ToolCallPart {
  return part.type === "tool_call";
}

function text(value: string): TextContent {
  return { type: "text", text: value };
}

// An image that the memory keeps, as pi's content.
export function image(kept: KeptImage): ImageContent {
  return { type: "image", data: kept.data, mimeType: kept.mimeType };
}
