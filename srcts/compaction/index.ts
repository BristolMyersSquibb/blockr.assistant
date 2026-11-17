// Compaction, which puts a summary in place of a conversation's older
// messages before a call that would near its model's context window, after a
// call that outgrew it, or as the user asks, as pi's own CLI compacts.

export { createCompaction } from "./compaction.ts";
export type { Compaction, CompactionOptions } from "./compaction.ts";
export { conversationText, historyPrompt, mergedSummary, RESULT_CHARACTERS, SUMMARY_SYSTEM_PROMPT, turnStartPrompt } from "./prompt.ts";
export { contextTokens, cutOf, estimatedTokens, IMAGE_TOKENS, keptTokens, needsSummary, RESERVE } from "./rule.ts";
export type { Cut } from "./rule.ts";
