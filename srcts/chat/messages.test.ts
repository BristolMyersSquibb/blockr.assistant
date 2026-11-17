// What the chat hands assistant-ui of a conversation (./messages.ts).

import { describe, expect, test } from "vitest";
import type { Kept } from "../conversations/index.ts";
import type { Message, Part } from "../state/index.ts";
import type { Running } from "../turns/index.ts";
import { shownOf, threadMessageOf, waitingCalls } from "./messages.ts";
import type { Turn } from "./messages.ts";

const CREATED = "2026-11-16T08:00:00.000Z";

function message(id: string, role: Message["role"], ...parts: Part[]): Message {
  return { id, role, parts: parts.length > 0 ? parts : [{ type: "text", text: id }], created: CREATED };
}

const call = (id: string, tool = "list_blocks"): Part => ({ type: "tool_call", id, tool, args: {} });
const result = (id: string, text = "[]", more: Partial<Extract<Part, { type: "tool_result" }>> = {}): Part => ({ type: "tool_result", id, text, ...more });
const note = (id: string): Message => message(id, "user", { type: "changes", text: "The user removed block b." });

function keptBy(kept: Readonly<Record<string, Kept>>): (id: string) => Kept | undefined {
  return (id) => (Object.hasOwn(kept, id) ? kept[id] : undefined);
}

const none = keptBy({});

function running(given: Partial<Running> = {}): Running {
  return { conversation: "c1", reply: undefined, results: {}, stopping: false, ...given };
}

describe("what the chat shows of a conversation", () => {
  test("gives each message that the user sent and each summary, and each turn between them as one item", () => {
    const shown = shownOf(
      [message("s1", "summary"), message("u1", "user"), message("a1", "assistant", call("t1")), message("r1", "tool", result("t1")), message("a2", "assistant")],
      undefined,
      none,
    );

    expect(shown.map((item) => ("kind" in item ? item.id : item.role))).toEqual(["summary", "user", "u1-turn"]);
    expect((shown[2] as Turn).messages.map((m) => m.id)).toEqual(["a1", "r1", "a2"]);
  });

  test("leaves out a note of what others changed, which does not end a turn", () => {
    const shown = shownOf([message("u1", "user"), message("a1", "assistant", call("t1")), message("r1", "tool", result("t1")), note("n1"), message("a2", "assistant")], undefined, none);

    expect(shown).toHaveLength(2);
    expect((shown[1] as Turn).messages.map((m) => m.id)).toEqual(["a1", "r1", "a2"]);
  });

  test("keeps a turn's id while it runs, from the message that opened it, and gives the same turn while nothing of it changed", () => {
    const asked = [message("u1", "user")];
    const streaming = shownOf(asked, running({ reply: { parts: [{ type: "text", text: "The" }], reasoning: [] } }), none);
    const answered = [...asked, message("a1", "assistant")];

    expect(streaming.map((item) => item.id)).toEqual(["u1", "u1-turn"]);
    expect(shownOf(answered, undefined, none)[1]).toMatchObject({ id: "u1-turn" });
    expect(shownOf(answered, undefined, none)[1]).toBe(shownOf(answered, undefined, none)[1]);
  });

  test("shows a reply once that entered the conversation while the turn still holds it as it streams", () => {
    const streamed = running({ reply: { parts: [{ type: "text", text: "Looking." }, call("t1")], reasoning: [] } });
    const stored = shownOf([message("u1", "user"), message("a1", "assistant", { type: "text", text: "Looking." }, call("t1"))], streamed, none);

    expect(threadMessageOf(stored[1] as Turn).content).toEqual([
      { type: "text", text: "Looking." },
      { type: "tool-call", toolCallId: "t1", toolName: "list_blocks", args: {} },
    ]);
  });

  test("gives a turn anew where what the memory keeps of its messages changed", () => {
    const messages = [message("u1", "user"), message("a1", "assistant")];
    const before = shownOf(messages, undefined, none)[1];
    const after = shownOf(messages, undefined, keptBy({ a1: { reasoning: ["Thinking."] } }))[1];

    expect(after).not.toBe(before);
  });

  test("shows why a turn failed at the end of that turn, whichever message the memory keeps it by", () => {
    const failed = { failure: "The call failed." };
    const atUser = shownOf([message("u1", "user")], undefined, keptBy({ u1: failed }));
    const atReply = shownOf([message("u1", "user"), message("a1", "assistant"), message("u2", "user")], undefined, keptBy({ a1: failed }));

    expect(threadMessageOf(atUser[1] as Turn).content).toEqual([{ type: "data-failure", data: "The call failed." }]);
    expect(threadMessageOf(atReply[1] as Turn).content).toEqual([
      { type: "text", text: "a1" },
      { type: "data-failure", data: "The call failed." },
    ]);
    expect(atReply.map((item) => item.id)).toEqual(["u1", "u1-turn", "u2"]);
  });
});

