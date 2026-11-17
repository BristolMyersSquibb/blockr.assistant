// What the calls that write a summary send (./prompt.ts): the older messages
// as text, then pi's instructions, which update an earlier summary or cover
// the start of a split exchange.

import { describe, expect, test } from "vitest";
import type { Message } from "../state/index.ts";
import { conversationText, historyPrompt, mergedSummary, RESULT_CHARACTERS, turnStartPrompt } from "./prompt.ts";

const CREATED = "2026-11-16T08:00:00.000Z";

const messages: Message[] = [
  {
    id: "u2",
    role: "user",
    parts: [
      { type: "text", text: "/regions" },
      { type: "skill", name: "regions", text: "Group by region." },
      { type: "attachment", name: "sales.csv", media_type: "text/csv" },
    ],
    created: CREATED,
  },
  { id: "n1", role: "user", parts: [{ type: "changes", text: "The user removed the block b2." }], created: CREATED },
  {
    id: "a2",
    role: "assistant",
    parts: [
      { type: "text", text: "Reading the blocks." },
      { type: "tool_call", id: "t1", tool: "list_blocks", args: { limit: 2 } },
      { type: "tool_call", id: "t2", tool: "inspect_results", args: { code: "plot(b1)" } },
    ],
    created: CREATED,
  },
  {
    id: "r2",
    role: "tool",
    parts: [
      { type: "tool_result", id: "t1", text: '["b1"]' },
      { type: "tool_result", id: "t2", text: "Drew a plot.", error: true, images: 2 },
    ],
    created: CREATED,
  },
];

describe("the calls that write a summary", () => {
  test("hold each part of the older messages as text, labelled as pi's CLI labels them", () => {
    expect(conversationText(messages).split("\n\n")).toEqual([
      "[User]: /regions",
      "[The skill regions, which the user called]: Group by region.",
      "[The user attached a file]: sales.csv, of the type text/csv",
      "[What others changed in the board]: The user removed the block b2.",
      "[Assistant]: Reading the blocks.",
      '[Assistant tool calls]: list_blocks(limit=2); inspect_results(code="plot(b1)")',
      '[Tool result]: ["b1"]',
      "[Tool result]: Drew a plot.\n(The result also held 2 images.)\n(The call failed.)",
    ]);
  });

  test("cut each tool result to 2,000 characters", () => {
    const long: Message = { id: "r1", role: "tool", parts: [{ type: "tool_result", id: "t1", text: "x".repeat(RESULT_CHARACTERS + 5) }], created: CREATED };

    expect(conversationText([long])).toBe(`[Tool result]: ${"x".repeat(RESULT_CHARACTERS)}\n\n[... 5 more characters truncated]`);
  });

  test("ask for a structured summary, or for an update of the earlier summary, which goes in tags of its own", () => {
    const fresh = historyPrompt(messages.slice(0, 1));
    const update = historyPrompt(messages.slice(0, 1), "## Goal\nA sales chart.");

    expect(fresh.startsWith("<conversation>\n[User]: /regions")).toBe(true);
    expect(fresh).toContain("Create a structured context checkpoint summary");
    expect(fresh).toContain("Preserve the exact ids of blocks, links, stacks and plugins");
    expect(update).toContain("<previous-summary>\n## Goal\nA sales chart.\n</previous-summary>");
    expect(update).toContain("incorporate into the existing summary provided in <previous-summary> tags");
  });

  test("ask for a checkpoint of the start of a split exchange, which pi's CLI merges with the summary", () => {
    const prompt = turnStartPrompt(messages.slice(0, 1));

    expect(prompt.startsWith("# Conversation\n[User]: /regions")).toBe(true);
    expect(prompt).toContain("## Original Request");
    expect(mergedSummary("History.", "Start.")).toBe("History.\n\n---\n\n**Turn Context (split turn):**\n\nStart.");
  });
});
