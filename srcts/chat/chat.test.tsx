// The assistant's chat on blockr.core's CoreApi for tests, with its turns on
// pi's fake provider, drawn by React on happy-dom, so that the tests need
// neither R, a browser nor a model.

import type { Json } from "@blockr/core";
import { HELLO, stubCore } from "@blockr/core/stubs";
import { fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, onTestFinished, test, vi } from "vitest";
import { openAssistant } from "../assistant/index.ts";
import type { Assistant } from "../assistant/index.ts";
import { ENDED } from "../loop/index.ts";
// The module of the assistant's class, which core imports as the page does.
// eslint-disable-next-line no-restricted-imports
import * as assistantModule from "../modules/assistant_plugin/index.tsx";
import type { AssistantState, Conversation, Message, Part } from "../state/index.ts";
import { fauxLoop } from "../testing/index.ts";
import { loadLibraries } from "./libraries.ts";
import { renderChat } from "./panel.tsx";

// React warns where an update in a test runs outside act().
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ASSISTANT = "blockr.assistant-assistant_plugin";
const CREATED = "2026-11-16T08:00:00.000Z";
const KEY = "blockr.assistant-open_conversation";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function message(id: string, role: Message["role"], ...parts: Part[]): Message {
  return { id, role, parts: parts.length > 0 ? parts : [{ type: "text", text: id }], created: CREATED };
}

function text(value: string): Part {
  return { type: "text", text: value };
}

function conversation(title: string, ...messages: Message[]): Conversation {
  return { title, updated: CREATED, messages, usage: { input: 0, output: 0, last: 0 }, model: null };
}

interface Options {
  readonly state?: AssistantState;
  // Whether the board holds core's fixture blocks, rather than none.
  readonly blocks?: boolean;
  readonly replies?: FauxResponseStep[];
  readonly tokensPerSecond?: number;
  readonly blockrOptions?: Readonly<Record<string, Json>>;
}

// Core on a board that holds the assistant's state given, with the assistant
// of the board on pi's fake provider, which the class's start would open, and
// the chat drawn in an element of the page, once its libraries have loaded.
// Core stops as the test finishes.
async function chat(options: Options = {}) {
  const board = HELLO.board.board;
  const stubbed = await act(() =>
    stubCore({
      hello: {
        ...HELLO,
        packages: { ...HELLO.packages, "blockr.assistant": "0.2.0" },
        plugins: { ...HELLO.plugins, [ASSISTANT]: { name: "Assistant", version: 1, module: "blockr.assistant/js/assistant_plugin.js" } },
        board: {
          ...HELLO.board,
          board: {
            ...board,
            versions: { ...board.versions, [ASSISTANT]: 1 },
            ...(options.blocks === true ? {} : { blocks: {}, links: {}, stacks: {} }),
            plugins: { ...board.plugins, [ASSISTANT]: options.state ?? { conversations: {} } },
          },
        },
      },
      modules: { [ASSISTANT]: { api: 1, default: { ...assistantModule.default, start: undefined } } },
      ...(options.blockrOptions === undefined ? {} : { blockrOptions: options.blockrOptions }),
    }),
  );
  const controller = new AbortController();
  const { faux, loop, connection } = fauxLoop(options.tokensPerSecond === undefined ? {} : { tokensPerSecond: options.tokensPerSecond });
  faux.setResponses(options.replies ?? [fauxAssistantMessage("The board holds **no** block.")]);
  const assistant = openAssistant(stubbed.core, controller.signal, {
    connection: { ...connection, model: "faux-1" },
    load: () => Promise.resolve(loop),
    locks: undefined,
  });
  await act(() => assistant.conversations.opened);
  await act(() => loadLibraries());

  const el = document.createElement("div");
  document.body.append(el);
  let remove = (): void => undefined;
  act(() => {
    remove = renderChat({ el, core: stubbed.core });
  });
  await settle();

  onTestFinished(() => {
    act(remove);
    el.remove();
    controller.abort();
    act(stubbed.stop);
  });
  return {
    ...stubbed,
    assistant,
    faux,
    el,
    remove: () => {
      act(remove);
    },
  };
}

