// What the call that writes a summary sends: a system prompt of its own, and
// one message of the role user, which holds the older messages as text, then
// the request for the summary. Neither the system prompt of the turns nor the
// message of the app's reaches the call, and the call declares no tools
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.5#what-a-call-sends-and-in-which-order).
// The older messages go as text, as pi's own CLI sends them, so that the model
// summarizes them rather than going on with them. So the call holds no tool
// call either, which a provider takes only with its result. Of the older
// messages, the text holds these:
// - Every part but the reasoning of each reply, which it leaves out, as pi's
//   CLI does.
// - The name of each file that the user attached, and the count of the
//   images of each tool result, without their bytes.
// - An earlier summary, the notes of what others changed in the board and the
//   text of each skill that the user called, since the model read them.

import { SUMMARY_REQUEST } from "../loop/index.ts";
import type { Message, Part, ToolResultPart } from "../state/index.ts";

// The system prompt of the call that writes a summary.
export const SUMMARY_SYSTEM_PROMPT = [
  "You are compacting a conversation between a user and an assistant that edits a blockr board.",
  "The conversation is in <conversation> tags. Do not continue it, and do not answer what it asks.",
  "Reply with the summary alone, with no preamble and no sign-off.",
  "Keep concrete identifiers verbatim: the ids of blocks, links, stacks and plugins, column names and file paths.",
  "Prefer losing prose over losing a detail that the assistant would need to keep working.",
].join(" ");

// The text of the message of the role user that the call sends, for the older
// messages given.
export function summaryPrompt(messages: readonly Message[]): string {
  return `<conversation>\n${conversationText(messages)}\n</conversation>\n\n${SUMMARY_REQUEST}`;
}

// The messages as text, one paragraph for each part, each labelled with who
// wrote it.
export function conversationText(messages: readonly Message[]): string {
  const tools = new Map<string, string>();
  for (const message of messages) {
    for (const part of message.parts) if (part.type === "tool_call") tools.set(part.id, part.tool);
  }
  return messages.flatMap((message) => message.parts.flatMap((part) => paragraphOf(message, part, tools))).join("\n\n");
}

function paragraphOf(message: Message, part: Part, tools: ReadonlyMap<string, string>): string[] {
  switch (part.type) {
    case "text":
      return [`[${WRITER[message.role]}]: ${part.text}`];
    case "changes":
      return [`[What others changed in the board]: ${part.text}`];
    case "skill":
      return [`[The skill ${part.name}, which the user called]: ${part.text}`];
    case "attachment":
      return [`[The user attached a file]: ${part.name}, of the type ${part.media_type}`];
    case "tool_call":
      return [`[The assistant called ${part.tool}]: ${JSON.stringify(part.args)}`];
    case "tool_result":
      return [`[${resultLabel(part, tools)}]: ${part.text}${imagesOf(part)}`];
  }
}

// Who wrote the text of a message of each role. A message of the role tool
// holds no text.
const WRITER: Readonly<Record<Message["role"], string>> = {
  user: "User",
  assistant: "Assistant",
  tool: "Tool",
  summary: "Summary of the conversation before",
};

function resultLabel(part: ToolResultPart, tools: ReadonlyMap<string, string>): string {
  const tool = tools.get(part.id) ?? "a tool";
  return part.error === true ? `The call of ${tool} failed` : `The result of ${tool}`;
}

function imagesOf(part: ToolResultPart): string {
  const count = part.images ?? 0;
  if (count === 0) return "";
  return count === 1 ? "\n(The result also held an image.)" : `\n(The result also held ${String(count)} images.)`;
}
