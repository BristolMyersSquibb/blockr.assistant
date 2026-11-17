// The assistant's plugin class on blockr.core's CoreApi for tests, which
// starts core as the page of an app that runs the assistant would, with R
// played from the fixtures of core's wire protocol, so that the tests need
// neither R nor a browser
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.1.12#testing).

import type { CoreApi, Json } from "@blockr/core";
import { HELLO, stubCore } from "@blockr/core/stubs";
import { act } from "react";
import { describe, expect, onTestFinished, test, vi } from "vitest";
import { assistantOf, nextAssistant, openAssistant } from "../../assistant/index.ts";
import type { AssistantState, Message, Role } from "../../state/index.ts";
import * as assistant from "./index.tsx";

// React warns where an update in a test runs outside act().
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ASSISTANT = "blockr.assistant-assistant_plugin";

// R's reply to hello in an app that runs the assistant beside core's plugins,
// with where R serves the module of the assistant's class, at version 1.
const hello = {
  ...HELLO,
  packages: { ...HELLO.packages, "blockr.assistant": "0.2.0" },
  plugins: {
    ...HELLO.plugins,
    [ASSISTANT]: { name: "Assistant", version: 1, module: "blockr.assistant/js/assistant_plugin.js" },
  },
};

// The same reply with a board that holds no block, so that core's basic
// frontend draws no card, whose block's UI module the test would have to give.
const empty = {
  ...hello,
  board: { ...hello.board, board: { ...hello.board.board, blocks: {}, links: {}, stacks: {} } },
};

// The same reply with a board that holds no block and holds the assistant's
// state given.
function withState(state: AssistantState): typeof hello {
  return {
    ...empty,
    board: {
      ...empty.board,
      board: {
        ...empty.board.board,
        versions: { ...empty.board.board.versions, [ASSISTANT]: 1 },
        plugins: { ...empty.board.board.plugins, [ASSISTANT]: state },
      },
    },
  };
}

function message(id: string, role: Role): Message {
  return { id, role, parts: [{ type: "text", text: id }], created: "2026-11-16T08:00:00.000Z" };
}

// A board whose conversation c1 holds three exchanges, of two messages each.
const three = withState({
  conversations: {
    c1: {
      title: "Sales",
      updated: "2026-11-16T08:00:00.000Z",
      messages: ["1", "2", "3"].flatMap((n) => [message(`u${n}`, "user"), message(`a${n}`, "assistant")]),
      usage: { input: 0, output: 0, last: 0 },
      model: null,
    },
  },
});

// Starts core with the module of the assistant's class, on the board of the
// reply given, where core's basic frontend draws the page in `el` where a test
// gives one, and where R holds the blockr options given. Core stops as the
// test finishes.
async function started(el?: HTMLElement, reply = hello, blockrOptions: Readonly<Record<string, Json>> = {}) {
  const stubbed = await act(() => stubCore({ hello: reply, modules: { [ASSISTANT]: assistant }, el, blockrOptions }));
  onTestFinished(() => {
    act(stubbed.stop);
  });
  return stubbed;
}

// An element on the page, as a frontend gives one to mountPlugin().
function element(): HTMLElement {
  const el = document.createElement("div");
  document.body.append(el);
  onTestFinished(() => {
    el.remove();
  });
  return el;
}

describe("the assistant's plugin class", () => {
  test("is registered under its id with the module's ui and state, and the board holds the state's default", async () => {
    const { core } = await started();

    expect(core.plugins.pluginClass(ASSISTANT).ui).toBe(assistant.default.ui);
    expect(core.plugins.pluginClass(ASSISTANT).state).toBe(assistant.default.state);
    expect(core.store.board().plugins[ASSISTANT]).toEqual({ conversations: {} });
  });

  // The page imports the chat's libraries as the chat first mounts, and the
  // first import of libraries that large can take longer than a test's usual
  // time on a busy machine, so the test waits for them for up to 30 seconds.
  test("draws the chat in the element that a frontend gives mountPlugin(), once the chat's libraries have loaded", { timeout: 60_000 }, async () => {
    const { core, settled } = await started();
    const el = element();

    await act(async () => {
      const end = core.mountPlugin(el, ASSISTANT);
      onTestFinished(() => {
        act(end);
      });
      await settled();
    });
    const start = Date.now();
    while (el.querySelector(".blockr-assistant-greeting") === null && Date.now() - start < 30_000) {
      await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    }

    expect(el.firstElementChild?.className).toBe("blockr-assistant");
    expect(el.querySelector(".blockr-assistant-greeting")).not.toBeNull();
    expect(el.querySelector(".blockr-assistant textarea")?.getAttribute("placeholder")).toBe("Ask about your board");
  });

  test("draws the panel's root before its render() returns, and removes it in the cleanup that render() returns", async () => {
    const { core } = await started();
    const el = element();

    let cleanup = (): void => undefined;
    act(() => {
      cleanup = assistant.default.ui.render({ el, core, plugin: ASSISTANT, signal: new AbortController().signal });
    });
    expect(el.firstElementChild?.className).toBe("blockr-assistant");

    act(cleanup);
    expect(el.childElementCount).toBe(0);
  });

  test("shows its panel in core's basic frontend, in the section titled Assistant", async () => {
    const el = element();
    const { settled } = await started(el, empty);
    await act(() => settled());

    const section = [...el.querySelectorAll("details")].find((d) => d.querySelector("summary")?.textContent === "Assistant");
    expect(section?.querySelector(".blockr-assistant")).not.toBeNull();
  });
});

