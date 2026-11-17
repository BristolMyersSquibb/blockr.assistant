// What the call that writes a summary sends (./prompt.ts): the older messages
// as text, then the request for the summary.

import { describe, expect, test } from "vitest";
import { SUMMARY_REQUEST } from "../loop/index.ts";
import type { Message } from "../state/index.ts";
import { conversationText, summaryPrompt } from "./prompt.ts";

const CREATED = "2026-11-16T08:00:00.000Z";

const messages: Message[] = [
  { id: "s1", role: "summary", parts: [{ type: "text", text: "We built a sales chart." }], created: CREATED },
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

describe("the call that writes a summary", () => {
  test("holds each part of the older messages as text, labelled with who wrote it", () => {
    expect(conversationText(messages).split("\n\n")).toEqual([
      "[Summary of the conversation before]: We built a sales chart.",
      "[User]: /regions",
      "[The skill regions, which the user called]: Group by region.",
      "[The user attached a file]: sales.csv, of the type text/csv",
      "[What others changed in the board]: The user removed the block b2.",
      "[Assistant]: Reading the blocks.",
      '[The assistant called list_blocks]: {"limit":2}',
      '[The assistant called inspect_results]: {"code":"plot(b1)"}',
      '[The result of list_blocks]: ["b1"]',
      "[The call of inspect_results failed]: Drew a plot.\n(The result also held 2 images.)",
    ]);
  });

  test("wraps the older messages in tags, which the request for the summary follows", () => {
    const prompt = summaryPrompt(messages.slice(0, 1));

    expect(prompt).toBe(`<conversation>\n[Summary of the conversation before]: We built a sales chart.\n</conversation>\n\n${SUMMARY_REQUEST}`);
  });
});
