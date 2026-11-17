// Where a call to Anthropic's Messages API marks the end of what its cache
// keeps (./cache.ts): the loop moves pi's mark from the message of the app's
// to the block before it, on requests in the shape that pi sends.

import { describe, expect, test } from "vitest";
import { markBeforeAppMessage } from "./cache.ts";

const MARK = { type: "ephemeral" };
const BOARD = "This message comes from the app, not from the user.\n\n## Board\n1 block(s), 0 link(s), 0 stack(s).";

// The request that pi makes of a call, whose messages are those given, with
// the system prompt and the tools marked as pi marks them.
function request(...messages: unknown[]) {
  return {
    model: "claude-haiku-5-5",
    system: [{ type: "text", text: "You are an assistant.", cache_control: MARK }],
    tools: [{ name: "list_blocks", input_schema: { type: "object" }, cache_control: MARK }],
    messages,
    max_tokens: 1024,
    stream: true,
  };
}

const asked = { role: "user", content: [{ type: "text", text: "How many blocks?" }] };
const board = { role: "user", content: [{ type: "text", text: BOARD, cache_control: MARK }] };
const called = { role: "assistant", content: [{ type: "text", text: "I will look." }, { type: "tool_use", id: "t1", name: "list_blocks", input: {} }] };
const results = {
  role: "user",
  content: [
    { type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "[]" }] },
    { type: "tool_result", tool_use_id: "t2", content: [{ type: "text", text: "{}" }] },
  ],
};

describe("the mark of Anthropic's cache", () => {
  test("moves from the message of the app's to the user's message, at a turn's first call", () => {
    expect(markBeforeAppMessage(request(asked, board), BOARD)).toEqual(
      request({ role: "user", content: [{ type: "text", text: "How many blocks?", cache_control: MARK }] }, { role: "user", content: [{ type: "text", text: BOARD }] }),
    );
  });

  test("moves to the last result of a reply's tool calls, at a later call, and leaves every other block as it was", () => {
    const moved = markBeforeAppMessage(request(asked, called, results, board), BOARD) as ReturnType<typeof request>;

    expect(moved.messages).toEqual([
      asked,
      called,
      { role: "user", content: [results.content[0], { ...results.content[1], cache_control: MARK }] },
      { role: "user", content: [{ type: "text", text: BOARD }] },
    ]);
    expect(moved.system).toEqual(request().system);
    expect(moved.tools).toEqual(request().tools);
  });

  test("moves past the message of the role system that pi adds behind the message of the app's for the effort of the reply", () => {
    const effort = { role: "system", content: [], output_config: { effort: "medium" } };

    const moved = markBeforeAppMessage(request(asked, board, effort), BOARD) as ReturnType<typeof request>;

    expect(moved.messages).toEqual([{ role: "user", content: [{ type: "text", text: "How many blocks?", cache_control: MARK }] }, { role: "user", content: [{ type: "text", text: BOARD }] }, effort]);
  });

  test("moves to a message whose content is a text, which then holds it as a block", () => {
    const moved = markBeforeAppMessage(request({ role: "user", content: "How many blocks?" }, board), BOARD) as ReturnType<typeof request>;

    expect(moved.messages[0]).toEqual({ role: "user", content: [{ type: "text", text: "How many blocks?", cache_control: MARK }] });
  });

  test("finds the message of the app's whose text pi sent without the halves of a surrogate pair that stand alone", () => {
    const text = `${BOARD}\n- a\uD800 <blockr.core-head_block>`;
    const sent = { role: "user", content: [{ type: "text", text: text.replace("\uD800", ""), cache_control: MARK }] };

    expect(markBeforeAppMessage(request(asked, sent), text)).not.toBeUndefined();
  });

  test("leaves the request as it is where the message of the app's carries no mark, as where pi caches nothing", () => {
    expect(markBeforeAppMessage(request(asked, { role: "user", content: [{ type: "text", text: BOARD }] }), BOARD)).toBeUndefined();
  });

  test("leaves the request as it is where its last message of the role user is not the message of the app's", () => {
    expect(markBeforeAppMessage(request(asked, board), "Another board.")).toBeUndefined();
    expect(markBeforeAppMessage(request(board, asked), BOARD)).toBeUndefined();
  });

  test("leaves the request as it is where the block before the message of the app's takes no mark, or no block comes before it", () => {
    const thought = { role: "assistant", content: [{ type: "thinking", thinking: "Count them.", signature: "s" }] };

    expect(markBeforeAppMessage(request(thought, board), BOARD)).toBeUndefined();
    expect(markBeforeAppMessage(request(board), BOARD)).toBeUndefined();
    expect(markBeforeAppMessage({ input: [] }, BOARD)).toBeUndefined();
  });
});
