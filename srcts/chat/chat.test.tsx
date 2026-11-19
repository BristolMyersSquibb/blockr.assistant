// The assistant's chat on blockr.core's CoreApi for tests, with its turns on
// pi's fake provider, drawn by React on happy-dom, so that the tests need
// neither R, a browser nor a model.

import type { Json } from "@blockr/core";
import { HELLO, stubCore } from "@blockr/core/stubs";
import type { Answer } from "@blockr/core/stubs";
import { fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";
import { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, onTestFinished, test, vi } from "vitest";
import { openAssistant } from "../assistant/index.ts";
import type { Assistant } from "../assistant/index.ts";
import type { Credential } from "../deployment/index.ts";
import { ENDED, loadCatalogs } from "../loop/index.ts";
// The module of the assistant's class, which core imports as the page does.
// eslint-disable-next-line no-restricted-imports
import * as assistantModule from "../modules/assistant_plugin/index.tsx";
import { CHANNEL, createOpenRouterLogin } from "../openrouter/index.ts";
import type { OpenRouterLogin, OpenWindow } from "../openrouter/index.ts";
import type { AssistantState, Conversation, Message, Part } from "../state/index.ts";
import { fauxLoop, storedIn } from "../testing/index.ts";
import { createVisitorKey } from "../visitor-key/index.ts";
import type { VisitorKey } from "../visitor-key/index.ts";
import { loadLibraries } from "./libraries.ts";
import { renderChat } from "./panel.tsx";

// React warns where an update in a test runs outside act().
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ASSISTANT = "blockr.assistant-assistant_plugin";
const CREATED = "2026-11-16T08:00:00.000Z";
const KEY = "blockr.assistant-open_conversation";

// The file imports the chat's libraries and pi's bundle once, before its
// tests: the first import of libraries that large can take longer than a
// test's time on a busy machine.
beforeAll(() => Promise.all([loadLibraries(), loadCatalogs("https://faux.invalid/v1")]), 60_000);

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
  // The models that the deployment names, faux-1 alone unless given.
  readonly models?: readonly string[];
  // How the calls are authenticated, with the deployment's key unless given.
  readonly credential?: Credential;
  // The visitor's own key, which holds none unless given.
  readonly key?: VisitorKey;
  // OpenRouter's login, which gives the visitor's key, the key's own unless
  // given.
  readonly openRouterLogin?: OpenRouterLogin;
  // How R answers the requests that core sends, as the assistant's requests,
  // which go unanswered unless given.
  readonly answer?: Answer;
}

