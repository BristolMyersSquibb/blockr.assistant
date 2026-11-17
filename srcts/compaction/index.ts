// Compaction, which puts a summary in place of a conversation's older
// messages once the conversation nears its model's context window, or once
// the user asks.

export { createCompaction } from "./compaction.ts";
export type { Compaction, CompactionOptions } from "./compaction.ts";
export { SUMMARY_SYSTEM_PROMPT, conversationText, summaryPrompt } from "./prompt.ts";
export { estimatedTokens, firstKept, IMAGE_TOKENS, keptTokens, lastIsCurrent, needsSummary, RESERVE } from "./rule.ts";
