// The rule of compaction (./rule.ts): when a conversation needs a summary,
// and where the summary cuts it.

import { describe, expect, test } from "vitest";
import type { Conversation, Message, Part, Role } from "../state/index.ts";
import { contextTokens, cutOf, estimatedTokens, keptTokens, needsSummary, RESERVE } from "./rule.ts";

const EARLY = "2026-11-16T08:00:00.000Z";
const LATE = "2026-11-16T09:00:00.000Z";

// A message whose text the tokens given estimate.
function message(id: string, role: Role, tokens = 10, created = EARLY): Message {
  return { id, role, parts: [{ type: "text", text: "x".repeat(tokens * 4) }], created };
}

// The results of a reply's tool calls, which the tokens given estimate.
function results(id: string, tokens = 10): Message {
  return { id, role: "tool", parts: [{ type: "tool_result", id: "t1", text: "x".repeat(tokens * 4) }], created: EARLY };
}

function note(id: string, tokens = 10): Message {
  return { id, role: "user", parts: [{ type: "changes", text: "x".repeat(tokens * 4) }], created: EARLY };
}

function conversation(last: number, ...messages: Message[]): Conversation {
  return { title: "Sales", updated: EARLY, messages, usage: { input: 0, output: 0, last }, model: null };
}

describe("the tokens of a conversation's next call", () => {
  test("are those of its last call, and an estimate of the messages after the last reply", () => {
    const held = conversation(5_000, message("u1", "user"), message("a1", "assistant"), results("r1", 300), message("u2", "user", 20));

    expect(contextTokens(held)).toBe(5_000 + 300 + 20);
  });

  test("are an estimate of every message until a reply follows the summary, since the last call sent what the summary replaced", () => {
    const before = conversation(90_000, message("s1", "summary", 100, LATE), message("u2", "user"), message("a2", "assistant", 10, EARLY));
    const after = conversation(90_000, message("s1", "summary", 100, EARLY), message("u2", "user"), message("a2", "assistant", 10, LATE));

    expect(contextTokens(before)).toBe(120);
    expect(contextTokens(after)).toBe(90_000);
  });

  test("are an estimate of every message where no call spent tokens", () => {
    expect(contextTokens(conversation(0, message("u1", "user", 30)))).toBe(30);
  });
});

describe("a conversation needs a summary", () => {
  test("once the tokens of its next call pass its model's window less the reserve", () => {
    const window = 100_000;
    const held = (last: number) => conversation(last, message("u1", "user"), message("a1", "assistant"));

    expect(needsSummary(held(window - RESERVE), window)).toBe(false);
    expect(needsSummary(held(window - RESERVE + 1), window)).toBe(true);
  });
});

describe("a summary", () => {
  test("keeps a quarter of the window", () => {
    expect(keptTokens(128_000)).toBe(32_000);
    expect(keptTokens(32_000)).toBe(8_000);
  });

  test("cuts before the message from which the newest messages hold the tokens given, where the user sent it", () => {
    const messages = [message("u1", "user"), message("a1", "assistant"), message("u2", "user"), message("a2", "assistant"), message("u3", "user"), message("a3", "assistant")];

    expect(cutOf(messages, 20)).toEqual({ start: 0, first: 4, turnStart: undefined });
    expect(cutOf(messages, 40)).toEqual({ start: 0, first: 2, turnStart: undefined });
  });

  test("cuts before a reply inside an exchange, whose start then gets a summary of its own", () => {
    const messages = [message("u1", "user"), message("a1", "assistant"), results("r1", 400), message("a2", "assistant"), results("r2", 400), message("a3", "assistant")];

    expect(cutOf(messages, 500)).toEqual({ start: 0, first: 3, turnStart: 0 });
  });

  test("never cuts before the results of tool calls, but keeps the reply that made the calls", () => {
    const messages = [message("u1", "user"), message("a1", "assistant"), message("u2", "user"), message("a2", "assistant"), results("r2", 5_000)];

    expect(cutOf(messages, 1_000)).toEqual({ start: 0, first: 3, turnStart: 2 });
  });

  test("may keep what starts on a note of what others changed, as a cut inside its exchange", () => {
    const messages = [message("u1", "user"), message("a1", "assistant"), note("n1"), message("a2", "assistant")];

    expect(cutOf(messages, 20)).toEqual({ start: 0, first: 2, turnStart: 0 });
  });

  test("covers the messages after an earlier summary, which the call updates", () => {
    const messages = [message("s1", "summary"), message("u2", "user"), message("a2", "assistant"), message("u3", "user"), message("a3", "assistant")];

    expect(cutOf(messages, 20)).toEqual({ start: 1, first: 3, turnStart: undefined });
  });

  test("covers nothing where every message fits what it keeps", () => {
    expect(cutOf([message("u1", "user"), message("a1", "assistant")], 1_000)).toBeUndefined();
    expect(cutOf([message("s1", "summary"), results("r1")], 1)).toBeUndefined();
    expect(cutOf([], 1)).toBeUndefined();
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