describe("the start of the assistant's plugin class", () => {
  const conversationIn = (state: Json | undefined) => (state as AssistantState).conversations.c1?.messages.map((m) => m.id);

  test("cuts every conversation to chat_save_turns as the board opens", async () => {
    const { core, settled } = await started(undefined, three, { chat_save_turns: 4 });
    await act(() => settled());

    expect(conversationIn(core.store.board().plugins[ASSISTANT])).toEqual(["u2", "a2", "u3", "a3"]);
  });

  test("moves every conversation out of the state where chat_save_turns is 0", async () => {
    const { core, settled } = await started(undefined, three, { chat_save_turns: "0" });
    await act(() => settled());

    expect(core.store.board().plugins[ASSISTANT]).toEqual({ conversations: {} });
  });

  test("logs why the board's conversations cannot open, where chat_save_turns holds a value that the cap does not take", async () => {
    const { core, settled, logged } = await started(undefined, three, { chat_save_turns: null });
    await act(() => settled());

    expect(conversationIn(core.store.board().plugins[ASSISTANT])).toHaveLength(6);
    expect(logged.filter((line) => line.package === "blockr.assistant").map((line) => [line.level, line.message])).toEqual([
      ["error", "The blockr option chat_save_turns is null, where it takes a whole number of 0 or more, or -1 for every message."],
    ]);
  });

  test("opens the assistant of the board, which the chat finds through the CoreApi, until the next board opens", async () => {
    const { core, settled, stop } = await started(undefined, three);
    await act(() => settled());

    const opened = assistantOf(core);
    expect(opened?.conversations.get("c1")?.messages).toHaveLength(6);
    expect(opened?.turns.current()).toBeUndefined();

    act(stop);
    expect(assistantOf(core)).toBeUndefined();
  });

  test("lets the chat wait for the assistant that start opens, which a closed board's assistant does not stand in for", async () => {
    const stubbed = await act(() => stubCore({ hello: empty, modules: { [ASSISTANT]: { api: 1, default: { ...assistant.default, start: undefined } } } }));
    onTestFinished(() => {
      act(stubbed.stop);
    });
    let next: unknown;
    void nextAssistant(stubbed.core).then((given) => {
      next = given;
    });

    const first = new AbortController();
    const opened = openAssistant(stubbed.core, first.signal);
    await act(() => Promise.resolve());
    expect(next).toBe(opened);
    await expect(nextAssistant(stubbed.core)).resolves.toBe(opened);

    first.abort();
    let after: unknown;
    void nextAssistant(stubbed.core).then((given) => {
      after = given;
    });
    await act(() => Promise.resolve());
    expect(after).toBeUndefined();

    const second = new AbortController();
    onTestFinished(() => {
      second.abort();
    });
    const reopened = openAssistant(stubbed.core, second.signal);
    await act(() => Promise.resolve());
    expect(after).toBe(reopened);
  });

  test("fails each turn with the error assistant_call_failed where the app sets no key", async () => {
    const { core, settled } = await started(undefined, three);
    await act(() => settled());

    await assistantOf(core)?.turns.run("c1");

    expect(raised(core, "assistant_call_failed")).toEqual([
      ["error", "The assistant has no key for its calls, since the app sets none in the blockr option assistant_api_key."],
    ]);
  });

  test("offers the models that the app names in its blockr options, the first being the default", async () => {
    const { core, settled } = await started(undefined, three, { assistant_api_key: "test-key", assistant_models: "gpt-5.4, gpt-5.4-nano" });
    await act(() => settled());

    expect(await assistantOf(core)?.models.offered()).toEqual({ models: ["gpt-5.4", "gpt-5.4-nano"], named: true });
  });

  test("asks the app's base URL for its list of models, with the app's key, as the board opens, where the app names none", async () => {
    const asked: { url: string; headers: Headers }[] = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      asked.push({ url, headers: new Headers(init.headers) });
      return Promise.resolve(Response.json({ object: "list", data: [{ id: "text-embedding-3-small" }, { id: "gpt-5.4" }, { id: "gpt-5.4-mini" }] }));
    });
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    const { core, settled } = await started(undefined, three, { assistant_base_url: "https://proxy.invalid/v1/", assistant_api_key: "test-key" });
    await act(() => settled());

    expect(await assistantOf(core)?.models.offered()).toEqual({ models: ["gpt-5.4", "gpt-5.4-mini"], named: false });
    expect(asked.map(({ url, headers }) => [url, headers.get("authorization")])).toEqual([["https://proxy.invalid/v1/models", "Bearer test-key"]]);
    expect(raised(core, "assistant_models_failed")).toEqual([]);
  });
});

// The notifications of the code given that the assistant raised, each by its
// severity and message.
function raised(core: CoreApi, code: string): [string, string][] {
  return core.notifications
    .get()
    .filter((notification) => notification.source.kind === "module" && notification.source.code === code)
    .map((notification) => [notification.severity, notification.message]);
}
