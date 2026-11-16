// The assistant's plugin class on blockr.core's CoreApi for tests, which
// starts core as the page of an app that runs the assistant would, with R
// played from the fixtures of core's wire protocol, so that the tests need
// neither R nor a browser
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.1.12#testing).

import { HELLO, stubCore } from "@blockr/core/stubs";
import { act } from "react";
import { describe, expect, onTestFinished, test } from "vitest";
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

// Starts core with the module of the assistant's class, on the board of the
// reply given, where core's basic frontend draws the page in `el` where a test
// gives one. Core stops as the test finishes.
async function started(el?: HTMLElement, reply = hello) {
  const stubbed = await act(() => stubCore({ hello: reply, modules: { [ASSISTANT]: assistant }, el }));
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
  test("is registered under its id with the module's ui, and keeps nothing in the board", async () => {
    const { core } = await started();

    expect(core.plugins.pluginClass(ASSISTANT).ui).toBe(assistant.default.ui);
    expect(core.store.board().plugins).not.toHaveProperty(ASSISTANT);
  });

  test("draws an empty panel in the element that a frontend gives mountPlugin()", async () => {
    const { core, settled } = await started();
    const el = element();

    await act(async () => {
      const end = core.mountPlugin(el, ASSISTANT);
      onTestFinished(() => {
        act(end);
      });
      await settled();
    });

    expect(el.innerHTML).toBe("<div></div>");
  });

  test("unmounts the panel in the cleanup that its render() returns", async () => {
    const { core } = await started();
    const el = element();

    let cleanup = (): void => undefined;
    act(() => {
      cleanup = assistant.default.ui.render({ el, core, plugin: ASSISTANT, signal: new AbortController().signal });
    });
    expect(el.innerHTML).toBe("<div></div>");

    act(cleanup);
    expect(el.childElementCount).toBe(0);
  });

  test("shows its panel in core's basic frontend, in the section titled Assistant", async () => {
    const el = element();
    const { settled } = await started(el, empty);
    await act(() => settled());

    // The section holds the panel inside the markup that core puts around
    // the element it mounts the panel in, which holds nothing where core
    // mounts no panel.
    const section = [...el.querySelectorAll("details")].find((d) => d.querySelector("summary")?.textContent === "Assistant");
    expect(section?.lastElementChild?.innerHTML).toContain("<div></div>");
  });
});
