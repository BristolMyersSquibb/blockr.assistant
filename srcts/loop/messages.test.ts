// A conversation in the state's shape as pi's messages for a call, the
// message of the app's among them, and pi's messages back in the state's
// shape (./messages.ts).

import type { Api, AssistantMessage, Model, ToolResultMessage, UserMessage } from "@earendil-works/pi-ai";
import { fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { describe, expect, test } from "vitest";
import type { Kept, KeptFile } from "../conversations/index.ts";
import type { Message, Part } from "../state/index.ts";
import type { Tool } from "../tools/index.ts";
import type { Encoded } from "../attachments/index.ts";
import { appMessage, callMessages, convertReply, encodeFiles, ENDED, llmMessages, piMessages, resultsOf, STOPPED, SUMMARY_PREFIX, SUMMARY_SUFFIX } from "./messages.ts";
import type { CallFiles, Carried } from "./messages.ts";

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
  test("gives a message that the user sent as text of the role user, with each of its parts: a skill, an attachment, and a part of the type changes beside them", () => {
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

  test("gives a note of what others changed in the board as a message of the app's, which goes to the model as a message of the role user", () => {
    const written = "This message comes from the app, not from the user.\n\n## Changes\n- Block b: removed by the user.";
    const messages = piMessages(
      [message("u1", "user", text("Filter the data.")), message("a1", "assistant", text("Done.")), message("n1", "user", { type: "changes", text: written })],
      nothingKept,
      model,
    );

    expect(roles(messages)).toEqual(["user", "assistant", "app"]);
    expect(messages[2]).toEqual({ role: "app", content: [{ type: "text", text: written }], timestamp: Date.parse(CREATED) });
    expect(llmMessages(messages)[2]).toEqual({ role: "user", content: [{ type: "text", text: written }], timestamp: Date.parse(CREATED) });
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

  test("gives a summary as a message of the role user, which says that it holds the summary of what came before, as pi's CLI frames one", () => {
    const messages = piMessages([message("s1", "summary", text("We added two blocks.")), message("a2", "assistant", text("Done."))], nothingKept, model);

    expect(roles(messages)).toEqual(["user", "assistant"]);
    expect(texts((messages[0] as UserMessage).content)).toEqual([`${SUMMARY_PREFIX}We added two blocks.${SUMMARY_SUFFIX}`]);
    expect(SUMMARY_PREFIX).toContain("The conversation history before this point was compacted into the following summary:");
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

describe("the files that the user attached, as pi's messages", () => {
  const attachment = (name: string, mediaType: string): Part => ({ type: "attachment", name, media_type: mediaType });
  const asked = message("u1", "user", text("Look at these."), attachment("plot.png", "image/png"), attachment("report.pdf", "application/pdf"), attachment('a "b" <c>.csv', "text/csv"));
  // The copies of the files that the memory keeps, and their content as the
  // loop encoded it for the turn.
  const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])]);
  const pdf = new Blob(["%PDF-1.4\n"]);
  const csv = new Blob(["a,b\n1,2"]);
  const files: KeptFile[] = [{ blob: png }, { blob: pdf }, { blob: csv }];
  const encoded = new Map<Blob, Encoded>([
    [png, { data: "iVBORw0KGgo=" }],
    [pdf, { data: "JVBERi0xLjQK" }],
    [csv, { text: "a,b\n1,2" }],
  ]);
  const sent = (carried?: Carried): CallFiles => ({ encoded: (file) => encoded.get(file), ...(carried === undefined ? {} : { carried }) });
  const keeping =
    (held: readonly KeptFile[]) =>
    (id: string): Kept | undefined =>
      id === "u1" ? { files: held } : undefined;

  test("give an image and a PDF as pi's images after a line that names each, and a text file as its text in the tag of today's chat", () => {
    const [user] = piMessages([asked], keeping(files), model, sent()) as [UserMessage];

    expect(user.content).toEqual([
      { type: "text", text: "Look at these." },
      { type: "text", text: 'The user attached the file "plot.png", of the type image/png.' },
      { type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" },
      { type: "text", text: 'The user attached the file "report.pdf", of the type application/pdf.' },
      { type: "image", data: "JVBERi0xLjQK", mimeType: "application/pdf" },
      { type: "text", text: '<file-attachment name="a &quot;b&quot; &lt;c&gt;.csv" type="text/csv">\na,b\n1,2\n</file-attachment>' },
    ]);
  });

  test("note each file that no call carried with success before, and the name of each PDF, in order", () => {
    const carried: Carried = { files: [], pdfs: [] };
    const later = message("u2", "user", attachment("annex.pdf", "application/pdf"));
    const kept = (id: string): Kept | undefined => (id === "u1" ? { files: [{ blob: png, taken: true }, { blob: pdf }, { blob: csv }] } : id === "u2" ? { files: [{ blob: pdf }] } : undefined);

    callMessages([asked, message("a1", "assistant", text("Seen.")), later], kept, model, [], "", sent(carried));

    expect(carried.files).toEqual([
      { message: "u1", index: 1, name: "report.pdf" },
      { message: "u1", index: 2, name: 'a "b" <c>.csv' },
      { message: "u2", index: 0, name: "annex.pdf" },
    ]);
    expect(carried.pdfs).toEqual(["report.pdf", "annex.pdf"]);
  });

  test("give a model that takes no images neither an image nor a PDF, but their names, and a text file still", () => {
    const carried: Carried = { files: [], pdfs: [] };
    const [user] = piMessages([asked], keeping(files), { ...model, input: ["text"] }, sent(carried)) as [UserMessage];

    expect(texts(user.content)).toEqual([
      "Look at these.",
      'The user attached the file "plot.png", of the type image/png, which the app did not send, since the model takes no images.',
      'The user attached the file "report.pdf", of the type application/pdf, which the app did not send, since the model takes no images.',
      '<file-attachment name="a &quot;b&quot; &lt;c&gt;.csv" type="text/csv">\na,b\n1,2\n</file-attachment>',
    ]);
    expect(Array.isArray(user.content) && user.content.some((block) => block.type === "image")).toBe(false);
    expect(carried).toEqual({ files: [{ message: "u1", index: 2, name: 'a "b" <c>.csv' }], pdfs: [] });
  });

  test("give a file that the provider refused, one whose content the memory lacks and one that the loop could not encode as their names alone", () => {
    const carried: Carried = { files: [], pdfs: [] };
    const unread = new Blob(["unread"]);
    const [user] = piMessages([asked], keeping([{ refused: true }, { blob: unread }]), model, sent(carried)) as [UserMessage];

    expect(texts(user.content)).toEqual([
      "Look at these.",
      'The user attached the file "plot.png", of the type image/png, which the provider refused, so the conversation goes on without its content.',
      'The user attached the file "report.pdf", of the type application/pdf, whose content is no longer available.',
      'The user attached the file "a "b" <c>.csv", of the type text/csv, whose content is no longer available.',
    ]);
    expect(carried).toEqual({ files: [], pdfs: [] });
  });

  test("are encoded by the loop once for a turn: an image's and a PDF's bytes as base64, and a text file's text", async () => {
    const encodings = new Map<Blob, Encoded>();
    const conversation = [asked, message("a1", "assistant", text("Seen."))];

    await encodeFiles(conversation, keeping(files), encodings);
    const first = encodings.get(png);
    await encodeFiles(conversation, keeping([...files.slice(0, 2), { refused: true }]), encodings);

    expect(encodings.size).toBe(3);
    for (const [file, content] of encoded) expect(encodings.get(file)).toEqual(content);
    expect(encodings.get(png)).toBe(first);
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

    const reply = convertReply(written);

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

    expect(convertReply(stopped)?.kept).toEqual({});
  });

  test("give no message for a reply that holds no text and no tool call", () => {
    expect(convertReply(fauxAssistantMessage([fauxThinking("Hmm."), fauxText("  ")], { stopReason: "aborted" }))).toBeUndefined();
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
