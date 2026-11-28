// Where a call to one of Anthropic's models marks the end of what Anthropic's
// cache keeps (./cache.ts): the loop moves pi's mark from the message of the
// app's to the end of the conversation before it.
// The requests have the shapes that pi sends on Anthropic's Messages API and
// on Chat Completions.

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
    expect(markBeforeAppMessage(request(asked, board), BOARD, "anthropic-messages")).toEqual(
      request({ role: "user", content: [{ type: "text", text: "How many blocks?", cache_control: MARK }] }, { role: "user", content: [{ type: "text", text: BOARD }] }),
    );
  });

  test("moves to the last result of a reply's tool calls, at a later call, and leaves every other block as it was", () => {
    const moved = markBeforeAppMessage(request(asked, called, results, board), BOARD, "anthropic-messages") as ReturnType<typeof request>;

    expect(moved.messages).toEqual([
      asked,
      called,
      { role: "user", content: [results.content[0], { ...results.content[1], cache_control: MARK }] },
      { role: "user", content: [{ type: "text", text: BOARD }] },
    ]);
    expect(moved.system).toEqual(request().system);
    expect(moved.tools).toEqual(request().tools);
  });

  test("moves to a note of what others changed in the board, which ends the conversation before the message of the app's", () => {
    const note = { role: "user", content: [{ type: "text", text: "This message comes from the app, not from the user.\n\n## Changes\n- Block b: removed by the user." }] };

    const moved = markBeforeAppMessage(request(asked, called, results, note, board), BOARD, "anthropic-messages") as ReturnType<typeof request>;

    expect(moved.messages).toEqual([asked, called, results, { role: "user", content: [{ ...note.content[0], cache_control: MARK }] }, { role: "user", content: [{ type: "text", text: BOARD }] }]);
  });

  test("moves past the message of the role system that pi adds behind the message of the app's for the effort of the reply", () => {
    const effort = { role: "system", content: [], output_config: { effort: "medium" } };

    const moved = markBeforeAppMessage(request(asked, board, effort), BOARD, "anthropic-messages") as ReturnType<typeof request>;

    expect(moved.messages).toEqual([{ role: "user", content: [{ type: "text", text: "How many blocks?", cache_control: MARK }] }, { role: "user", content: [{ type: "text", text: BOARD }] }, effort]);
  });

  test("moves to a message whose content is a text, which then holds it as a block", () => {
    const moved = markBeforeAppMessage(request({ role: "user", content: "How many blocks?" }, board), BOARD, "anthropic-messages") as ReturnType<typeof request>;

    expect(moved.messages[0]).toEqual({ role: "user", content: [{ type: "text", text: "How many blocks?", cache_control: MARK }] });
  });

  test("finds the message of the app's whose text pi sent without the halves of a surrogate pair that stand alone", () => {
    const text = `${BOARD}\n- a\uD800 <blockr.core::head_block>`;
    const sent = { role: "user", content: [{ type: "text", text: text.replace("\uD800", ""), cache_control: MARK }] };

    expect(markBeforeAppMessage(request(asked, sent), text, "anthropic-messages")).not.toBeUndefined();
  });

  test("leaves the request as it is where the message of the app's carries no mark, as where pi caches nothing", () => {
    expect(markBeforeAppMessage(request(asked, { role: "user", content: [{ type: "text", text: BOARD }] }), BOARD, "anthropic-messages")).toBeUndefined();
  });

  test("leaves the request as it is where its last message of the role user is not the message of the app's", () => {
    expect(markBeforeAppMessage(request(asked, board), "Another board.", "anthropic-messages")).toBeUndefined();
    expect(markBeforeAppMessage(request(board, asked), BOARD, "anthropic-messages")).toBeUndefined();
  });

  test("leaves the request as it is where the block before the message of the app's takes no mark, or no block comes before it", () => {
    const thought = { role: "assistant", content: [{ type: "thinking", thinking: "Count them.", signature: "s" }] };

    expect(markBeforeAppMessage(request(thought, board), BOARD, "anthropic-messages")).toBeUndefined();
    expect(markBeforeAppMessage(request(board), BOARD, "anthropic-messages")).toBeUndefined();
    expect(markBeforeAppMessage({ input: [] }, BOARD, "anthropic-messages")).toBeUndefined();
  });
});

// The request that pi makes of a call on Chat Completions for a model whose
// compat names Anthropic's format of cache marks, with the system prompt and
// the tools marked as pi marks them, and then the messages given.
function completions(...messages: unknown[]) {
  return {
    model: "anthropic/claude-haiku-5.5",
    messages: [{ role: "system", content: [{ type: "text", text: "You are an assistant.", cache_control: MARK }] }, ...messages],
    stream: true,
    tools: [{ type: "function", function: { name: "list_blocks", parameters: { type: "object" } }, cache_control: MARK }],
  };
}

const callsTool = { role: "assistant", content: "I will look.", tool_calls: [{ id: "t1", type: "function", function: { name: "list_blocks", arguments: "{}" } }] };
const listedBlocks = { role: "tool", content: "[]", tool_call_id: "t1" };
const plotted = { role: "tool", content: "Drew a plot.", tool_call_id: "t2" };
const plots = {
  role: "user",
  content: [
    { type: "text", text: "Attached image(s) from tool result:" },
    { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } },
  ],
};

describe("the mark of Anthropic's cache on Chat Completions", () => {
  test("moves from the message of the app's to the user's message, at a turn's first call", () => {
    expect(markBeforeAppMessage(completions(asked, board), BOARD, "openai-completions")).toEqual(
      completions({ role: "user", content: [{ type: "text", text: "How many blocks?", cache_control: MARK }] }, { role: "user", content: [{ type: "text", text: BOARD }] }),
    );
  });

  test("moves to the last tool's result, whose text then goes as a part, at a later call, and leaves every other message as it was", () => {
    const moved = markBeforeAppMessage(completions(asked, callsTool, listedBlocks, plotted, board), BOARD, "openai-completions");

    expect(moved).toEqual(
      completions(asked, callsTool, listedBlocks, { ...plotted, content: [{ type: "text", text: "Drew a plot.", cache_control: MARK }] }, { role: "user", content: [{ type: "text", text: BOARD }] }),
    );
  });

  test("moves to the line of text before the images of a tool's result, which pi sends in a message of the role user", () => {
    const moved = markBeforeAppMessage(completions(asked, callsTool, plotted, plots, board), BOARD, "openai-completions") as ReturnType<typeof completions>;

    expect(moved.messages.at(-2)).toEqual({ role: "user", content: [{ ...plots.content[0], cache_control: MARK }, plots.content[1]] });
    expect(moved.messages.at(-3)).toEqual(plotted);
  });

  test("leaves the request as it is where the message of the app's carries no mark, as for a model whose compat names no format of cache marks", () => {
    const unmarked = { model: "openai/gpt-5.4", messages: [{ role: "system", content: "You are an assistant." }, asked, { role: "user", content: [{ type: "text", text: BOARD }] }] };

    expect(markBeforeAppMessage(unmarked, BOARD, "openai-completions")).toBeUndefined();
  });
});

describe("the request of another API", () => {
  test("is left as pi built it, as on OpenAI's Responses API", () => {
    expect(markBeforeAppMessage(request(asked, board), BOARD, "openai-responses")).toBeUndefined();
  });
});
