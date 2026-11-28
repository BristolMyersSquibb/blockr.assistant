// How the assistant's state counts and cuts the messages of a conversation,
// which its commands and the plugin's memory share.

import { describe, expect, test } from "vitest";
import { at, canCompact, isNote, messagesToDrop } from "./index.ts";
import type { Message, Role } from "./index.ts";

function message(id: string, role: Role, type: "text" | "changes" = "text"): Message {
  return { id, role, parts: [{ type, text: id }], created: "2026-11-16T08:00:00.000Z" };
}

const note = (id: string): Message => message(id, "user", "changes");

describe("isNote()", () => {
  test("tells a note of what others changed from a message that the user sent", () => {
    expect(isNote(note("n"))).toBe(true);
    expect(isNote(message("u", "user"))).toBe(false);
    expect(isNote(message("s", "summary", "changes"))).toBe(false);
  });
});

describe("messagesToDrop()", () => {
  // Three exchanges: u1 with its reply, u2 with a note, a reply that calls a
  // tool, the tool's result and the last reply, and u3 with its reply.
  const conversation = [
    message("u1", "user"),
    message("a1", "assistant"),
    message("u2", "user"),
    note("n2"),
    message("a2", "assistant"),
    message("t2", "tool"),
    message("b2", "assistant"),
    message("u3", "user"),
    message("a3", "assistant"),
  ];

  test("drops none where the messages fit the cap, notes left out", () => {
    expect(messagesToDrop(conversation, 8)).toBe(0);
    expect(messagesToDrop(conversation, 50)).toBe(0);
  });

  test("drops the oldest exchanges until the messages fit the cap", () => {
    expect(messagesToDrop(conversation, 7)).toBe(2);
    expect(messagesToDrop(conversation, 6)).toBe(2);
    expect(messagesToDrop(conversation, 5)).toBe(7);
    expect(messagesToDrop(conversation, 2)).toBe(7);
  });

  test("never drops the last exchange, however many messages it holds", () => {
    expect(messagesToDrop(conversation, 1)).toBe(7);
    expect(messagesToDrop(conversation.slice(0, 7), 3)).toBe(2);
  });

  test("cuts at a summary, which is an exchange of its own", () => {
    const compacted = [message("s", "summary"), message("a1", "assistant"), message("u2", "user"), message("a2", "assistant")];

    expect(messagesToDrop(compacted, 3)).toBe(2);
    expect(messagesToDrop([message("x", "assistant"), ...compacted], 3)).toBe(3);
  });

  test("cuts at no note, which is no message that the user sent", () => {
    const noted = [message("u1", "user"), message("a1", "assistant"), note("n"), message("a2", "assistant")];

    expect(messagesToDrop(noted, 2)).toBe(0);
  });

  test("drops none where no message opens an exchange", () => {
    expect(messagesToDrop([message("a1", "assistant"), message("a2", "assistant")], 1)).toBe(0);
  });
});

describe("canCompact()", () => {
  const messages = [message("u1", "user"), message("a1", "assistant"), message("u2", "user")];

  test("takes a summary before a message that the conversation holds", () => {
    expect(canCompact(messages, message("s", "summary"), "u2")).toBe(true);
    expect(canCompact(messages, message("a1", "summary"), "u2")).toBe(true);
  });

  test("refuses a message that the conversation lacks, or a summary whose id one that it keeps has", () => {
    expect(canCompact(messages, message("s", "summary"), "u3")).toBe(false);
    expect(canCompact(messages, message("u2", "summary"), "a1")).toBe(false);
  });
});

describe("at()", () => {
  test("points into the assistant's state, escaping each segment", () => {
    expect(at("conversations", "a/b~c", "messages", "-")).toBe(
      "/plugins/blockr.assistant/assistant_plugin/conversations/a~1b~0c/messages/-",
    );
  });
});
