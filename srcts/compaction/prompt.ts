// What the calls that write a summary send, as pi's own CLI writes them: a
// system prompt of their own, and one message of the role user, which holds
// the older messages as text, then the instructions. Neither the system
// prompt of the turns nor the message of the app's reaches the calls, and they
// declare no tools
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.5#what-a-call-sends-and-in-which-order).
// The prompts are those of pi's CLI, with the identifiers that a summary keeps
// named for a board rather than for code
// (https://github.com/earendil-works/pi/blob/e3da248ea9100a3b5d53f9c701b6a47ef7f58d6e/packages/coding-agent/src/core/compaction/compaction.ts).
// They are Copyright (c) 2025 Mario Zechner, under the MIT License, whose text
// inst/js/LICENSES holds for pi's packages.
// - The older messages go as text, so that the model summarizes them rather
//   than going on with them. So the calls hold no tool call either, which a
//   provider takes only with its result.
// - Each tool result is cut to 2,000 characters, which a summary needs no
//   more of, and each reply's reasoning is left out, as pi's CLI has both.
// - The text names each file that the user attached, and counts the images of
//   each tool result, without their bytes. It holds the notes of what others
//   changed in the board and the text of each skill that the user called,
//   since the model read them.
// - An earlier summary goes in tags of its own, with instructions to update it.
// - Where the cut falls inside an exchange, the exchange's start gets
//   instructions of its own, for the context that the rest of the exchange
//   needs.

import type { Message, Part, ToolResultPart } from "../state/index.ts";

// The characters of a tool result that the text keeps.
export const RESULT_CHARACTERS = 2_000;

// The system prompt of the calls that write a summary.
export const SUMMARY_SYSTEM_PROMPT = `You are a context summarization assistant. Your task is to read a conversation between a user and an AI assistant that edits a blockr board, then produce a structured summary following the exact format specified.

Do NOT continue the conversation. Do NOT respond to any questions in the conversation. ONLY output the structured summary.`;

const KEEP = "Preserve the exact ids of blocks, links, stacks and plugins, column names, file paths and error messages.";

const SUMMARY_FORMAT = `## Goal
[What is the user trying to accomplish? Can be multiple items if the session covers different tasks.]

## Constraints & Preferences
- [Any constraints, preferences, or requirements mentioned by user]
- [Or "(none)" if none were mentioned]

## Progress
### Done
- [x] [Completed tasks/changes]

### In Progress
- [ ] [Current work]

### Blocked
- [Issues preventing progress, if any]

## Key Decisions
- **[Decision]**: [Brief rationale]

## Next Steps
1. [Ordered list of what should happen next]

## Critical Context
- [Any data, examples, or references needed to continue]
- [Or "(none)" if not applicable]

Keep each section concise. ${KEEP}`;

const SUMMARY_PROMPT = `The messages above are a conversation to summarize. Create a structured context checkpoint summary that another LLM will use to continue the work.

Use this EXACT format:

${SUMMARY_FORMAT}`;

const UPDATE_PROMPT = `The messages above are NEW conversation messages to incorporate into the existing summary provided in <previous-summary> tags.

Update the existing structured summary with new information. RULES:
- PRESERVE all existing information from the previous summary
- ADD new progress, decisions, and context from the new messages
- UPDATE the Progress section: move items from "In Progress" to "Done" when completed
- UPDATE "Next Steps" based on what was accomplished
- ${KEEP.replace("Preserve", "PRESERVE")}
- If something is no longer relevant, you may remove it

Use this EXACT format:

${SUMMARY_FORMAT}`;

const TURN_PREFIX_PROMPT = `The messages above are earlier context from an ongoing conversation. Later messages are stored separately and do not need to be reconstructed.

Create a concise checkpoint of the user's request and the progress shown above. This checkpoint will be placed before the later messages so the conversation can continue with the necessary context.

## Original Request
[What did the user ask for?]

## Progress So Far
- [Key decisions and work completed in these messages]

## Context Needed to Continue
- [Information from these messages needed to understand the later work]

Only summarize information explicitly present above. Do not infer or recreate later messages.`;

// What a summary that covers both the older exchanges and the start of a
// split exchange holds, as pi's CLI merges the two.
export function mergedSummary(history: string, turnStart: string): string {
  return `${history}\n\n---\n\n**Turn Context (split turn):**\n\n${turnStart}`;
}

// The text of the message of the role user that the call sends for the older
// exchanges, with the earlier summary that it updates, if any.
export function historyPrompt(messages: readonly Message[], previous?: string): string {
  const conversation = `<conversation>\n${conversationText(messages)}\n</conversation>\n\n`;
  if (previous === undefined) return `${conversation}${SUMMARY_PROMPT}`;
  return `${conversation}<previous-summary>\n${previous}\n</previous-summary>\n\n${UPDATE_PROMPT}`;
}

// The text of the message of the role user that the call sends for the start
// of a split exchange.
export function turnStartPrompt(messages: readonly Message[]): string {
  return `# Conversation\n${conversationText(messages)}\n\n# Instructions\n${TURN_PREFIX_PROMPT}`;
}

// The messages as text, one paragraph for each part, each labelled with who
// wrote it, as pi's CLI labels them.
export function conversationText(messages: readonly Message[]): string {
  return messages.flatMap((message) => paragraphsOf(message)).join("\n\n");
}

function paragraphsOf(message: Message): string[] {
  const calls = message.parts.flatMap((part) => (part.type === "tool_call" ? [`${part.tool}(${argsOf(part.args)})`] : []));
  const others = message.parts.flatMap((part) => paragraphOf(message, part));
  return calls.length === 0 ? others : [...others, `[Assistant tool calls]: ${calls.join("; ")}`];
}

function paragraphOf(message: Message, part: Part): string[] {
  switch (part.type) {
    case "text":
      return [`[${message.role === "assistant" ? "Assistant" : "User"}]: ${part.text}`];
    case "changes":
      return [`[What others changed in the board]: ${part.text}`];
    case "skill":
      return [`[The skill ${part.name}, which the user called]: ${part.text}`];
    case "attachment":
      return [`[The user attached a file]: ${part.name}, of the type ${part.media_type}`];
    case "tool_result":
      return [`[Tool result]: ${cut(part.text)}${imagesOf(part)}${part.error === true ? "\n(The call failed.)" : ""}`];
    case "tool_call":
      return [];
  }
}

function argsOf(args: Readonly<Record<string, unknown>>): string {
  return Object.entries(args)
    .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
    .join(", ");
}

// The text, cut to the characters that the summary takes of a tool result.
function cut(text: string): string {
  if (text.length <= RESULT_CHARACTERS) return text;
  return `${text.slice(0, RESULT_CHARACTERS)}\n\n[... ${String(text.length - RESULT_CHARACTERS)} more characters truncated]`;
}

function imagesOf(part: ToolResultPart): string {
  const count = part.images ?? 0;
  if (count === 0) return "";
  return count === 1 ? "\n(The result also held an image.)" : `\n(The result also held ${String(count)} images.)`;
}