// Core on a board that holds the assistant's state given, with the assistant
// of the board on pi's fake provider at https://faux.invalid/v1, which the
// class's start would open, and the chat drawn in an element of the page, once
// its libraries have loaded. Core stops as the test finishes.
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
            ...(options.blocks === true ? {} : { blocks: {}, links: {}, stacks: {} }),
            plugins: { ...board.plugins, [ASSISTANT]: { state: options.state ?? { conversations: {} }, version: 1 } },
          },
        },
      },
      modules: { [ASSISTANT]: { api: 1, default: { ...assistantModule.default, start: undefined } } },
      ...(options.blockrOptions === undefined ? {} : { blockrOptions: options.blockrOptions }),
      ...(options.answer === undefined ? {} : { answer: options.answer }),
    }),
  );
  const controller = new AbortController();
  const { faux, loop, connection } = fauxLoop(options.tokensPerSecond === undefined ? {} : { tokensPerSecond: options.tokensPerSecond });
  faux.setResponses(options.replies ?? [fauxAssistantMessage("The board holds **no** block.")]);
  const assistant = openAssistant(stubbed.core, controller.signal, {
    deployment: Promise.resolve({ baseUrl: connection.baseUrl, api: connection.api, credential: options.credential ?? { kind: "deployment", key: "test-key" }, models: options.models ?? ["faux-1"] }),
    load: () => Promise.resolve(loop),
    locks: undefined,
    key: options.key ?? createVisitorKey(),
    ...(options.openRouterLogin === undefined ? {} : { openRouterLogin: options.openRouterLogin }),
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
// It waits for up to 20 seconds, which a busy machine may take.
async function until(condition: () => boolean, what: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < 20_000) {
    if (condition()) {
      await settle();
      return;
    }
    await settle(5);
  }
  throw new Error(`Timed out waiting for ${what}.`);
}

// A reply that holds its turn until the test lets the reply go or the turn
// stops, so that the test acts on the turn while it surely runs, however long
// a busy machine pauses between two looks at it.
function heldReply(text: string): { readonly reply: FauxResponseStep; readonly release: () => void } {
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reply: FauxResponseStep = async (_context, options) => {
    await new Promise<void>((resolve) => {
      void released.then(resolve);
      const signal = options?.signal;
      if (signal?.aborted === true) resolve();
      signal?.addEventListener("abort", () => {
        resolve();
      });
    });
    return fauxAssistantMessage(text);
  };
  return { reply, release };
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

// The text field of the footer's select that the label names, or null where
// the footer offers no such pick.
function pickField(el: HTMLElement, label: string): HTMLInputElement | null {
  return el.querySelector<HTMLInputElement>(`.blockr-assistant-footer input[aria-label="${label}"]`);
}

// The options of the select's list, which the field names while the list is
// open, as React Aria draws the list at the end of the page's body.
function optionsOf(field: HTMLInputElement): HTMLElement[] {
  const id = field.getAttribute("aria-controls");
  const list = id === null ? null : document.getElementById(id);
  return [...(list?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
}

// The texts of the options that the select offers, whose list it opens and
// closes again.
async function offeredBy(field: HTMLInputElement | null): Promise<string[]> {
  if (field === null) throw new Error("The footer offers no such pick.");
  click(field);
  await settle();
  const texts = optionsOf(field).map((option) => option.textContent);
  press(field, "Escape");
  await settle();
  return texts;
}

// Opens the select's list and picks the option of the text given, as the user
// would.
async function choose(field: HTMLInputElement | null, text: string): Promise<void> {
  if (field === null) throw new Error("The footer offers no such pick.");
  click(field);
  await settle();
  click(optionsOf(field).find((option) => option.textContent === text) ?? null);
  await settle();
}

// The footer's button that opens the drawer of conversations.
function opener(el: HTMLElement): HTMLButtonElement | null {
  return el.querySelector<HTMLButtonElement>('.blockr-assistant-footer-button[aria-label="Conversations"]');
}

// Opens the drawer of conversations through the footer's button, and gives
// the drawer.
function openDrawer(el: HTMLElement): HTMLElement {
  click(opener(el));
  const drawer = el.querySelector<HTMLElement>(".blockr-assistant-drawer");
  if (drawer === null) throw new Error("The chat draws no drawer.");
  return drawer;
}

// Whether the chat shows the drawer.
function drawerShown(el: HTMLElement): boolean {
  return el.querySelector(".blockr-assistant-drawer") !== null;
}

// The titles of the drawer's rows, in order.
function rows(drawer: HTMLElement): string[] {
  return [...drawer.querySelectorAll(".blockr-assistant-drawer-title")].map((title) => title.textContent);
}

// The time, as ISO 8601, that lies the days given before now.
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// Types the key into the field for the visitor's key, as the visitor would,
// and gives it with the field's button.
function giveKey(el: HTMLElement, key: string): void {
  const input = el.querySelector<HTMLInputElement>(".blockr-assistant-key input[name=key]");
  if (input === null) throw new Error("The chat draws no field for the key.");
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, key);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  click(el.querySelector(".blockr-assistant-key-field button"));
}

// OpenRouter's login as the chat finds it at the faux base URL, so that the
// chat offers it, with the visitor's key given. Its exchange of a code gets
// the answer given, which gives the key sk-or-login unless given, and the
// window that it opens is the test's own, unless the test opens it.
function fauxOpenRouterLogin(key: VisitorKey, answer: () => Promise<Response> = () => Promise.resolve(Response.json({ key: "sk-or-login" })), open?: OpenWindow) {
  const sentTo: string[] = [];
  const login = createOpenRouterLogin({
    key,
    urls: { baseUrl: "https://faux.invalid/v1", authUrl: "https://openrouter.invalid/auth", keysUrl: "https://openrouter.invalid/api/v1/auth/keys" },
    callbackUrl: "https://app.invalid/blockr.assistant/js/openrouter.html",
    secure: true,
    fetch: answer,
    open:
      open ??
      (() =>
        ({
          opener: window,
          location: {
            replace: (url: string) => {
              sentTo.push(url);
            },
          },
        }) as unknown as WindowProxy),
  });
  return { login, sentTo };
}

// Posts a code on the login's channel, with the state of the URL to which the
// login sent its window, as the page that the login calls back does.
function callBack(sentTo: string | undefined): void {
  const channel = new BroadcastChannel(CHANNEL);
  onTestFinished(() => {
    channel.close();
  });
  channel.postMessage({ code: "code-1", state: new URL(sentTo ?? "").searchParams.get("state") });
}

// A reply of pi's fake provider that records the key of the call.
function keyed(into: (string | undefined)[], text = "Hello."): FauxResponseStep {
  return (_context, options) => {
    into.push(options?.apiKey);
    return fauxAssistantMessage(text);
  };
}

const VISITOR: Credential = { kind: "visitor" };

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
    await until(() => el.querySelector(".blockr-assistant-reply") !== null && assistant.turns.current() === undefined, "the reply");

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

  test("says at the transcript's end that the model writes a summary, which a turn waits for until it stops, and then shows the summary", async () => {
    localStorage.setItem(KEY, "c1");
    const summary = heldReply("We built a sales chart.");
    const turn = heldReply("Two blocks.");
    // A summary under the default window of 128,000 tokens keeps about 32,000,
    // so it keeps u3 and a3, and covers the two exchanges before them.
    const long = "x".repeat(64_000);
    const { el, assistant } = await chat({
      state: {
        conversations: {
          c1: conversation("Sales", message("u1", "user"), message("a1", "assistant"), message("u2", "user"), message("a2", "assistant"), message("u3", "user", text(long)), message("a3", "assistant", text(long))),
        },
      },
      replies: [summary.reply, turn.reply],
    });

    let compacted: Promise<boolean> = Promise.resolve(false);
    act(() => {
      compacted = assistant.compaction.compact("c1");
    });
    await until(() => el.querySelector(".blockr-assistant-compacting") !== null, "the line that says that the model writes a summary");
    expect(el.querySelector(".blockr-assistant-compacting")?.textContent).toBe("Writing a summary of the earlier messages");

    type(el, "How many blocks?");
    press(field(el), "Enter");
    await until(() => assistant.turns.current() !== undefined, "the turn");
    expect(el.querySelector(".blockr-assistant-working")).toBeNull();
    press(field(el), "Escape");
    await until(() => assistant.turns.current() === undefined, "the turn's stop");
    expect(el.querySelector(".blockr-assistant-compacting")).not.toBeNull();

    summary.release();
    await act(() => compacted);
    await settle();

    expect(el.querySelector(".blockr-assistant-compacting")).toBeNull();
    expect(el.querySelector(".blockr-assistant-summary summary")?.textContent).toBe("Summary of the earlier messages");
    expect([...el.querySelectorAll(".blockr-assistant-user-text")].map((node) => node.textContent).at(-1)).toBe("How many blocks?");
    expect(el.querySelectorAll(".blockr-assistant-user-text")).toHaveLength(2);
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

describe("the chat's field for the visitor's key", () => {
  test("asks for the key above the message field where the app sets none, as a login to the host for the browser's password manager, and sends nothing until the visitor gives one", async () => {
    const keys: (string | undefined)[] = [];
    const { el, assistant, core, sent } = await chat({ credential: VISITOR, replies: [keyed(keys)] });

    const note = el.querySelector(".blockr-assistant-key-note");
    expect(note?.textContent).toBe("Enter your API key for faux.invalid. The assistant keeps it only until the page reloads.");
    expect(el.querySelector(".blockr-assistant-key + .blockr-assistant-composer")).not.toBeNull();
    const key = el.querySelector<HTMLInputElement>(".blockr-assistant-key input[name=key]");
    expect(key?.type).toBe("password");
    expect(key?.autocomplete).toBe("current-password");
    const login = el.querySelector<HTMLInputElement>(".blockr-assistant-key input[autocomplete=username]");
    expect(login?.value).toBe("faux.invalid");
    expect(login?.hidden).toBe(true);
    expect(el.querySelector(".blockr-assistant-openrouter")).toBeNull();
    expect([...el.querySelectorAll<HTMLButtonElement>(".blockr-assistant-suggestion")].every((button) => button.disabled)).toBe(true);
    expect(el.querySelector(".blockr-assistant-send")?.getAttribute("aria-label")).toBe("Sends once you enter your key");

    type(el, "How many blocks?");
    press(field(el), "Enter");
    await settle();
    expect(inState(assistant)).toEqual({});
    expect(field(el).value).toBe("How many blocks?");

    giveKey(el, "  sk-visitor  ");
    await settle();
    expect(assistant.key.current()).toEqual({ kind: "given", key: "sk-visitor" });
    expect(el.querySelector(".blockr-assistant-key")).toBeNull();

    press(field(el), "Enter");
    await until(() => el.querySelector(".blockr-assistant-reply") !== null && assistant.turns.current() === undefined, "the reply");
    expect(keys).toEqual(["sk-visitor"]);
    const stored = [storedIn(localStorage), storedIn(sessionStorage), JSON.stringify([core.store.board(), sent])];
    expect(stored.join("\n")).not.toContain("sk-visitor");
  });

  test("asks again, with an empty field, once the base URL refuses the key", async () => {
    const key = createVisitorKey();
    key.give("sk-wrong");
    const { el } = await chat({ credential: VISITOR, key });
    expect(el.querySelector(".blockr-assistant-key")).toBeNull();

    act(() => {
      key.refused("sk-wrong");
    });

    const note = el.querySelector(".blockr-assistant-key-note");
    expect(note?.textContent).toBe("The server at faux.invalid refused your key. Enter another one.");
    expect(note?.getAttribute("role")).toBe("alert");
    expect(el.querySelector<HTMLInputElement>(".blockr-assistant-key input[name=key]")?.value).toBe("");
    expect(el.querySelector<HTMLButtonElement>(".blockr-assistant-send")?.disabled).toBe(true);
  });

  test("shows the field again, holding the key, after a lost connection, while the message field sends with the key", async () => {
    const keys: (string | undefined)[] = [];
    const key = createVisitorKey();
    key.give("sk-visitor");
    key.lost("sk-visitor");
    const { el, assistant } = await chat({ credential: VISITOR, key, replies: [keyed(keys)] });

    expect(el.querySelector(".blockr-assistant-key-note")?.textContent).toBe(
      "The connection to faux.invalid was lost, and your key may be wrong. Change it, or send your message again.",
    );
    expect(el.querySelector<HTMLInputElement>(".blockr-assistant-key input[name=key]")?.value).toBe("sk-visitor");

    type(el, "How many blocks?");
    press(field(el), "Enter");
    await until(() => el.querySelector(".blockr-assistant-reply") !== null && assistant.turns.current() === undefined, "the reply");

    expect(keys).toEqual(["sk-visitor"]);
    expect(el.querySelector(".blockr-assistant-key")).toBeNull();
  });

  test("offers OpenRouter's login above the key where the base URL is the login's, which gives the key that the calls then carry", async () => {
    const keys: (string | undefined)[] = [];
    const key = createVisitorKey();
    const { login: openRouterLogin, sentTo } = fauxOpenRouterLogin(key);
    const { el, assistant } = await chat({ credential: VISITOR, key, openRouterLogin, replies: [keyed(keys)] });

    expect(el.querySelector(".blockr-assistant-key-note")?.textContent).toBe(
      "Log in with OpenRouter, or enter your API key for faux.invalid. The assistant keeps the key only until the page reloads.",
    );
    expect(el.querySelector(".blockr-assistant-key-note + .blockr-assistant-openrouter + .blockr-assistant-key-field")).not.toBeNull();
    const button = el.querySelector<HTMLButtonElement>(".blockr-assistant-openrouter");
    expect(button?.type).toBe("button");
    expect(button?.textContent).toBe("Log in with OpenRouter");
    expect(el.querySelector<HTMLButtonElement>(".blockr-assistant-send")?.disabled).toBe(true);

    click(button);
    await until(() => sentTo.length > 0, "the login's window");
    callBack(sentTo[0]);
    await until(() => el.querySelector(".blockr-assistant-key") === null, "the key");
    expect(assistant.key.current()).toEqual({ kind: "given", key: "sk-or-login" });

    type(el, "How many blocks?");
    press(field(el), "Enter");
    await until(() => el.querySelector(".blockr-assistant-reply") !== null && assistant.turns.current() === undefined, "the reply");
    expect(keys).toEqual(["sk-or-login"]);
  });

  test("says that it logs in while the login exchanges the code, and why the login failed, until the visitor logs in again", async () => {
    let answer: (response: Response) => void = () => undefined;
    const key = createVisitorKey();
    const { login: openRouterLogin, sentTo } = fauxOpenRouterLogin(
      key,
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    );
    const { el } = await chat({ credential: VISITOR, key, openRouterLogin });

    click(el.querySelector(".blockr-assistant-openrouter"));
    await until(() => sentTo.length > 0, "the login's window");
    callBack(sentTo[0]);
    await until(() => el.querySelector<HTMLButtonElement>(".blockr-assistant-openrouter")?.disabled === true, "the exchange");
    expect(el.querySelector(".blockr-assistant-openrouter")?.textContent).toBe("Logging in…");

    answer(Response.json({ error: { message: "Invalid code or code_verifier", code: 403 } }, { status: 403 }));
    await until(() => el.querySelector(".blockr-assistant-key")?.getAttribute("data-openrouter") === "failed", "the failure");
    const note = el.querySelector(".blockr-assistant-key-note");
    expect(note?.textContent).toBe("OpenRouter refused the login: Invalid code or code_verifier. Log in again, or enter your API key.");
    expect(note?.getAttribute("role")).toBe("alert");
    expect(el.querySelector<HTMLButtonElement>(".blockr-assistant-openrouter")?.disabled).toBe(false);
    expect(key.current()).toEqual({ kind: "missing" });

    click(el.querySelector(".blockr-assistant-openrouter"));
    expect(el.querySelector(".blockr-assistant-key")?.getAttribute("data-openrouter")).toBe("idle");
    expect(el.querySelector(".blockr-assistant-key-note")?.getAttribute("role")).toBeNull();
  });

  test("says that the browser blocked the login's window", async () => {
    const key = createVisitorKey();
    const { login: openRouterLogin } = fauxOpenRouterLogin(key, undefined, () => null);
    const { el } = await chat({ credential: VISITOR, key, openRouterLogin });

    click(el.querySelector(".blockr-assistant-openrouter"));

    const note = el.querySelector(".blockr-assistant-key-note");
    expect(note?.textContent).toBe("The browser blocked the login's window. Allow pop-ups for this page, or enter your API key.");
    expect(note?.getAttribute("role")).toBe("alert");
  });

  test("names the login where the base URL refused the key", async () => {
    const key = createVisitorKey();
    key.give("sk-wrong");
    key.refused("sk-wrong");
    const { login: openRouterLogin } = fauxOpenRouterLogin(key);
    const { el } = await chat({ credential: VISITOR, key, openRouterLogin });

    expect(el.querySelector(".blockr-assistant-key-note")?.textContent).toBe("The server at faux.invalid refused your key. Log in with OpenRouter, or enter another key.");
  });

  test("shows no field where the app sets a key, or none", async () => {
    const deployments = await chat();
    const none = await chat({ credential: { kind: "none" } });

    expect(deployments.el.querySelector(".blockr-assistant-key")).toBeNull();
    expect(none.el.querySelector(".blockr-assistant-key")).toBeNull();
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

  test("show what the edit tool did, from its own result, as a turn runs it", async () => {
    const commands = [{ command: "blockr.core-add_block", args: { registry_id: "blockr.core-dataset_block", id: "d", name: "Cars" } }];
    const { el, assistant } = await chat({ replies: [fauxAssistantMessage([fauxToolCall("edit", { commands }, { id: "e-1" })], { stopReason: "toolUse" }), fauxAssistantMessage("Added.")] });

    type(el, "Add a dataset.");
    press(field(el), "Enter");
    await until(() => assistant.turns.current() === undefined && el.querySelector(".blockr-assistant-tool") !== null, "the edit");

    const row = el.querySelector(".blockr-assistant-tool");
    expect(row?.querySelector(".blockr-assistant-tool-title")?.textContent).toBe("Edit");
    expect(row?.querySelector(".blockr-assistant-edit-commands")?.textContent).toBe("Add block");
    const block = row?.querySelector(".blockr-assistant-block");
    expect(block?.textContent).toBe("Cars");
    expect(block?.querySelector(".blockr-assistant-dot")).not.toBeNull();
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
    const replies = [heldReply("One two three four five six seven eight nine ten."), heldReply("Again, slowly, word by word.")];
    const { el, assistant } = await chat({ replies: replies.map((held) => held.reply) });

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
    const { el, assistant } = await chat({ state, replies: [heldReply("A long reply that the turn holds until it stops.").reply] });

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

    // Escape in the chat stops the turn, whichever conversation shows.
    press(field(el), "Escape");
    await until(() => ended, "the turn to end");
  });

  test("goes on once the panel closes, and shows the reply as the chat mounts again", async () => {
    const held = heldReply("The reply that streams while no panel shows.");
    const { el, assistant, core, remove } = await chat({ tokensPerSecond: 50, replies: [held.reply] });

    type(el, "Count.");
    press(field(el), "Enter");
    await until(() => assistant.turns.current() !== undefined, "the turn");
    remove();
    held.release();
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

describe("the chat's footer", () => {
  test("shows the tokens that the open conversation spent, input and output, and none on the greeting", async () => {
    localStorage.setItem(KEY, "c1");
    const spent = { ...conversation("Sales", message("u1", "user")), usage: { input: 12_345, output: 678, last: 20_000 } };
    const { el } = await chat({ state: { conversations: { c1: spent } } });

    const meter = el.querySelector(".blockr-assistant-meter");
    expect([...(meter?.children ?? [])].map((item) => item.getAttribute("title"))).toEqual([
      `Input tokens (this conversation): ${(12_345).toLocaleString()}`,
      "Output tokens (this conversation): 678",
    ]);

    click(openDrawer(el).querySelector(".blockr-assistant-drawer-new"));
    expect(el.querySelector(".blockr-assistant-greeting")).not.toBeNull();
    expect([...(el.querySelector(".blockr-assistant-meter")?.children ?? [])].map((item) => item.textContent)).toEqual(["Input tokens: 0", "Output tokens: 0"]);
  });

  test("offers no pick of the model where the deployment names one model", async () => {
    localStorage.setItem(KEY, "c1");
    const { el } = await chat({ state: { conversations: { c1: conversation("Sales", message("u1", "user")) } } });

    expect(el.querySelector(".blockr-assistant-model")).toBeNull();
  });

  test("offers the models that the deployment names, and a pick sets the open conversation's, with no undo step", async () => {
    localStorage.setItem(KEY, "c1");
    const { el, assistant, core } = await chat({ state: { conversations: { c1: conversation("Sales", message("u1", "user")) } }, models: ["faux-1", "faux-2"] });

    expect(await offeredBy(pickField(el, "Model"))).toEqual(["faux-1", "faux-2"]);
    expect(pickField(el, "Model")?.value).toBe("faux-1");

    await choose(pickField(el, "Model"), "faux-2");

    expect(inState(assistant).c1?.model).toBe("faux-2");
    expect(core.store.canUndo()).toBe(false);
    expect(pickField(el, "Model")?.value).toBe("faux-2");
  });

  test("gives a pick made while no conversation is open to the conversation that the first message adds", async () => {
    const { el, assistant } = await chat({ models: ["faux-1", "faux-2"] });

    await choose(pickField(el, "Model"), "faux-2");
    type(el, "How many blocks?");
    press(field(el), "Enter");
    await until(() => Object.keys(inState(assistant)).length === 1, "the conversation");

    expect(Object.values(inState(assistant))[0]?.model).toBe("faux-2");
  });

  test("names a pick that the deployment does not offer beside the model that the calls go to, even where it offers one model", async () => {
    localStorage.setItem(KEY, "c1");
    const { el } = await chat({ state: { conversations: { c1: { ...conversation("Sales", message("u1", "user")), model: "gpt-4o" } } } });

    expect(el.querySelector(".blockr-assistant-model-unoffered s")?.textContent).toBe("gpt-4o");
    expect(el.querySelector(".blockr-assistant-model-unoffered")?.getAttribute("title")).toBe("The app does not offer gpt-4o, so the calls go to faux-1.");
    expect(el.querySelector(".blockr-assistant-model-name")?.textContent).toBe("faux-1");
    expect(pickField(el, "Model")).toBeNull();
  });

  // The test runs a turn and opens a list, which takes a busy machine more
  // than the five seconds that a test gets by default.
  test("closes a pick's list on Escape, and leaves the turn that runs to go on, which Escape in the message field stops", { timeout: 15_000 }, async () => {
    const { el, assistant } = await chat({ models: ["faux-1", "faux-2"], replies: [heldReply("Two blocks.").reply] });
    type(el, "How many blocks?");
    press(field(el), "Enter");
    await until(() => assistant.turns.current() !== undefined, "the turn");

    const pick = pickField(el, "Model");
    if (pick === null) throw new Error("The footer offers no pick of the model.");
    click(pick);
    await settle();
    expect(optionsOf(pick)).toHaveLength(2);
    press(pick, "Escape");
    await settle();

    expect(optionsOf(pick)).toHaveLength(0);
    expect(assistant.turns.current()).toBeDefined();
    press(field(el), "Escape");
    await until(() => assistant.turns.current() === undefined, "the turn to end");
  });

  test("offers the thinking levels that the model of the next turn takes, and a pick sets the open conversation's, with no undo step", async () => {
    localStorage.setItem(KEY, "c1");
    const { el, assistant, core } = await chat({ state: { conversations: { c1: conversation("Sales", message("u1", "user")) } }, models: ["gpt-5.4"] });

    expect(await offeredBy(pickField(el, "Thinking level"))).toEqual(["off", "low", "medium", "high", "xhigh"]);
    expect(pickField(el, "Thinking level")?.value).toBe("medium");

    await choose(pickField(el, "Thinking level"), "high");

    expect(inState(assistant).c1?.thinking_level).toBe("high");
    expect(core.store.canUndo()).toBe(false);
    expect(pickField(el, "Thinking level")?.value).toBe("high");
  });

  test("offers no pick of the level for a model that takes one level or none", async () => {
    localStorage.setItem(KEY, "c1");
    const { el } = await chat({ state: { conversations: { c1: conversation("Sales", message("u1", "user")) } }, models: ["faux-1", "gpt-5-pro"] });

    expect(pickField(el, "Model")).not.toBeNull();
    expect(pickField(el, "Thinking level")).toBeNull();
    await choose(pickField(el, "Model"), "gpt-5-pro");
    expect(pickField(el, "Thinking level")).toBeNull();
  });

  test("lists the levels of the model that the conversation picks, and shows the level that the calls take for a pick that the model does not take", async () => {
    localStorage.setItem(KEY, "c1");
    const picked = { ...conversation("Sales", message("u1", "user")), model: "claude-opus-5-5", thinking_level: "off" as const };
    const { el, assistant } = await chat({ state: { conversations: { c1: picked } }, models: ["gpt-5.4", "claude-opus-5-5"] });

    expect(await offeredBy(pickField(el, "Thinking level"))).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(pickField(el, "Thinking level")?.value).toBe("low");
    expect(inState(assistant).c1?.thinking_level).toBe("off");

    await choose(pickField(el, "Model"), "gpt-5.4");
    expect(pickField(el, "Thinking level")?.value).toBe("off");
  });

  test("gives a pick of the level made while no conversation is open to the conversation that the first message adds", async () => {
    const { el, assistant } = await chat({ models: ["gpt-5.4"] });

    await choose(pickField(el, "Thinking level"), "low");
    type(el, "How many blocks?");
    press(field(el), "Enter");
    await until(() => Object.keys(inState(assistant)).length === 1, "the conversation");

    expect(Object.values(inState(assistant))[0]).toMatchObject({ model: null, thinking_level: "low" });
  });
});

describe("the chat's drawer of conversations", () => {
  test("lists the conversations, the last updated first, grouped by when each was updated, and searches their titles", async () => {
    const at = (title: string, updated: string): Conversation => ({ ...conversation(title, message(`u-${title}`, "user")), updated });
    const state: AssistantState = {
      conversations: { c1: at("Old sales", daysAgo(30)), c2: at("Costs", daysAgo(3)), c3: at("Sales today", daysAgo(0)), c4: at("Regions", daysAgo(2)) },
    };
    const { el } = await chat({ state });

    const drawer = openDrawer(el);
    expect(document.activeElement?.className).toBe("blockr-assistant-drawer-search");
    expect([...drawer.querySelectorAll(".blockr-assistant-drawer-group h3")].map((heading) => heading.textContent)).toEqual(["Today", "Last 7 days", "Previous"]);
    expect(rows(drawer)).toEqual(["Sales today", "Regions", "Costs", "Old sales"]);

    const search = drawer.querySelector<HTMLInputElement>(".blockr-assistant-drawer-search");
    act(() => {
      if (search === null) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "SALES");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(rows(drawer)).toEqual(["Sales today", "Old sales"]);
  });

  test("shows over the chat, whose rest is inert meanwhile, and closes on Escape or a click beside it, giving the focus back to the footer's button", async () => {
    const { el } = await chat({ state: { conversations: { c1: conversation("Sales", message("u1", "user")) } } });
    const main = el.querySelector<HTMLElement>(".blockr-assistant-chat-main");

    const drawer = openDrawer(el);
    expect(drawer.parentElement?.className).toBe("blockr-assistant-chat");
    expect(drawer.querySelector('[role="dialog"]')?.getAttribute("aria-labelledby")).toBe(drawer.querySelector("h2")?.id);
    expect(main?.hasAttribute("inert")).toBe(true);
    press(drawer.querySelector(".blockr-assistant-drawer-search") ?? drawer, "Escape");
    await settle();
    expect(drawerShown(el)).toBe(false);
    expect(main?.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(opener(el));

    click(openDrawer(el).querySelector(".blockr-assistant-drawer-scrim"));
    await settle();
    expect(drawerShown(el)).toBe(false);
    expect(document.activeElement).toBe(opener(el));
  });

  test("opens the conversation that the user clicks, and closes", async () => {
    const state: AssistantState = { conversations: { c1: conversation("Sales", message("u1", "user", text("How are the sales?"))), c2: conversation("Costs", message("u2", "user", text("And the costs?"))) } };
    const { el } = await chat({ state });

    const drawer = openDrawer(el);
    click([...drawer.querySelectorAll(".blockr-assistant-drawer-select")].find((row) => row.textContent.includes("Costs")) ?? null);
    await settle();

    expect(drawerShown(el)).toBe(false);
    expect(localStorage.getItem(KEY)).toBe("c2");
    expect(el.querySelector(".blockr-assistant-user-text")?.textContent).toBe("And the costs?");
  });

  test("starts a conversation from the greeting, with the picks of the one that was open, once the first message is sent", async () => {
    localStorage.setItem(KEY, "c1");
    const state: AssistantState = { conversations: { c1: { ...conversation("Sales", message("u1", "user")), model: "faux-2", thinking_level: "high" } } };
    const { el, assistant } = await chat({ state, models: ["faux-1", "faux-2"] });

    const drawer = openDrawer(el);
    click(drawer.querySelector(".blockr-assistant-drawer-new"));
    await settle();

    expect(drawerShown(el)).toBe(false);
    expect(el.querySelector(".blockr-assistant-greeting")).not.toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(Object.keys(inState(assistant))).toEqual(["c1"]);
    expect(pickField(el, "Model")?.value).toBe("faux-2");

    type(el, "How many blocks?");
    press(field(el), "Enter");
    await until(() => Object.keys(inState(assistant)).length === 2, "the new conversation");
    const added = Object.entries(inState(assistant)).find(([id]) => id !== "c1")?.[1];
    expect(added).toMatchObject({ title: "New conversation", model: "faux-2", thinking_level: "high" });
  });

  test("renames a conversation in its row on Enter, and keeps its title on Escape, with the drawer still open", async () => {
    const { el, assistant, core } = await chat({ state: { conversations: { c1: conversation("Sales", message("u1", "user")) } } });
    const drawer = openDrawer(el);

    click(drawer.querySelector('[aria-label="Rename “Sales”"]'));
    const field = drawer.querySelector<HTMLInputElement>(".blockr-assistant-drawer-rename");
    expect(field?.value).toBe("Sales");
    act(() => {
      if (field === null) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, "  Sales   by region ");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    press(field ?? drawer, "Enter");
    await settle();

    expect(inState(assistant).c1?.title).toBe("Sales by region");
    expect(core.store.canUndo()).toBe(false);
    expect(rows(drawer)).toEqual(["Sales by region"]);

    click(drawer.querySelector('[aria-label="Rename “Sales by region”"]'));
    press(drawer.querySelector(".blockr-assistant-drawer-rename") ?? drawer, "Escape");
    await settle();
    expect(rows(drawer)).toEqual(["Sales by region"]);
    expect(drawerShown(el)).toBe(true);
  });

  test("deletes a conversation once the user confirms in its row, and the open one opens the greeting", async () => {
    localStorage.setItem(KEY, "c1");
    const { el, assistant } = await chat({ state: { conversations: { c1: conversation("Sales", message("u1", "user")), c2: conversation("Costs", message("u2", "user")) } } });
    const drawer = openDrawer(el);

    click(drawer.querySelector('[aria-label="Delete “Sales”"]'));
    expect(drawer.querySelector(".blockr-assistant-drawer-confirm")?.textContent).toBe("Delete?");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Keep “Sales”");
    click(drawer.querySelector('[aria-label="Keep “Sales”"]'));
    expect(Object.keys(inState(assistant))).toEqual(["c1", "c2"]);

    click(drawer.querySelector('[aria-label="Delete “Sales”"]'));
    click(drawer.querySelector(".blockr-assistant-drawer-confirm-yes"));
    await until(() => !Object.hasOwn(inState(assistant), "c1"), "the deletion");

    expect(rows(drawer)).toEqual(["Costs"]);
    expect(el.querySelector(".blockr-assistant-greeting")).not.toBeNull();
  });

  test("marks the conversation whose turn runs, and stops the turn before it deletes the conversation", async () => {
    localStorage.setItem(KEY, "c1");
    const state: AssistantState = { conversations: { c1: conversation("Sales", message("u1", "user")), c2: conversation("Costs", message("u2", "user")) } };
    const { el, assistant, logged } = await chat({ state, replies: [heldReply("A reply that the turn holds until it stops.").reply] });
    act(() => {
      void assistant.turns.run("c2");
    });
    await until(() => assistant.turns.current()?.conversation === "c2", "the turn in c2");

    const drawer = openDrawer(el);
    const marked = [...drawer.querySelectorAll(".blockr-assistant-drawer-row")].filter((row) => row.querySelector(".blockr-assistant-drawer-running") !== null);
    expect(marked.map((row) => row.querySelector(".blockr-assistant-drawer-title")?.textContent)).toEqual(["Costs"]);

    click(drawer.querySelector('[aria-label="Delete “Costs”"]'));
    click(drawer.querySelector(".blockr-assistant-drawer-confirm-yes"));
    await until(() => !Object.hasOwn(inState(assistant), "c2"), "the deletion");

    expect(assistant.turns.current()).toBeUndefined();
    expect(logged.filter((line) => line.message.includes("took no more messages"))).toEqual([]);
    expect(rows(drawer)).toEqual(["Sales"]);
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

// Each test may take as long as until() waits, since several run two turns or
// two chats, which a busy machine may take longer than the default of 5
// seconds for.
describe("the chat's slash commands", { timeout: 20_000 }, () => {
  // A skill as R lists it, with every vector as an array, which the model may
  // read.
  const listedSkill = (name: string, userInvocable: boolean): Json => ({
    name: [name],
    description: [`What ${name} covers.`],
    blocks: [],
    plugins: [],
    "user-invocable": [userInvocable],
    "disable-model-invocation": [false],
  });

  // R's answers to the assistant's requests list_skills and read_skill: R
  // lists a skill filters, which the user may call, and a skill layout, which
  // the user may not, and reads a skill as `read` gives it.
  function skillAnswers(read: (name: string) => string = () => "How to filter."): Answer {
    return (request) => {
      if (request.kind !== "request" || request.type !== "plugin" || request.plugin !== ASSISTANT) return undefined;
      if (request.name === "list_skills") return [listedSkill("filters", true), listedSkill("layout", false)];
      if (request.name === "read_skill") return [read(typeof request.args.name === "string" ? request.args.name : "")];
      return undefined;
    };
  }

  // The chat, once the skills that R lists have reached it.
  async function withSkills(options: Options = {}) {
    const opened = await chat({ answer: skillAnswers(), ...options });
    await act(() => opened.assistant.skills.list());
    await settle();
    return opened;
  }

  // The names of the commands that the list shows, as it writes them, or
  // undefined where the list is closed.
  function listed(el: HTMLElement): string[] | undefined {
    const list = el.querySelector(".blockr-assistant-commands");
    return list === null ? undefined : [...list.querySelectorAll(".blockr-assistant-command-name")].map((name) => name.textContent);
  }

  // The command that the list highlights.
  function highlighted(el: HTMLElement): string | undefined {
    return el.querySelector('.blockr-assistant-command[aria-selected="true"] .blockr-assistant-command-name')?.textContent;
  }

  // What the chat says under the field of the slash command that ran last.
  function commandNote(el: HTMLElement): string | undefined {
    return el.querySelector(".blockr-assistant-command-note")?.textContent;
  }

  // The args of each request of the assistant's of the name given that core
  // sent R.
  function asked(sent: readonly Parameters<Answer>[0][], name: string): Json[] {
    return sent.flatMap((request) => (request.kind === "request" && request.type === "plugin" && request.name === name ? [request.args] : []));
  }

  // The lines of the note of what others changed that the conversation takes
  // now, which name who changed what.
  async function noteLines(assistant: Assistant, conversation: string): Promise<string[]> {
    const note = await act(() => assistant.notes.take(conversation));
    const written = note?.parts.map((part) => (part.type === "changes" ? part.text : "")).join("") ?? "";
    return written.split("\n").filter((line) => line.startsWith("- "));
  }

  test("are listed as the user types / at the start of the field: the built-in commands, then the skills that the user may call", async () => {
    const { el } = await withSkills();

    type(el, "/");
    expect(listed(el)).toEqual(["/compact", "/clear", "/undo", "/redo", "/filters"]);
    expect(el.querySelector(".blockr-assistant-command-description")?.textContent).toBe("Summarize the conversation so far, keeping the newest messages as they are.");
    expect(field(el).getAttribute("aria-controls")).toBe(el.querySelector(".blockr-assistant-commands")?.id);
    expect(field(el).getAttribute("aria-autocomplete")).toBe("list");

    type(el, "/C");
    expect(listed(el)).toEqual(["/compact", "/clear"]);

    type(el, "/x");
    expect(listed(el)).toEqual([]);
    expect(el.querySelector(".blockr-assistant-commands-none")?.textContent).toBe("No matching commands");

    for (const text of ["/clear ", "/filters keep the adults", "Undo /undo", ""]) {
      type(el, text);
      expect(listed(el)).toBeUndefined();
    }
  });

  test("move in the list with Up and Down, and go into the field with Tab, Enter or a click, while Escape closes the list until the text changes", async () => {
    const { el } = await withSkills();

    type(el, "/c");
    expect(highlighted(el)).toBe("/compact");
    await key(el, "ArrowDown");
    expect(highlighted(el)).toBe("/clear");
    expect(field(el).getAttribute("aria-activedescendant")).toBe(el.querySelector('.blockr-assistant-command[aria-selected="true"]')?.id);
    await key(el, "ArrowDown");
    expect(highlighted(el)).toBe("/compact");
    await key(el, "ArrowUp");
    expect(highlighted(el)).toBe("/clear");
    await key(el, "Tab");
    expect(field(el).value).toBe("/clear ");
    expect(listed(el)).toBeUndefined();

    type(el, "/un");
    await key(el, "Enter");
    expect(field(el).value).toBe("/undo ");

    type(el, "/f");
    click(el.querySelector(".blockr-assistant-command"));
    expect(field(el).value).toBe("/filters ");

    type(el, "/r");
    await key(el, "Escape");
    expect(listed(el)).toBeUndefined();
    type(el, "/re");
    expect(listed(el)).toEqual(["/redo"]);
  });

  test("run /compact on Enter where the field holds its name, which has the compaction write a summary that alone enters the transcript", async () => {
    localStorage.setItem(KEY, "c1");
    const summary = heldReply("We built a sales chart.");
    // A summary under the default window of 128,000 tokens keeps about 32,000,
    // so it keeps u3 and a3, and covers the two exchanges before them.
    const long = "x".repeat(64_000);
    const { el, assistant } = await withSkills({
      state: {
        conversations: {
          c1: conversation("Sales", message("u1", "user"), message("a1", "assistant"), message("u2", "user"), message("a2", "assistant"), message("u3", "user", text(long)), message("a3", "assistant", text(long))),
        },
      },
      replies: [summary.reply],
    });

    type(el, "/compact");
    await key(el, "Enter");
    expect(field(el).value).toBe("");
    await until(() => el.querySelector(".blockr-assistant-compacting") !== null, "the line that says that the model writes a summary");

    summary.release();
    await until(() => !assistant.compaction.writing("c1"), "the summary");

    expect(inState(assistant).c1?.messages.map((m) => m.role)).toEqual(["summary", "user", "assistant"]);
    expect(el.querySelector(".blockr-assistant-summary summary")?.textContent).toBe("Summary of the earlier messages");
    expect(el.querySelectorAll(".blockr-assistant-user-text")).toHaveLength(1);
    expect(el.textContent).not.toContain("/compact");
    expect(assistant.turns.current()).toBeUndefined();
  });

  test("open the greeting on /clear, even while a turn runs, and start the next conversation on the picks of the one that was open", async () => {
    localStorage.setItem(KEY, "c1");
    const held = heldReply("Two blocks.");
    const state: AssistantState = { conversations: { c1: { ...conversation("Sales", message("u1", "user")), model: "faux-2", thinking_level: "high" } } };
    const { el, assistant } = await withSkills({ state, models: ["faux-1", "faux-2"], replies: [held.reply, fauxAssistantMessage("Hello.")] });
    let ended = false;
    act(() => {
      void assistant.turns.run("c1").then(() => {
        ended = true;
      });
    });
    await until(() => assistant.turns.current()?.conversation === "c1", "the turn in c1");

    type(el, "/clear");
    await key(el, "Enter");

    expect(el.querySelector(".blockr-assistant-greeting")).not.toBeNull();
    expect(field(el).value).toBe("");
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(assistant.turns.current()?.conversation).toBe("c1");
    expect(el.querySelector(".blockr-assistant-composer-note")?.textContent).toBe("A turn runs in “Sales”.");
    expect(pickField(el, "Model")?.value).toBe("faux-2");

    held.release();
    await until(() => ended, "the turn to end");
    type(el, "How many blocks?");
    press(field(el), "Enter");
    await until(() => Object.keys(inState(assistant)).length === 2, "the new conversation");
    expect(Object.entries(inState(assistant)).find(([id]) => id !== "c1")?.[1]).toMatchObject({ title: "New conversation", model: "faux-2", thinking_level: "high" });
  });

  test("hold back every command but /clear while a turn runs, as a message, and keep its line in the field", async () => {
    localStorage.setItem(KEY, "c1");
    const held = heldReply("Two blocks.");
    const state: AssistantState = { conversations: { c1: conversation("Sales", message("u1", "user")), c2: conversation("Costs", message("u2", "user")) } };
    const { el, assistant, core, sent } = await withSkills({ state, blocks: true, replies: [held.reply] });
    await act(() => core.commands.run("blockr.core-rename_block", { id: "a", name: "Data" }, "assistant"));
    let ended = false;
    act(() => {
      void assistant.turns.run("c2").then(() => {
        ended = true;
      });
    });
    await until(() => assistant.turns.current()?.conversation === "c2", "the turn in c2");

    for (const line of ["/undo", "/redo", "/compact", "/filters keep the adults"]) {
      type(el, line);
      const send = el.querySelector(".blockr-assistant-send");
      expect(send?.getAttribute("aria-label")).toBe("Sends once the turn in “Costs” ends");
      expect(send?.hasAttribute("disabled")).toBe(true);
      await key(el, "Enter");
      expect(field(el).value).toBe(line);
    }
    expect(core.store.board().blocks.a?.name).toBe("Data");
    expect(asked(sent, "read_skill")).toEqual([]);
    expect(assistant.conversations.get("c1")?.messages).toHaveLength(1);
    expect(commandNote(el)).toBeUndefined();

    held.release();
    await until(() => ended, "the turn to end");
  });

  test("close the list on Escape without stopping the turn, which the next Escape stops", async () => {
    const held = heldReply("Two blocks.");
    const { el, assistant } = await withSkills({ replies: [held.reply] });
    type(el, "How many blocks?");
    press(field(el), "Enter");
    await until(() => el.querySelector(".blockr-assistant-stop") !== null, "the stop button");

    type(el, "/u");
    await key(el, "Escape");
    expect(listed(el)).toBeUndefined();
    expect(assistant.turns.current()?.stopping).toBe(false);

    await key(el, "Escape");
    await until(() => assistant.turns.current() === undefined, "the turn to end");
  });

  test("take back the assistant's last edit on /undo, which the note of what others changed counts as the user's, and apply it again on /redo", async () => {
    const { el, assistant, core } = await withSkills({ blocks: true });
    const name = (): string | undefined => core.store.board().blocks.a?.name;
    const before = name();
    await noteLines(assistant, "c1");
    await act(() => core.commands.run("blockr.core-rename_block", { id: "a", name: "Data" }, "assistant"));
    expect(await noteLines(assistant, "c1")).toEqual(["- Block a: name changed by the assistant in another conversation."]);

    type(el, "/undo");
    await key(el, "Enter");

    expect(name()).toBe(before);
    expect(field(el).value).toBe("");
    expect(commandNote(el)).toBeUndefined();
    expect(await noteLines(assistant, "c1")).toEqual(["- Block a: name changed by the user."]);

    type(el, "/redo");
    await key(el, "Enter");

    expect(name()).toBe("Data");
    expect(field(el).value).toBe("");
    expect(inState(assistant)).toEqual({});
    expect(el.querySelector(".blockr-assistant-greeting")).not.toBeNull();
  });

  test("take back the assistant's last edit on /undo past the user's edits after it", async () => {
    const { el, core } = await withSkills({ blocks: true });
    const names = () => [core.store.board().blocks.a?.name, core.store.board().blocks.b?.name];
    const before = names();
    await act(() => core.commands.run("blockr.core-rename_block", { id: "a", name: "Data" }, "assistant"));
    await act(() => core.commands.run("blockr.core-rename_block", { id: "b", name: "Top" }, "user"));

    type(el, "/undo");
    await key(el, "Enter");

    expect(names()).toEqual([before[0], "Top"]);
  });

  test("apply again on /redo what the frontend's Undo took back, whoever made the edit", async () => {
    const { el, core } = await withSkills({ blocks: true });
    await act(() => core.commands.run("blockr.core-rename_block", { id: "b", name: "Top" }, "user"));
    act(() => {
      core.store.undo();
    });
    expect(core.store.board().blocks.b?.name).not.toBe("Top");

    type(el, "/redo");
    await key(el, "Enter");

    expect(core.store.board().blocks.b?.name).toBe("Top");
  });

  test("say under the field where /undo or /redo finds no step, or the store refuses the step, until the user runs a command or sends a message", async () => {
    const { el, core } = await withSkills({ blocks: true });
    await act(() => core.commands.run("blockr.core-rename_block", { id: "b", name: "Top" }, "user"));

    type(el, "/undo");
    await key(el, "Enter");
    expect(commandNote(el)).toBe("The assistant has no edit left to take back.");
    expect(field(el).value).toBe("");
    expect(core.store.board().blocks.b?.name).toBe("Top");

    type(el, "/redo");
    await key(el, "Enter");
    expect(commandNote(el)).toBe("No undo has taken back an edit to apply again.");

    vi.spyOn(core.store, "canUndo").mockReturnValue(true);
    vi.spyOn(core.store, "undo").mockImplementation(() => {
      throw Object.assign(new Error("The store refused to undo the step\n- The board is locked."), { name: "StoreError", failures: ["The board is locked."] });
    });
    type(el, "/undo");
    await key(el, "Enter");
    expect(commandNote(el)).toBe("The board refused to take back the assistant's last edit: The board is locked.");

    type(el, "/clear");
    await key(el, "Enter");
    expect(commandNote(el)).toBeUndefined();

    type(el, "/redo");
    await key(el, "Enter");
    expect(commandNote(el)).toBe("No undo has taken back an edit to apply again.");
    type(el, "How many blocks?");
    press(field(el), "Enter");
    await settle();
    expect(commandNote(el)).toBeUndefined();
  });

  test("send a skill that the user calls with /name, with the line that the transcript shows, and give the model the skill's text as today's prompt words it", async () => {
    const seen: string[][] = [];
    const { el, assistant, sent } = await withSkills({
      replies: [
        (context) => {
          const user = context.messages.find((m) => m.role === "user");
          seen.push(Array.isArray(user?.content) ? user.content.flatMap((block) => (block.type === "text" ? [block.text] : [])) : []);
          return fauxAssistantMessage("Filtered.");
        },
      ],
    });

    type(el, "/filters keep the adults");
    await key(el, "Enter");
    await until(() => el.querySelector(".blockr-assistant-reply")?.textContent === "Filtered." && assistant.turns.current() === undefined, "the reply");

    expect(asked(sent, "read_skill")).toEqual([{ name: "filters", packages: [...Object.keys(HELLO.packages), "blockr.assistant"] }]);
    expect(Object.values(inState(assistant))[0]?.messages[0]?.parts).toEqual([text("/filters keep the adults"), { type: "skill", name: "filters", text: "How to filter." }]);
    expect([...el.querySelectorAll(".blockr-assistant-user-text")].map((node) => node.textContent)).toEqual(["/filters keep the adults"]);
    expect(el.textContent).not.toContain("How to filter.");
    expect(seen).toEqual([["The user invoked the `filters` skill. Its instructions:\n\nHow to filter.\n\nThe user's request: keep the adults"]]);
    expect(field(el).value).toBe("");
  });

  test("send nothing for a /name whose skill R cannot read, keep the line in the field, and raise assistant_skills_failed", async () => {
    const { el, assistant, core } = await withSkills({
      answer: skillAnswers(() => {
        throw new Error("The file /srv/skills/filters/SKILL.md is gone.");
      }),
    });

    type(el, "/filters keep the adults");
    await key(el, "Enter");
    await until(() => core.notifications.get().some(({ source }) => source.kind === "module" && "code" in source && source.code === "assistant_skills_failed"), "the error");

    expect(field(el).value).toBe("/filters keep the adults");
    expect(inState(assistant)).toEqual({});
    expect(assistant.turns.current()).toBeUndefined();
  });

  test("send a line whose word after the / names no command as typed, to the model", async () => {
    for (const line of ["/layout", "/srv/data/sales.csv holds the sales"]) {
      const { el, assistant } = await withSkills();

      type(el, line);
      expect(listed(el)).toEqual(line === "/layout" ? [] : undefined);
      await key(el, "Enter");
      await until(() => el.querySelector(".blockr-assistant-reply") !== null && assistant.turns.current() === undefined, "the reply");

      expect(Object.values(inState(assistant))[0]?.messages[0]?.parts).toEqual([text(line)]);
    }
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

describe("the chat's attachments", () => {
  // The bytes of the files that the tests attach: the start of a PNG, which
  // is "iVBORw0KGgo=" as base64, and of a PDF, which is "JVBERi0xLjQK".
  const png = (name = "plot.png") => new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], name, { type: "image/png" });
  const pdf = (name = "report.pdf", size?: number) => new File([size === undefined ? "%PDF-1.4\n" : new Uint8Array(size)], name, { type: "application/pdf" });
  const csv = () => new File(["a,b\n1,2\n"], "sales.csv", { type: "" });

  // The names of the files that the message field stages.
  function staged(el: HTMLElement): string[] {
    return [...el.querySelectorAll(".blockr-assistant-staged .blockr-assistant-file-name")].map((name) => name.textContent);
  }

  // The files given, as the user picks them with the message field's button.
  function pick(el: HTMLElement, ...files: File[]): void {
    const input = el.querySelector<HTMLInputElement>(".blockr-assistant-picker");
    if (input === null) throw new Error("The chat draws no file input.");
    Object.defineProperty(input, "files", { value: files, configurable: true });
    act(() => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function transfer(...files: File[]): DataTransfer {
    const data = new DataTransfer();
    for (const file of files) data.items.add(file);
    return data;
  }

  test("stages the files that the user picks, and sends them with the message, their content into the plugin's memory and to the model", async () => {
    const seen: string[][] = [];
    const { el, assistant } = await chat({
      replies: [
        (context) => {
          const user = context.messages.find((m) => m.role === "user");
          seen.push(Array.isArray(user?.content) ? user.content.map((block) => (block.type === "image" ? block.mimeType : block.text)) : []);
          return fauxAssistantMessage("Read them.");
        },
      ],
    });

    pick(el, png(), pdf(), csv());
    await until(() => staged(el).length === 3, "the staged files");
    expect(staged(el)).toEqual(["plot.png", "report.pdf", "sales.csv"]);

    type(el, "Read these.");
    press(field(el), "Enter");
    await until(() => el.querySelector(".blockr-assistant-reply")?.textContent === "Read them." && assistant.turns.current() === undefined, "the reply");

    const [id, added] = Object.entries(inState(assistant))[0] ?? [];
    expect(added?.messages[0]?.parts).toEqual([
      { type: "text", text: "Read these." },
      { type: "attachment", name: "plot.png", media_type: "image/png" },
      { type: "attachment", name: "report.pdf", media_type: "application/pdf" },
      { type: "attachment", name: "sales.csv", media_type: "text/csv" },
    ]);
    // The memory keeps a copy of each file's bytes, as binary, which every
    // call took.
    const kept = assistant.conversations.kept(id ?? "", added?.messages[0]?.id ?? "")?.files ?? [];
    expect(kept.map((file) => ("blob" in file ? file.taken : file))).toEqual([true, true, true]);
    const bytes = await Promise.all(kept.map(async (file) => ("blob" in file ? [...new Uint8Array(await file.blob.arrayBuffer())] : [])));
    const encoder = new TextEncoder();
    expect(bytes).toEqual([[137, 80, 78, 71, 13, 10, 26, 10], [...encoder.encode("%PDF-1.4\n")], [...encoder.encode("a,b\n1,2\n")]]);
    expect(seen[0]).toEqual([
      "Read these.",
      'The user attached the file "plot.png", of the type image/png.',
      "image/png",
      'The user attached the file "report.pdf", of the type application/pdf.',
      "application/pdf",
      '<file-attachment name="sales.csv" type="text/csv">\na,b\n1,2\n\n</file-attachment>',
    ]);
    expect(staged(el)).toEqual([]);
    const sent = [...el.querySelectorAll(".blockr-assistant-user .blockr-assistant-file")];
    expect(sent.map((file) => file.querySelector(".blockr-assistant-file-name")?.textContent)).toEqual(["plot.png", "report.pdf", "sales.csv"]);
    expect(sent.map((file) => file.tagName)).toEqual(["BUTTON", "BUTTON", "BUTTON"]);
    expect(sent[0]?.querySelector("img")?.getAttribute("src")).toMatch(/^blob:/);
    expect(sent.slice(1).map((file) => file.querySelector(".blockr-assistant-file-badge")?.textContent)).toEqual(["PDF", "CSV"]);
  });

  test("sends a message that holds files and no text", async () => {
    const { el, assistant } = await chat();

    pick(el, csv());
    await until(() => staged(el).length === 1, "the staged file");
    press(field(el), "Enter");
    await until(() => el.querySelector(".blockr-assistant-reply") !== null && assistant.turns.current() === undefined, "the reply");

    expect(Object.values(inState(assistant))[0]?.messages[0]?.parts).toEqual([{ type: "attachment", name: "sales.csv", media_type: "text/csv" }]);
  });

  test("removes a staged file with its button", async () => {
    const { el } = await chat();

    pick(el, png(), csv());
    await until(() => staged(el).length === 2, "the staged files");
    click(el.querySelector('.blockr-assistant-file-remove[aria-label="Remove plot.png"]'));
    await until(() => staged(el).length === 1, "the file to go");

    expect(staged(el)).toEqual(["sales.csv"]);
  });

  test("leaves out a file that the field does not take, and a file that would pass the bound, and says why", async () => {
    const { el } = await chat();

    pick(el, new File(["PK"], "archive.zip", { type: "application/zip" }), pdf("first.pdf", 20 * 1024 * 1024), pdf("second.pdf", 15 * 1024 * 1024), csv());
    await until(() => el.querySelector(".blockr-assistant-files-note") !== null, "the note");

    expect(staged(el)).toEqual(["first.pdf", "sales.csv"]);
    expect(el.querySelector(".blockr-assistant-files-note")?.textContent).toBe(
      'The chat takes images, PDFs and text files, so it left out "archive.zip". The files of a message take up to 30 MB together, so the chat left out "second.pdf".',
    );
  });

  test("takes files that the user pastes, and turns a paste of a long text into a file, while a short paste goes into the text", async () => {
    const { el } = await chat();

    act(() => {
      field(el).dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer(png("pasted.png")), bubbles: true, cancelable: true }));
    });
    await until(() => staged(el).length === 1, "the pasted image");

    const long = new DataTransfer();
    long.setData("text/plain", "x".repeat(1001));
    act(() => {
      field(el).dispatchEvent(new ClipboardEvent("paste", { clipboardData: long, bubbles: true, cancelable: true }));
    });
    await until(() => staged(el).length === 2, "the pasted text");

    const short = new DataTransfer();
    short.setData("text/plain", "x".repeat(1000));
    const event = new ClipboardEvent("paste", { clipboardData: short, bubbles: true, cancelable: true });
    act(() => {
      field(el).dispatchEvent(event);
    });
    await settle();

    expect(staged(el)).toEqual(["pasted.png", "Pasted Text"]);
    expect(event.defaultPrevented).toBe(false);
  });

  test("takes files dropped anywhere on the chat", async () => {
    const { el } = await chat();

    // The DragEvent of happy-dom leaves out the dataTransfer that it is given,
    // which a browser's keeps.
    const dropped = new DragEvent("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(dropped, "dataTransfer", { value: transfer(csv()) });
    act(() => {
      el.querySelector(".blockr-assistant-transcript")?.dispatchEvent(dropped);
    });
    await until(() => staged(el).length === 1, "the dropped file");

    expect(staged(el)).toEqual(["sales.csv"]);
  });

  test("puts the text and the files back into the message field where the message does not enter the conversation", async () => {
    const { el, assistant } = await chat();
    vi.spyOn(assistant.conversations, "addConversation").mockRejectedValue(new Error("The state takes no conversation."));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    pick(el, csv());
    await until(() => staged(el).length === 1, "the staged file");
    type(el, "Read this.");
    press(field(el), "Enter");
    await until(() => staged(el).length === 1 && field(el).value === "Read this." && el.querySelector(".blockr-assistant-send") !== null, "the draft to come back");
    await settle(20);

    expect(field(el).value).toBe("Read this.");
    expect(staged(el)).toEqual(["sales.csv"]);
    expect(Object.keys(inState(assistant))).toEqual([]);
  });

  test("stay in the field as a slash command runs, for the message that the user sends next", async () => {
    const { el, assistant } = await chat();

    pick(el, png());
    await until(() => staged(el).length === 1, "the staged file");
    type(el, "/undo");
    press(field(el), "Enter");
    await settle();

    expect(field(el).value).toBe("");
    expect(el.querySelector(".blockr-assistant-command-note")?.textContent).toBe("The assistant has no edit left to take back.");
    expect(staged(el)).toEqual(["plot.png"]);
    expect(inState(assistant)).toEqual({});
  });
});

describe("the files of a message that the user sent", () => {
  function withFiles() {
    const parts: Part[] = [
      text("Look."),
      { type: "attachment", name: "plot.png", media_type: "image/png" },
      { type: "attachment", name: "report.pdf", media_type: "application/pdf" },
      { type: "attachment", name: "notes.md", media_type: "text/markdown" },
    ];
    localStorage.setItem(KEY, "c1");
    return { conversations: { c1: conversation("Files", message("u1", "user", ...parts), message("a1", "assistant")) } };
  }

  const files = (el: HTMLElement) => [...el.querySelectorAll(".blockr-assistant-user .blockr-assistant-file")];

  test("open large in a dialog where the memory keeps their content: an image as itself, a PDF in the browser's viewer and a text file as its text", async () => {
    const { el, assistant } = await chat({ state: withFiles() });
    act(() => {
      assistant.conversations.keep("c1", "u1", {
        files: [
          { blob: new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" }) },
          { blob: new Blob(["%PDF-1.4\n"], { type: "application/pdf" }) },
          { blob: new Blob(["# Notes"], { type: "text/markdown" }) },
        ],
      });
    });
    await settle();
    const dialog = (): HTMLDialogElement | null => el.querySelector(".blockr-assistant-file-dialog");

    click(files(el)[0] ?? null);
    expect(dialog()?.open).toBe(true);
    expect(dialog()?.querySelector("h2")?.textContent).toBe("plot.png");
    expect(dialog()?.querySelector(".blockr-assistant-file-image")?.getAttribute("src")).toMatch(/^blob:/);
    click(dialog()?.querySelector(".blockr-assistant-file-view-close") ?? null);
    expect(dialog()?.open).toBe(false);

    click(files(el)[1] ?? null);
    await settle();
    expect(dialog()?.querySelector(".blockr-assistant-file-pdf")?.getAttribute("src")).toMatch(/^blob:/);
    click(dialog()?.querySelector(".blockr-assistant-file-view-close") ?? null);

    click(files(el)[2] ?? null);
    await until(() => dialog()?.querySelector(".blockr-assistant-file-text") !== null, "the text");
    expect(dialog()?.querySelector(".blockr-assistant-file-text")?.textContent).toBe("# Notes");
  });

  test("show by their names alone, and open nothing, where the memory lacks their content, and say which the provider refused", async () => {
    const { el, assistant } = await chat({ state: withFiles() });

    expect(files(el).map((file) => [file.tagName, file.textContent])).toEqual([
      ["SPAN", "PNGplot.png"],
      ["SPAN", "PDFreport.pdf"],
      ["SPAN", "MDnotes.md"],
    ]);

    act(() => {
      assistant.conversations.keep("c1", "u1", { files: [{ refused: true }, { blob: new Blob(["%PDF-1.4\n"]), taken: true }, { blob: new Blob(["# Notes"]) }] });
    });
    await settle();
    expect(files(el).map((file) => [file.tagName, file.hasAttribute("data-refused"), file.textContent])).toEqual([
      ["SPAN", true, "PNGplot.pngRefused"],
      ["BUTTON", false, "PDFreport.pdf"],
      ["BUTTON", false, "MDnotes.md"],
    ]);
  });
});