// Lets the promises and timers that React and the chat started run.
async function settle(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

// Waits until the condition holds, as a reply streams, and then for what
// React draws next, as a reply's text draws once more as the reply completes.
async function until(condition: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    if (condition()) {
      await settle();
      return;
    }
    await settle(5);
  }
  throw new Error(`Timed out waiting for ${what}.`);
}

// Presses the key in the message field, and waits for the field to show what
// the key did, as the message field's store gives it a moment later.
async function key(el: HTMLElement, name: string): Promise<void> {
  press(field(el), name);
  await settle();
}

// Types the text into the message field, as the user would.
function type(el: HTMLElement, value: string): void {
  const field = el.querySelector("textarea");
  if (field === null) throw new Error("The chat draws no message field.");
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function press(target: Element, key: string, init: KeyboardEventInit = {}): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  });
}

function click(target: Element | null): void {
  if (target === null) throw new Error("Nothing to click.");
  act(() => {
    (target as HTMLElement).click();
  });
}

function field(el: HTMLElement): HTMLTextAreaElement {
  const found = el.querySelector("textarea");
  if (found === null) throw new Error("The chat draws no message field.");
  return found;
}

function inState(assistant: Assistant): AssistantState["conversations"] {
  return assistant.conversations.all();
}

describe("the assistant's chat", () => {
  test("shows the greeting of an empty board, with its three suggestions, above the message field", async () => {
    const { el } = await chat();

    expect(el.querySelector(".blockr-assistant-greeting h3")?.textContent).toBe("What do you want to build?");
    expect([...el.querySelectorAll(".blockr-assistant-suggestion")].map((button) => button.textContent)).toEqual([
      "Load a dataset and show me what is in it",
      "Build a chart from one of the built-in datasets",
      "Set up a filtered table I can explore",
    ]);
    expect(field(el).placeholder).toBe("Ask about your board");
  });

  test("sends a message into a conversation that it adds, and streams the reply as Markdown", async () => {
    const { el, assistant } = await chat();

    type(el, "How many blocks?");
    press(field(el), "Enter");
    await until(() => el.querySelector(".blockr-assistant-reply strong") !== null, "the reply");

    const [id, added] = Object.entries(inState(assistant))[0] ?? [];
    expect(added?.title).toBe("New conversation");
    expect(added?.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(localStorage.getItem(KEY)).toBe(id);
    expect(el.querySelector(".blockr-assistant-user-text")?.textContent).toBe("How many blocks?");
    expect(el.querySelector(".blockr-assistant-reply")?.textContent).toBe("The board holds no block.");
    expect(field(el).value).toBe("");
  });

  test("shows the other three suggestions on a board that holds blocks, and a suggestion sends itself as the user's message", async () => {
    const { el, assistant } = await chat({ blocks: true });

    const suggestions = [...el.querySelectorAll(".blockr-assistant-suggestion")];
    expect(el.querySelector(".blockr-assistant-greeting h3")?.textContent).toBe("What do you want to see?");
    expect(suggestions.map((button) => button.textContent)).toEqual([
      "Summarize what is on this board",
      "Add a chart of the data on this board",
      "Check this board for problems",
    ]);

    click(suggestions[0] ?? null);
    await until(() => el.querySelector(".blockr-assistant-reply") !== null, "the reply");

    const sent = Object.values(inState(assistant))[0]?.messages[0];
    expect(sent?.parts).toEqual([{ type: "text", text: "Summarize what is on this board" }]);
    expect(el.querySelector(".blockr-assistant-greeting")).toBeNull();
  });

  test("opens on the conversation that local storage keeps where the board holds it, and on the greeting otherwise", async () => {
    const state: AssistantState = { conversations: { c1: conversation("Sales", message("u1", "user"), message("a1", "assistant")) } };
    localStorage.setItem(KEY, "c1");
    const kept = await chat({ state });
    expect([...kept.el.querySelectorAll(".blockr-assistant-user-text, .blockr-assistant-reply")].map((node) => node.textContent)).toEqual(["u1", "a1"]);

    localStorage.setItem(KEY, "gone");
    const other = await chat({ state });
    expect(other.el.querySelector(".blockr-assistant-greeting")).not.toBeNull();
  });

  test("shows a conversation as the state holds it, whichever command changed it, and the greeting once it goes", async () => {
    localStorage.setItem(KEY, "c1");
    const { el, core } = await chat({ state: { conversations: { c1: conversation("Sales", message("u1", "user")) } } });

    await act(() => core.commands.run("blockr.assistant-add_message", { conversation: "c1", message: message("a1", "assistant", text("From another tab.")) }, "assistant"));
    expect(el.querySelector(".blockr-assistant-reply")?.textContent).toBe("From another tab.");

    await act(() => core.commands.run("blockr.assistant-remove_conversation", { conversation: "c1" }, "assistant"));
    expect(el.querySelector(".blockr-assistant-greeting")).not.toBeNull();
  });

  test("shows the conversations of the plugin's memory alone where chat_save_turns is 0", async () => {
    const { el, assistant, core } = await chat({ blockrOptions: { chat_save_turns: 0 } });

    type(el, "How many blocks?");
    press(field(el), "Enter");
    await until(() => el.querySelector(".blockr-assistant-reply") !== null, "the reply");

    expect((core.store.board().plugins[ASSISTANT] as AssistantState).conversations).toEqual({});
    expect(Object.values(assistant.conversations.all())[0]?.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  test("leaves out the note of what others changed, and shows a slash command as the user typed it, without the skill's text", async () => {
    localStorage.setItem(KEY, "c1");
    const note = message("n1", "user", { type: "changes", text: "The user removed block b." });
    const skill = message("u1", "user", text("/report the sales"), { type: "skill", name: "report", text: "How to report." });
    const { el } = await chat({ state: { conversations: { c1: conversation("Sales", skill, note, message("a1", "assistant")) } } });

    expect([...el.querySelectorAll(".blockr-assistant-user-text")].map((node) => node.textContent)).toEqual(["/report the sales"]);
    expect(el.textContent).not.toContain("How to report.");
    expect(el.textContent).not.toContain("The user removed block b.");
  });

  test("shows a summary as one row that opens to its text", async () => {
    localStorage.setItem(KEY, "c1");
    const summary = message("s1", "summary", text("We built a **sales** chart."));
    const { el } = await chat({ state: { conversations: { c1: conversation("Sales", summary, message("u2", "user"), message("a2", "assistant")) } } });

    const row = el.querySelector(".blockr-assistant-summary details");
    expect(row?.querySelector("summary")?.textContent).toBe("Summary of the earlier messages");
    expect(row?.hasAttribute("open")).toBe(false);
    expect(row?.querySelector("strong")?.textContent).toBe("sales");
  });

  test("shows the model's reasoning as a row that folds, while the board stays open", async () => {
    const { el } = await chat({ replies: [fauxAssistantMessage([fauxThinking("Counting the **blocks**."), fauxText("None.")])] });

    type(el, "How many blocks?");
    press(field(el), "Enter");
    await until(() => el.querySelector(".blockr-assistant-reply .blockr-assistant-markdown") !== null && el.querySelector(".blockr-assistant-working") === null, "the reply");

    const row = el.querySelector(".blockr-assistant-reasoning");
    expect(row?.querySelector("summary")?.textContent).toBe("Reasoning");
    expect(row?.querySelector("strong")?.textContent).toBe("blocks");
    expect(el.querySelector(".blockr-assistant-reply")?.textContent).toContain("None.");
  });

  test("shows a failure that ended a turn at that turn", async () => {
    const { el } = await chat({ replies: [fauxAssistantMessage("", { stopReason: "error", errorMessage: "401 Unauthorized" })] });

    type(el, "How many blocks?");
    press(field(el), "Enter");
    await until(() => el.querySelector(".blockr-assistant-failure") !== null, "the failure");

    expect(el.querySelector(".blockr-assistant-failure")?.textContent).toBe("The assistant's call to the model failed: 401 Unauthorized");
  });
});

describe("the chat's tool calls", () => {
  test("show the calls to one tool with no text between them in one row, titled from the tool's name, which opens to each call", async () => {
    const { el } = await chat({
      replies: [
        fauxAssistantMessage([fauxToolCall("list_blocks", {}, { id: "c-1" }), fauxToolCall("list_links", {}, { id: "c-2" })], { stopReason: "toolUse" }),
        fauxAssistantMessage([fauxToolCall("list_blocks", {}, { id: "c-3" })], { stopReason: "toolUse" }),
        fauxAssistantMessage("Done."),
      ],
    });

    type(el, "What is on the board?");
    press(field(el), "Enter");
    await until(() => el.querySelector(".blockr-assistant-reply")?.textContent.includes("Done.") === true, "the reply");

    const rows = [...el.querySelectorAll(".blockr-assistant-tool")];
    expect(rows.map((row) => row.querySelector(".blockr-assistant-tool-title")?.textContent)).toEqual(["List blocks", "List links"]);
    expect(rows[0]?.querySelector(".blockr-assistant-tool-count")?.textContent).toBe("2");
    expect(rows[0]?.querySelectorAll(".blockr-assistant-call")).toHaveLength(2);
    expect(rows.map((row) => row.getAttribute("data-state"))).toEqual(["done", "done"]);
    expect(rows[0]?.hasAttribute("open")).toBe(false);
  });

  test("mark a call whose result is an error as failed, and one without a result outside a turn as ended before it returned", async () => {
    localStorage.setItem(KEY, "c1");
    const reply = message("a1", "assistant", { type: "tool_call", id: "t1", tool: "describe_block", args: { id: "x" } }, { type: "tool_call", id: "t2", tool: "list_blocks", args: {} });
    const results = message("r1", "tool", { type: "tool_result", id: "t1", text: "No block x.", error: true });
    const { el } = await chat({ state: { conversations: { c1: conversation("Sales", message("u1", "user"), reply, results) } } });

    const rows = [...el.querySelectorAll(".blockr-assistant-tool")];
    expect(rows.map((row) => row.getAttribute("data-state"))).toEqual(["failed", "ended"]);
    expect(rows[1]?.querySelector(".blockr-assistant-call-note")?.textContent).toBe(ENDED);
  });

  test("show the images of a result while the plugin's memory keeps them, and say how many a result had once the board opens again", async () => {
    localStorage.setItem(KEY, "c1");
    const reply = message("a1", "assistant", { type: "tool_call", id: "t1", tool: "inspect_results", args: { code: "plot(1)" } });
    const results = message("r1", "tool", { type: "tool_result", id: "t1", text: "Drew 2 plots.", images: 2 });
    const { el, assistant } = await chat({ state: { conversations: { c1: conversation("Sales", message("u1", "user"), reply, results) } } });

    expect(el.querySelector(".blockr-assistant-tool .blockr-assistant-call-note")?.textContent).toBe("The result had 2 images, which the board does not keep.");

    act(() => {
      assistant.conversations.keep("c1", "r1", { images: { t1: [{ data: "iVBOR", mimeType: "image/png" }] } });
    });
    expect([...el.querySelectorAll(".blockr-assistant-call-image")].map((img) => img.getAttribute("src"))).toEqual(["data:image/png;base64,iVBOR"]);
    expect(el.querySelector(".blockr-assistant-tool .blockr-assistant-call-note")).toBeNull();
  });

  test("name the edit's commands by their labels, and each block of its review with the status that the review gave", async () => {
    localStorage.setItem(KEY, "c1");
    const args = { commands: [{ command: "blockr.core-add_block", args: {} }, { command: "acme-unknown", args: {} }] };
    const review = { applied: true, undo_step: true, blocks: { a: { status: "ready", conditions: [] }, gone: { removed: "The block left the board." } } };
    const reply = message("a1", "assistant", { type: "tool_call", id: "t1", tool: "edit", args });
    const results = message("r1", "tool", { type: "tool_result", id: "t1", text: JSON.stringify(review) });
    const { el } = await chat({ blocks: true, state: { conversations: { c1: conversation("Sales", message("u1", "user"), reply, results) } } });

    const row = el.querySelector(".blockr-assistant-tool");
    expect(row?.querySelector(".blockr-assistant-edit-commands")?.textContent).toBe("Add block, acme-unknown");
    const blocks = [...(row?.querySelectorAll(".blockr-assistant-block") ?? [])];
    // The fixture board names block a Iris, and block gone has left it.
    expect(blocks.map((block) => block.textContent)).toEqual(["Iris", "gone"]);
    expect(blocks[0]?.querySelector(".blockr-assistant-dot")?.hasAttribute("data-filled")).toBe(true);
    expect(blocks[0]?.getAttribute("title")).toBe("Up to date");
    expect(blocks[1]?.hasAttribute("data-removed")).toBe(true);
  });

  test("show the command that refused an edit, and why", async () => {
    localStorage.setItem(KEY, "c1");
    const args = { commands: [{ command: "blockr.core-add_link", args: {} }] };
    const refusal = { applied: false, index: 0, command: "blockr.core-add_link", failures: ["Block z is not on the board."] };
    const reply = message("a1", "assistant", { type: "tool_call", id: "t1", tool: "edit", args });
    const results = message("r1", "tool", { type: "tool_result", id: "t1", text: JSON.stringify(refusal), error: true });
    const { el } = await chat({ state: { conversations: { c1: conversation("Sales", message("u1", "user"), reply, results) } } });

    expect(el.querySelector(".blockr-assistant-edit-refused")?.textContent).toBe("Refused by Add link: Block z is not on the board.");
    expect(el.querySelector(".blockr-assistant-tool")?.getAttribute("data-state")).toBe("failed");
  });
});

describe("the chat while a turn runs", () => {
  test("shows the stop button in the turn's conversation, which stops the turn, as Escape in the chat does", async () => {
    const { el, assistant } = await chat({ tokensPerSecond: 20, replies: [fauxAssistantMessage("One two three four five six seven eight nine ten."), fauxAssistantMessage("Again, slowly, word by word.")] });

    type(el, "Count.");
    press(field(el), "Enter");
    await until(() => el.querySelector(".blockr-assistant-stop") !== null, "the stop button");
    click(el.querySelector(".blockr-assistant-stop"));
    await until(() => assistant.turns.current() === undefined, "the turn to end");
    expect(el.querySelector(".blockr-assistant-stop")).toBeNull();
    expect(el.querySelector(".blockr-assistant-send")).not.toBeNull();

    type(el, "Again.");
    press(field(el), "Enter");
    await until(() => el.querySelector(".blockr-assistant-stop") !== null, "the stop button");
    press(el.querySelector(".blockr-assistant-transcript") ?? el, "Escape");
    await until(() => assistant.turns.current() === undefined, "the turn to end");
  });

  test("lets the user type in another conversation, holds back the send, and says which conversation's turn it waits for", async () => {
    localStorage.setItem(KEY, "c1");
    const state: AssistantState = { conversations: { c1: conversation("Sales", message("u1", "user")), c2: conversation("Costs", message("u2", "user")) } };
    const { el, assistant } = await chat({ state, tokensPerSecond: 20, replies: [fauxAssistantMessage("A long reply that streams for a while, word by word, to the end.")] });

    // The turn streams while the test waits inside act(), so its start
    // needs no act() that stays open beside the others.
    let ended = false;
    act(() => {
      void assistant.turns.run("c2").then(() => {
        ended = true;
      });
    });
    await until(() => assistant.turns.current()?.conversation === "c2", "the turn in c2");
    type(el, "And the costs?");
    press(field(el), "Enter");
    await settle();

    expect(field(el).value).toBe("And the costs?");
    expect(el.querySelector(".blockr-assistant-stop")).toBeNull();
    expect(el.querySelector(".blockr-assistant-send")?.getAttribute("aria-label")).toBe("Sends once the turn in “Costs” ends");
    expect(el.querySelector(".blockr-assistant-composer-note")?.textContent).toBe("A turn runs in “Costs”.");
    expect(assistant.conversations.get("c1")?.messages).toHaveLength(1);
    act(() => {
      assistant.turns.stop();
    });
    await until(() => ended, "the turn to end");
  });

  test("goes on once the panel closes, and shows the reply as the chat mounts again", async () => {
    const { el, assistant, core, remove } = await chat({ tokensPerSecond: 50, replies: [fauxAssistantMessage("The reply that streams while no panel shows.")] });

    type(el, "Count.");
    press(field(el), "Enter");
    await until(() => assistant.turns.current() !== undefined, "the turn");
    remove();
    await until(() => assistant.turns.current() === undefined, "the turn to end");

    let again = (): void => undefined;
    act(() => {
      again = renderChat({ el, core });
    });
    await settle();
    expect(el.querySelector(".blockr-assistant-reply")?.textContent).toBe("The reply that streams while no panel shows.");
    act(again);
  });
});

describe("the chat's message field", () => {
  test("brings back the user's earlier messages with Up and Down into an empty field", async () => {
    localStorage.setItem(KEY, "c1");
    const state: AssistantState = {
      conversations: { c1: conversation("Sales", message("u1", "user", text("first")), message("a1", "assistant"), message("u2", "user", text("second")), message("a2", "assistant")) },
    };
    const { el } = await chat({ state });

    await key(el, "ArrowUp");
    expect(field(el).value).toBe("second");
    await key(el, "ArrowUp");
    expect(field(el).value).toBe("first");
    await key(el, "ArrowDown");
    expect(field(el).value).toBe("second");
    await key(el, "ArrowDown");
    expect(field(el).value).toBe("");
  });

  test("starts a new line on Shift+Enter, rather than sending", async () => {
    const { el, assistant } = await chat();

    type(el, "Two");
    press(field(el), "Enter", { shiftKey: true });
    await settle();

    expect(Object.keys(assistant.conversations.all())).toEqual([]);
  });
});

describe("the chat's text", () => {
  test("draws tables, and code blocks with a button that copies them", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockImplementation(() => Promise.resolve());
    const { el, assistant } = await chat({ replies: [fauxAssistantMessage("| a | b |\n|---|---|\n| 1 | 2 |\n\n```r\nhead(x)\n```")] });

    type(el, "Show me.");
    press(field(el), "Enter");
    await until(() => el.querySelector('.blockr-assistant-markdown[data-status="complete"] .blockr-assistant-copy') !== null && assistant.turns.current() === undefined, "the code block");

    expect(el.querySelector(".blockr-assistant-table td")?.textContent).toBe("1");
    click(el.querySelector(".blockr-assistant-copy"));
    await settle();
    // The button copies the code as the code block holds it, with its last
    // newline, as today's does.
    expect(writeText).toHaveBeenCalledWith("head(x)\n");
    expect(el.querySelector(".blockr-assistant-copy")?.textContent).toBe("Copied");
  });

  test("opens a link to another site only after a dialog, in a tab of its own", async () => {
    const opened = vi.spyOn(globalThis, "open").mockImplementation(() => null);
    const { el, assistant } = await chat({ replies: [fauxAssistantMessage("See [the docs](https://example.org/docs).")] });

    type(el, "Where?");
    press(field(el), "Enter");
    await until(() => el.querySelector('.blockr-assistant-markdown[data-status="complete"] a') !== null && assistant.turns.current() === undefined, "the link");
    const link = el.querySelector(".blockr-assistant-markdown a");
    expect(link?.getAttribute("target")).toBe("_blank");

    click(link);
    const dialog = el.querySelector("dialog");
    expect(dialog?.open).toBe(true);
    expect(dialog?.querySelector(".blockr-assistant-dialog-url")?.textContent).toBe("https://example.org/docs");
    expect(document.activeElement?.className).toBe("blockr-assistant-dialog-open");
    expect(opened).not.toHaveBeenCalled();

    click(dialog?.querySelector(".blockr-assistant-dialog-open") ?? null);
    expect(opened).toHaveBeenCalledWith("https://example.org/docs", "_blank", "noopener,noreferrer");
    expect(dialog?.open).toBe(false);
  });
});