describe("the message that assistant-ui draws", () => {
  test("of a message that the user sent holds its text and the files that it names, without a skill's text", () => {
    const sent = message(
      "u1",
      "user",
      { type: "text", text: "/report the sales" },
      { type: "skill", name: "report", text: "How to report." },
      { type: "attachment", name: "sales.csv", media_type: "text/csv" },
    );

    expect(threadMessageOf(sent)).toEqual({
      role: "user",
      id: "u1",
      createdAt: new Date(CREATED),
      content: [
        { type: "text", text: "/report the sales" },
        { type: "data-attachment", data: { name: "sales.csv", media_type: "text/csv" } },
      ],
    });
  });

  test("of a summary is of the role system and holds its text", () => {
    expect(threadMessageOf(message("s1", "summary", { type: "text", text: "We built a chart." }))).toEqual({
      role: "system",
      id: "s1",
      createdAt: new Date(CREATED),
      content: [{ type: "text", text: "We built a chart." }],
    });
  });

  test("of a turn holds each reply's reasoning, text and tool calls, each call with its result and the images that the memory keeps", () => {
    const image = { data: "iVBOR", mimeType: "image/png" };
    const shown = shownOf(
      [
        message("u1", "user"),
        message("a1", "assistant", { type: "text", text: "Looking." }, call("t1", "inspect_results"), call("t2", "describe_block")),
        message("r1", "tool", result("t1", "Drew 2 plots.", { images: 2 }), result("t2", "No block x.", { error: true })),
      ],
      undefined,
      keptBy({ a1: { reasoning: ["Plan.", " "] }, r1: { images: { t1: [image] } } }),
    );

    expect(threadMessageOf(shown[1] as Turn)).toEqual({
      role: "assistant",
      id: "u1-turn",
      createdAt: new Date(CREATED),
      content: [
        { type: "reasoning", text: "Plan." },
        { type: "text", text: "Looking." },
        { type: "tool-call", toolCallId: "t1", toolName: "inspect_results", args: {}, result: { text: "Drew 2 plots.", images: [image], count: 2 }, isError: false },
        { type: "tool-call", toolCallId: "t2", toolName: "describe_block", args: {}, result: { text: "No block x.", images: [], count: 0 }, isError: true },
      ],
    });
  });

  test("of a turn that runs adds the results that returned and the reply as it streams", () => {
    const shown = shownOf(
      [message("u1", "user"), message("a1", "assistant", call("t1"), call("t2"))],
      running({ results: { t1: { text: "[]", isError: false, images: [] } }, reply: undefined }),
      none,
    );

    expect(threadMessageOf(shown[1] as Turn).content).toEqual([
      { type: "tool-call", toolCallId: "t1", toolName: "list_blocks", args: {}, result: { text: "[]", images: [], count: 0 }, isError: false },
      { type: "tool-call", toolCallId: "t2", toolName: "list_blocks", args: {} },
    ]);

    const streaming = shownOf([message("u1", "user")], running({ reply: { parts: [{ type: "text", text: "The" }], reasoning: ["Count."] } }), none);
    expect(threadMessageOf(streaming[1] as Turn)).toEqual({
      role: "assistant",
      id: "u1-turn",
      content: [
        { type: "reasoning", text: "Count." },
        { type: "text", text: "The" },
      ],
    });
  });
});

describe("the tool calls that a turn waits for", () => {
  test("are those of the last reply and of the reply as it streams that have no result yet", () => {
    const messages = [message("u1", "user"), message("a1", "assistant", call("t1"), call("t2"))];
    const turn = running({ results: { t1: { text: "[]", isError: false, images: [] } }, reply: { parts: [call("t3")], reasoning: [] } });

    expect([...waitingCalls(messages, turn)]).toEqual(["t2", "t3"]);
    expect([...waitingCalls(messages, undefined)]).toEqual([]);
    expect([...waitingCalls([...messages, message("r1", "tool", result("t1"), result("t2"))], running())]).toEqual([]);
  });
});
