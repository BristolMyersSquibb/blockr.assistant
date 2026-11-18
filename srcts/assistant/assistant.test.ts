// The assistant of the open board, on blockr.core's CoreApi for tests and the
// loop on pi's fake provider, whose replies the test scripts: its turns offer
// the read tools and the edit tools, and each call sends the system prompt
// and the board as it is when the call goes out. Each test opens the
// assistant itself, on the assistant's class without its start, which would
// open the board's own.

import { stubCore } from "@blockr/core/stubs";
import type { TranscriptContext } from "@earendil-works/pi-ai";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";
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

// Core on the board of core's fixture hello, whose assistant's state holds
// the conversation c1 with the user's question given, and the assistant of
// that board on pi's fake provider, with the replies given. R answers the
// request describe_result for each block that it reads. Core stops as the
// test finishes.
async function openedWith(question: string, replies: FauxResponseStep[]) {
  const state: AssistantState = {
    conversations: {
      c1: {
        title: "Rows",
        updated: CREATED,
        messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: question }], created: CREATED }],
        usage: { input: 0, output: 0, last: 0 },
        model: null,
      },
    },
  };
  const { board } = HELLO_ASSISTANT.board;
  const stubbed = await stubCore({
    hello: {
      ...HELLO_ASSISTANT,
      board: { ...HELLO_ASSISTANT.board, board: { ...board, plugins: { ...board.plugins, [ASSISTANT]: { state, version: 1 } } } },
    },
    modules: { [ASSISTANT]: { api: 1, default: { ...assistant.default, start: undefined } } },
    answer: (request) => {
      if (request.kind !== "request" || request.type !== "plugin") return undefined;
      if (request.name === "describe_result") return Object.fromEntries(request.reads.map(({ block }) => [block, [`The result of ${block}.`]]));
      if (request.name === "list_skills") return [];
      return request.name === "read_template" ? null : undefined;
    },
  });
  const controller = new AbortController();
  onTestFinished(() => {
    controller.abort();
    stubbed.stop();
  });
  const { faux, loop, connection } = fauxLoop();
  faux.setResponses(replies);
  const opened = openAssistant(stubbed.core, controller.signal, {
    deployment: Promise.resolve({ baseUrl: connection.baseUrl, api: connection.api, credential: { kind: "deployment", key: "test-key" }, models: ["faux-1"] }),
    load: () => Promise.resolve(loop),
    locks: LOCKS,
  });
  await opened.conversations.opened;
  return { core: stubbed.core, opened };
}

test("sends each call the system prompt of the open board, and after the conversation the board as it is when the call goes out", async () => {
  const contexts: TranscriptContext[] = [];
  const read =
    (reply: ReturnType<typeof fauxAssistantMessage>): FauxResponseStep =>
    (context) => {
      contexts.push(context);
      return reply;
    };
  const { opened } = await openedWith("Show three rows.", [
    read(
      fauxAssistantMessage([fauxToolCall("edit", { commands: [{ command: "blockr.core-set_block", args: { id: "b", state: { n: 3 } } }] }, { id: "t1" })], {
        stopReason: "toolUse",
      }),
    ),
    read(fauxAssistantMessage("The head block shows three rows.")),
  ]);

  await opened.turns.run("c1");

  const boards = contexts.map((context) => {
    const last = context.messages.at(-1);
    return last?.role === "user" && Array.isArray(last.content) && last.content[0]?.type === "text" ? last.content[0].text : "";
  });
  expect(contexts.map((context) => context.messages[0])).toMatchObject([
    { role: "system", content: expect.stringMatching(/^You are an assistant embedded next to a blockr data analysis board\.\n/) as unknown },
    { role: "system", content: expect.stringMatching(/## Statuses\n/) as unknown },
  ]);
  expect(boards[0]).toContain("- b <blockr.core-head_block> n, direction [unevaluated]\n");
  expect(boards[1]).toContain("- b <blockr.core-head_block> n, direction\n");
});

test("offers the edit tools, so that an edit that the model makes in a turn applies as a step of the assistant", async () => {
  const { core, opened } = await openedWith("Show three rows.", [
    fauxAssistantMessage(
      [fauxToolCall("edit", { commands: [{ command: "blockr.core-set_block", args: { id: "b", state: { n: 3 } } }] }, { id: "t1" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("The head block shows three rows."),
  ]);

  await opened.turns.run("c1");

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
