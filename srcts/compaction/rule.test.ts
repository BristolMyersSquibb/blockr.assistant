// The rule of compaction (./rule.ts): when a conversation needs a summary,
// and how much of it the summary keeps.

import { describe, expect, test } from "vitest";
import type { Conversation, Message, Part, Role } from "../state/index.ts";
import { estimatedTokens, firstKept, keptTokens, lastIsCurrent, needsSummary, RESERVE } from "./rule.ts";

const EARLY = "2026-11-16T08:00:00.000Z";
const LATE = "2026-11-16T09:00:00.000Z";

// A message whose text the tokens given estimate.
function message(id: string, role: Role, tokens = 10, created = EARLY): Message {
  return { id, role, parts: [{ type: "text", text: "x".repeat(tokens * 4) }], created };
}

function note(id: string, tokens = 10): Message {
  return { id, role: "user", parts: [{ type: "changes", text: "x".repeat(tokens * 4) }], created: EARLY };
}

function conversation(last: number, ...messages: Message[]): Conversation {
  return { title: "Sales", updated: EARLY, messages, usage: { input: 0, output: 0, last }, model: null };
}

describe("a conversation needs a summary", () => {
  test("once the tokens of its last call pass its model's window less the reserve", () => {
    const window = 100_000;
    const held = (last: number) => conversation(last, message("u1", "user"), message("a1", "assistant"));

    expect(needsSummary(held(window - RESERVE), window)).toBe(false);
    expect(needsSummary(held(window - RESERVE + 1), window)).toBe(true);
  });

  test("only once a reply follows its summary, since until then its last call sent what the summary replaced", () => {
    const before = conversation(90_000, message("s1", "summary", 10, LATE), message("u2", "user"), message("a2", "assistant", 10, EARLY));
    const after = conversation(90_000, message("s1", "summary", 10, EARLY), message("u2", "user"), message("a2", "assistant", 10, LATE));

    expect(lastIsCurrent(before)).toBe(false);
    expect(needsSummary(before, 100_000)).toBe(false);
    expect(lastIsCurrent(after)).toBe(true);
    expect(needsSummary(after, 100_000)).toBe(true);
  });

  test("never where its last call spent no token", () => {
    expect(lastIsCurrent(conversation(0, message("u1", "user")))).toBe(false);
  });
});

describe("a summary keeps", () => {
  test("a quarter of the window", () => {
    expect(keptTokens(128_000)).toBe(32_000);
  });

  test("the newest exchanges that hold the tokens given or fewer", () => {
    const messages = [
      message("u1", "user"),
      message("a1", "assistant"),
      message("u2", "user"),
      message("a2", "assistant"),
      message("u3", "user"),
      message("a3", "assistant"),
    ];

    expect(firstKept(messages, 40)).toBe(2);
    expect(firstKept(messages, 39)).toBe(4);
    expect(firstKept(messages, 20)).toBe(4);
  });

  test("no exchange that starts on a note of what others changed, which the user did not send", () => {
    const messages = [message("u1", "user"), message("a1", "assistant"), note("n1"), message("a2", "assistant")];

    expect(firstKept(messages, 1_000)).toBe(4);
  });

  test("no message where the last exchange alone holds more", () => {
    const messages = [message("u1", "user"), message("a1", "assistant"), message("u2", "user"), message("a2", "assistant", 500)];

    expect(firstKept(messages, 100)).toBe(4);
  });

  test("none of the first exchange with a reply, so that the summary covers a reply", () => {
    expect(firstKept([message("u1", "user"), message("a1", "assistant"), message("u2", "user"), message("a2", "assistant")], 1_000)).toBe(2);
    expect(firstKept([message("u1", "user"), message("a1", "assistant")], 1_000)).toBe(2);
    expect(firstKept([message("s1", "summary"), message("u2", "user"), message("a2", "assistant")], 1_000)).toBe(3);
  });

  test("nothing to summarize where the conversation holds no reply", () => {
    expect(firstKept([message("s1", "summary"), message("u2", "user")], 1_000)).toBeUndefined();
    expect(firstKept([], 1_000)).toBeUndefined();
  });
});

describe("the tokens of a message", () => {
  test("are its characters by four, with 1,200 for each image of a tool result", () => {
    const parts: Part[] = [
      { type: "tool_call", id: "t1", tool: "list_blocks", args: { limit: 2 } },
      { type: "tool_result", id: "t1", text: "x".repeat(400), images: 2 },
    ];

    expect(estimatedTokens({ id: "a1", role: "assistant", parts: parts.slice(0, 1), created: EARLY })).toBe(Math.ceil(("list_blocks".length + '{"limit":2}'.length) / 4));
    expect(estimatedTokens({ id: "r1", role: "tool", parts: parts.slice(1), created: EARLY })).toBe(100 + 2 * 1_200);
  });
});
