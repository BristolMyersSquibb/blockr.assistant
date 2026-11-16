// The assistant of the open board, on blockr.core's CoreApi for tests and the
// loop on pi's fake provider, whose replies the test scripts: its turns offer
// the read tools and the edit tools. The test opens the assistant itself, on
// the assistant's class without its start, which would open the board's own.

import { stubCore } from "@blockr/core/stubs";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { expect, onTestFinished, test } from "vitest";
// The module of the assistant's class, which core imports as the page does.
// eslint-disable-next-line no-restricted-imports
import * as assistant from "../modules/assistant_plugin/index.tsx";
import { ASSISTANT } from "../state/index.ts";
import type { AssistantState } from "../state/index.ts";
import { fauxLoop, HELLO_ASSISTANT } from "../testing/index.ts";
import type { Locks } from "../turns/index.ts";
import { openAssistant } from "./assistant.ts";

const CREATED = "2026-11-16T08:00:00.000Z";

// Web Locks that grant each lock at once.
const LOCKS: Locks = {
  request: ((name: string, callback: (lock: Lock | null) => Promise<unknown>) => callback({ name, mode: "exclusive" })) as Locks["request"],
};

test("offers the edit tools, so that an edit that the model makes in a turn applies as a step of the assistant", async () => {
  const state: AssistantState = {
    conversations: {
      c1: {
        title: "Rows",
        updated: CREATED,
        messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Show three rows." }], created: CREATED }],
        usage: { input: 0, output: 0, last: 0 },
        model: null,
      },
    },
  };
  const { board } = HELLO_ASSISTANT.board;
  const stubbed = await stubCore({
    hello: {
      ...HELLO_ASSISTANT,
      board: { ...HELLO_ASSISTANT.board, board: { ...board, versions: { ...board.versions, [ASSISTANT]: 1 }, plugins: { ...board.plugins, [ASSISTANT]: state } } },
    },
    modules: { [ASSISTANT]: { api: 1, default: { ...assistant.default, start: undefined } } },
    answer: (request) =>
      request.kind === "request" && request.type === "plugin" && request.name === "describe_result"
        ? Object.fromEntries(request.reads.map(({ block }) => [block, [`The result of ${block}.`]]))
        : undefined,
  });
  const controller = new AbortController();
  onTestFinished(() => {
    controller.abort();
    stubbed.stop();
  });
  const { faux, loop, connection } = fauxLoop();
  faux.setResponses([
    fauxAssistantMessage(
      [fauxToolCall("edit", { commands: [{ command: "blockr.core-set_block", args: { id: "b", state: { n: 3 } } }] }, { id: "t1" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("The head block shows three rows."),
  ]);
  const opened = openAssistant(stubbed.core, controller.signal, {
    connection: { ...connection, model: "faux-1" },
    load: () => Promise.resolve(loop),
    locks: LOCKS,
  });
  await opened.conversations.opened;

  await opened.turns.run("c1");

  const { core } = stubbed;
  expect(core.store.board().blocks.b?.state.n).toBe(3);
  expect(core.store.canUndo("assistant")).toBe(true);
  const held = (core.store.board().plugins[ASSISTANT] as AssistantState).conversations.c1;
  expect(held?.messages.map(({ role }) => role)).toEqual(["user", "assistant", "tool", "assistant"]);
  const [result] = held?.messages[2]?.parts ?? [];
  expect(result).toMatchObject({ type: "tool_result", id: "t1" });
  expect(result).not.toHaveProperty("error");
  expect(JSON.parse((result as { text: string }).text)).toMatchObject({
    applied: true,
    undo_step: true,
    blocks: { b: { status: "ready", result: "The result of b." } },
  });
});
