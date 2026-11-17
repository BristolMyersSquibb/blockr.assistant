// A conversation in the state's shape as pi's messages for a call, the
// message of the app's among them, and pi's messages back in the state's
// shape (./messages.ts).

import type { Api, AssistantMessage, Model, ToolResultMessage, UserMessage } from "@earendil-works/pi-ai";
import { fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { describe, expect, test } from "vitest";
import type { Kept } from "../conversations/index.ts";
import type { Message, Part } from "../state/index.ts";
import type { Tool } from "../tools/index.ts";
import { appMessage, callMessages, ENDED, llmMessages, piMessages, replyOf, resultsOf, STOPPED, SUMMARY_REQUEST } from "./messages.ts";

const model: Model<Api> = {
  id: "gpt-5.4",
  name: "gpt-5.4",
  api: "openai-responses",
  provider: "blockr.assistant",
  baseUrl: "https://api.openai.com/v1",
  reasoning: true,
  input: ["text", "image"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 200_000,
  maxTokens: 32_000,
};

const CREATED = "2026-11-16T08:00:00.000Z";

function message(id: string, role: Message["role"], ...parts: Part[]): Message {
  return { id, role, parts, created: CREATED };
}

const text = (value: string): Part => ({ type: "text", text: value });
const call = (id: string, tool = "list_blocks"): Part => ({ type: "tool_call", id, tool, args: {} });
const result = (id: string, value: string, extra: { error?: boolean; images?: number } = {}): Part => ({ type: "tool_result", id, text: value, ...extra });

const nothingKept = (): Kept | undefined => undefined;

// What pi's messages hold, as a test reads them.
function roles(messages: readonly { role: string }[]): string[] {
  return messages.map((m) => m.role);
}

function texts(content: UserMessage["content"] | ToolResultMessage["content"]): string[] {
  return typeof content === "string" ? [content] : content.flatMap((block) => (block.type === "text" ? [block.text] : []));
}

describe("a conversation as pi's messages", () => {
  test("gives a message that the user sent, a note, a skill and an attachment as text of the role user", () => {
    const [user] = piMessages(
      [
        message(
          "u1",
          "user",
          text("Filter the data."),
          { type: "changes", text: "The user removed the block b." },
          { type: "skill", name: "filters", text: "How to filter." },
          { type: "attachment", name: "plot.png", media_type: "image/png" },
        ),
      ],
      nothingKept,
      model,
    );

    expect(user?.role).toBe("user");
    expect(texts((user as UserMessage).content)).toEqual([
      "Filter the data.",
      "The user removed the block b.",
      "How to filter.",
      'The user attached the file "plot.png", of the type image/png, whose content is no longer available.',
    ]);
  });

  test("gives a reply that the memory keeps as pi wrote it, with its reasoning", () => {
    const written = fauxAssistantMessage([fauxThinking("Look first."), fauxText("Two blocks.")]);
    const [, reply] = piMessages([message("u1", "user", text("How many?")), message("a1", "assistant", text("Two blocks."))], (id) => (id === "a1" ? { reply: written } : undefined), model);

    expect(reply).toBe(written);
  });

  test("gives any other reply as the reply of another model of the same provider and API, without reasoning", () => {
    const [, reply] = piMessages([message("u1", "user", text("Count.")), message("a1", "assistant", text("I look."), call("c1")), message("t1", "tool", result("c1", "[]"))], nothingKept, model);

    expect(reply).toMatchObject({
      role: "assistant",
      api: "openai-responses",
      provider: "blockr.assistant",
      model: "",
      stopReason: "toolUse",
      content: [
        { type: "text", text: "I look." },
        { type: "toolCall", id: "c1", name: "list_blocks", arguments: {} },
      ],
    });
  });

  test("gives each tool call its result, with the images that the memory keeps, or a note of how many the result carried", () => {
    const image = { data: "iVBORw0KGgo=", mimeType: "image/png" };
    const conversation = [
      message("u1", "user", text("Plot.")),
      message("a1", "assistant", call("c1", "inspect_results"), call("c2", "inspect_results")),
      message("t1", "tool", result("c1", "Drew one plot.", { images: 1 }), result("c2", "Drew two plots.", { images: 2 })),
    ];
    const kept = (id: string): Kept | undefined => (id === "t1" ? { images: { c1: [image] } } : undefined);

    const [, , first, second] = piMessages(conversation, kept, model) as [UserMessage, AssistantMessage, ToolResultMessage, ToolResultMessage];

    expect(first).toMatchObject({ role: "toolResult", toolCallId: "c1", toolName: "inspect_results", isError: false });
    expect(first.content).toEqual([{ type: "text", text: "Drew one plot." }, { type: "image", ...image }]);
    expect(texts(second.content)).toEqual([
      "Drew two plots.\n\nThe result also held 2 images, which are no longer available, since the board was opened again.",
    ]);
  });

  test("gives a tool call that has no result one that says the turn ended before the call returned", () => {
    const messages = piMessages([message("u1", "user", text("Count.")), message("a1", "assistant", call("c1"), call("c2")), message("t1", "tool", result("c1", "[]", { error: true }))], nothingKept, model);

    expect(roles(messages)).toEqual(["user", "assistant", "toolResult", "toolResult"]);
    expect(messages[2]).toMatchObject({ toolCallId: "c1", isError: true });
    expect(messages[3]).toMatchObject({ toolCallId: "c2", isError: true, content: [{ type: "text", text: ENDED }] });
  });

  test("gives the calls of a reply that the board holds without its results, as when it was saved during a turn, results that say the turn ended", () => {
    const messages = piMessages([message("u1", "user", text("Count.")), message("a1", "assistant", call("c1"))], nothingKept, model);

    expect(roles(messages)).toEqual(["user", "assistant", "toolResult"]);
    expect(messages[2]).toMatchObject({ toolCallId: "c1", toolName: "list_blocks", content: [{ type: "text", text: ENDED }] });
  });

  test("leaves out results that follow no reply's calls, which no provider takes", () => {
    const messages = piMessages([message("u1", "user", text("Count.")), message("t1", "tool", result("c9", "[]"))], nothingKept, model);

    expect(roles(messages)).toEqual(["user"]);
  });

  test("gives a summary as an exchange: the request for it as the user's, and the summary as the reply", () => {
    const messages = piMessages([message("s1", "summary", text("We added two blocks.")), message("u2", "user", text("Go on."))], nothingKept, model);

    expect(roles(messages)).toEqual(["user", "assistant", "user"]);
    expect(texts((messages[0] as UserMessage).content)).toEqual([SUMMARY_REQUEST]);
    expect((messages[1] as AssistantMessage).content).toEqual([{ type: "text", text: "We added two blocks." }]);
  });

  test("puts the system prompt with the tools' declarations first", () => {
    const tool: Tool = {
      name: "list_blocks",
      description: "List the blocks.",
      parameters: { type: "object", properties: {} },
      executionMode: "parallel",
      execute: () => Promise.resolve({ text: "[]", isError: false, images: [] }),
    };

    const [system] = callMessages([message("u1", "user", text("Hi."))], nothingKept, model, [tool], "Be brief.");

    expect(system).toMatchObject({
      role: "system",
      content: "Be brief.",
      toolsAdded: [{ name: "list_blocks", description: "List the blocks.", parameters: { type: "object", properties: {} } }],
    });
  });
});

describe("the message of the app's", () => {
  test("is a message of the role app among pi's messages, which goes to the model as a message of the role user, while every other message goes as it is", () => {
    const [system, asked] = callMessages([message("u1", "user", text("Hi."))], nothingKept, model, [], "Be brief.");
    const app = appMessage("The board holds two blocks.");

    expect(app).toMatchObject({ role: "app", content: [{ type: "text", text: "The board holds two blocks." }] });
    expect(llmMessages([system, asked, app] as Parameters<typeof llmMessages>[0])).toEqual([
      system,
      asked,
      { role: "user", content: [{ type: "text", text: "The board holds two blocks." }], timestamp: app.timestamp },
    ]);
  });
});

describe("pi's messages in the state's shape", () => {
  test("give a reply its text and its tool calls in order, while the memory keeps its reasoning and the reply as pi wrote it", () => {
    const written = fauxAssistantMessage([fauxThinking("Look first."), fauxText("I look."), fauxToolCall("list_blocks", {}, { id: "c1" })], { stopReason: "toolUse" });

    const reply = replyOf(written);

    expect(reply?.message).toMatchObject({
      role: "assistant",
      parts: [
        { type: "text", text: "I look." },
        { type: "tool_call", id: "c1", tool: "list_blocks", args: {} },
      ],
      created: new Date(written.timestamp).toISOString(),
    });
    expect(reply?.kept).toEqual({ reasoning: ["Look first."], reply: written });
  });

  test("keep no reply as pi wrote it where it did not finish, since pi drops such a reply whole", () => {
    const stopped = fauxAssistantMessage([fauxText("I lo")], { stopReason: "aborted" });

    expect(replyOf(stopped)?.kept).toEqual({});
  });

  test("give no message for a reply that holds no text and no tool call", () => {
    expect(replyOf(fauxAssistantMessage([fauxThinking("Hmm."), fauxText("  ")], { stopReason: "aborted" }))).toBeUndefined();
  });

  test("give the results of a reply's calls as one message of the role tool, in the order of the calls, with the images in the memory", () => {
    const image = { data: "iVBORw0KGgo=", mimeType: "image/png" };
    const answers = { c1: { text: "Drew it.", isError: false, images: [image] }, c2: { text: STOPPED, isError: true, images: [] } };

    const { message: results, kept } = resultsOf([{ type: "tool_call", id: "c1", tool: "inspect_results", args: {} }, { type: "tool_call", id: "c2", tool: "list_blocks", args: {} }], (c) => answers[c.id as "c1" | "c2"]);

    expect(results).toMatchObject({
      role: "tool",
      parts: [
        { type: "tool_result", id: "c1", text: "Drew it.", images: 1 },
        { type: "tool_result", id: "c2", text: STOPPED, error: true },
      ],
    });
    expect(kept).toEqual({ images: { c1: [image] } });
  });
});
