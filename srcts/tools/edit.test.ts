// The edit tool and undo_edit, on blockr.core's CoreApi for tests, whose
// board is that of core's fixture hello: a dataset block a, which feeds the
// head block b, the merge block c, the subset block d and the scatter block f,
// while b feeds c and the rbind block e, and d feeds e. R evaluates every block
// as ok unless the test says otherwise, and answers describe_result with a
// text for each block that it reads.

import { context, createContextKey, ROOT_CONTEXT } from "@opentelemetry/api";
import type { ContextManager } from "@opentelemetry/api";
import type { Condition, CoreApi, Json } from "@blockr/core";
import { describe, expect, onTestFinished, test } from "vitest";
import { callTool, parsed, requestNotifications, startAssistant } from "../testing/index.ts";
import type { Answers, StartOptions } from "../testing/index.ts";
import { ASSISTANT } from "../state/index.ts";
import { editTools } from "./index.ts";

const DESCRIBED: Answers = {
  describe_result: ({ reads }) => Object.fromEntries(reads.map(({ block }) => [block, [`The result of ${block}.`]])),
};

const UNVERIFIED =
  "You changed this block and it produced no result to check, so what you built here is UNVERIFIED. Do not report it as done: say what is unverified, or get the block into a state where it evaluates.";

const HINT =
  "Check that each block, link, stack and plugin that the args name is on the board, and each board option is defined, with list_blocks, list_links, list_stacks, list_plugins or list_board_options, and that a block that a new link goes to has a free data input, with describe_block.";

function warning(message: string): Condition {
  return { severity: "warning", class: ["simpleWarning", "warning", "condition"], phase: "expr", message };
}

const ERROR: Condition = { severity: "error", class: ["simpleError", "error", "condition"], phase: "expr", message: "object 'Sepal.Width' not found" };

async function started(options: StartOptions = {}, board: AbortSignal = new AbortController().signal) {
  const stub = await startAssistant({ answers: DESCRIBED, ...options });
  await stub.settled();
  return { ...stub, tools: editTools(stub.core, board) };
}

// The messages of the notifications that core raised for edits that it
// refused, which it raises unless the call's notifier takes them.
function refusedEdits(core: Pick<CoreApi, "notifications">): string[] {
  return core.notifications.get().flatMap(({ source, message }) => (source.kind === "core" && source.code === "board_edit_failed" ? [message] : []));
}

// The blocks that each describe_result request read, in order.
function described(requests: ReturnType<Awaited<ReturnType<typeof started>>["requests"]>): string[][] {
  return requests.map(({ reads }) => reads.map(({ block }) => block));
}

describe("edit", () => {
  test("applies the list as one undo step of the assistant, and reviews the block that it added and the one that feeds it", async () => {
    const { core, tools, requests } = await started();

    const result = await callTool(tools, "edit", {
      commands: [
        { command: "blockr.core-add_block", args: { registry_id: "blockr.core-head_block", id: "h", state: { n: 3 } } },
        { command: "blockr.core-add_link", args: { from: "a", to: "h" } },
      ],
    });

    const link = Object.entries(core.store.board().links).find(([, { to }]) => to === "h")?.[0];
    expect(result.isError).toBe(false);
    expect(parsed(result)).toEqual({
      applied: true,
      undo_step: true,
      added: { blocks: ["h"], links: [link] },
      blocks: {
        h: { status: "ready", conditions: [], result: "The result of h.", state: { n: 3, direction: "head" } },
        a: { status: "ready", conditions: [], result: "The result of a." },
      },
    });
    expect(described(requests("describe_result"))).toEqual([["h", "a"]]);
    expect(core.store.canUndo("assistant")).toBe(true);
  });

  test("reviews the changed block first, then the one that feeds it, then those downstream", async () => {
    const { tools, requests } = await started();

    const result = parsed(await callTool(tools, "edit", { commands: [{ command: "blockr.core-set_block", args: { id: "b", state: { n: 3 } } }] }));

    expect(Object.keys((result as { blocks: object }).blocks)).toEqual(["b", "a", "c", "e"]);
    expect(described(requests("describe_result"))).toEqual([["b", "a", "c", "e"]]);
  });

  test("gives only the conditions that appeared since the edit began, but every error of a failed block", async () => {
    const { core, tools } = await started({
      evaluate: ({ block, recipe }) => {
        if (block === "b") return { conditions: recipe.state.n === 3 ? [warning("old"), warning("new")] : [warning("old")] };
        if (block === "d") return { status: "error", conditions: [ERROR] };
        return undefined;
      },
    });
    await core.scheduler.evaluate(["b", "d"]);

    const called = await callTool(tools, "edit", {
      commands: [
        { command: "blockr.core-set_block", args: { id: "b", state: { n: 3 } } },
        { command: "blockr.core-set_block", args: { id: "d", state: { select: "Species" } } },
      ],
    });
    const result = parsed(called);

    expect(called.isError).toBe(false);
    expect(result).toMatchObject({
      blocks: {
        b: { status: "ready", conditions: [{ severity: "warning", phase: "expr", message: "new" }] },
        d: { status: "failed", conditions: [{ severity: "error", phase: "expr", message: "object 'Sepal.Width' not found" }] },
        e: { status: "waiting", conditions: [] },
      },
    });
    const { blocks } = result as { blocks: Record<string, Record<string, Json>> };
    expect(blocks.d).not.toHaveProperty("unverified");
    expect(blocks.e).toHaveProperty("reason");
    expect(blocks.e).not.toHaveProperty("unverified");
  });

  test("gives why the transport could not send the evaluation of a block that the edit changed", async () => {
    const { tools, requests } = await started({ refuse: ["evaluate"] });

    const called = await callTool(tools, "edit", {
      commands: [{ command: "blockr.core-set_block", args: { id: "a", state: { dataset: "mtcars", package: "datasets" } } }],
    });
    const result = parsed(called);

    expect(called.isError).toBe(false);
    expect(result).toMatchObject({
      blocks: {
        a: { status: "failed", unsent: "The evaluation could not be sent to R: The transport is closed.", conditions: [] },
        b: { status: "waiting", conditions: [] },
      },
    });
    const { blocks } = result as { blocks: Record<string, Record<string, Json>> };
    expect(blocks.a).not.toHaveProperty("unverified");
    expect(blocks.b).not.toHaveProperty("unsent");
    expect(requests("describe_result")).toEqual([]);
  });

  test("marks a changed block that holds no result as unverified, and names the link that the edit removed", async () => {
    const { tools } = await started();

    const result = parsed(await callTool(tools, "edit", { commands: [{ command: "blockr.core-remove_link", args: { id: "ab" } }] }));

    expect(result).toMatchObject({
      applied: true,
      undo_step: true,
      removed: { links: ["ab"] },
      blocks: { b: { status: "waiting", unverified: UNVERIFIED } },
    });
    expect((result as { blocks: Record<string, Json> }).blocks.b).toHaveProperty("reason");
  });

  test("gives the warnings of R's reply to its request in its notes, and core raises no notification for them", async () => {
    const { core, tools } = await started({ conditions: { describe_result: [warning("NAs introduced by coercion")] } });

    const result = parsed(await callTool(tools, "edit", { commands: [{ command: "blockr.core-set_block", args: { id: "b", state: { n: 3 } } }] }));

    expect(result).toMatchObject({
      blocks: { b: { result: "The result of b." } },
      notes: ["R raised these as it described the results:\nWarning: NAs introduced by coercion"],
    });
    expect(requestNotifications(core)).toEqual([]);
  });

  test("cuts the review at assistant_review_max_blocks, and says how many blocks it left out", async () => {
    const { tools, requests } = await started({ blockrOptions: { assistant_review_max_blocks: 2 } });

    const result = parsed(await callTool(tools, "edit", { commands: [{ command: "blockr.core-set_block", args: { id: "b", state: { n: 3 } } }] }));

    expect(Object.keys((result as { blocks: object }).blocks)).toEqual(["b", "a"]);
    expect(result).toMatchObject({
      notes: [
        "The review shows 2 of the 4 blocks that the commands changed, that feed them or that are downstream of them. Call get_block_result or inspect_results for the rest.",
      ],
    });
    expect(described(requests("describe_result"))).toEqual([["b", "a"]]);
  });

  test("leaves out and cuts the state of an added block, as describe_block does", async () => {
    const { tools } = await started({ blockrOptions: { assistant_state_value_max_chars: 10 } });

    const result = parsed(
      await callTool(tools, "edit", {
        commands: [
          {
            command: "blockr.core-add_block",
            args: { registry_id: "blockr.core-subset_block", id: "s", state: { subset: "Sepal.Length > 5 & Petal.Length < 2" } },
          },
          { command: "blockr.core-add_link", args: { from: "a", to: "s" } },
        ],
      }),
    );

    expect(result).toMatchObject({
      blocks: { s: { state: { subset: "[35 chars omitted -- call get_block_state for the full argument values]", select: "" } } },
    });
  });

  test("returns at once for a list that changes no block, and evaluates nothing", async () => {
    const { tools, sent, settled } = await started();
    const before = sent.length;

    const result = await callTool(tools, "edit", { commands: [{ command: "blockr.core-rename_stack", args: { id: "s1", name: "Data" } }] });

    expect(parsed(result)).toEqual({ applied: true, undo_step: true });
    await settled();
    expect(sent.slice(before).filter(({ kind }) => kind === "evaluate" || kind === "request")).toEqual([]);
  });

  test("says that the commands changed nothing, where the board holds what they set already", async () => {
    const { core, tools } = await started();
    const board = core.store.board();

    const result = await callTool(tools, "edit", { commands: [{ command: "blockr.core-set_block", args: { id: "b", state: { n: 6 } } }] });

    expect(result.isError).toBe(false);
    expect(parsed(result)).toEqual({
      applied: true,
      undo_step: false,
      notes: ["The commands changed nothing on the board, so there is nothing to review. The board may hold what they set already."],
    });
    expect(core.store.board()).toBe(board);
  });

  test("takes no undo step for a list that only sets board options, or whose commands all have undo: false", async () => {
    const { core, tools } = await started();
    core.commands.register({ id: "blockr.test-rename", label: "Rename", undo: false, run: () => ({ name: "Renamed" }) });

    expect(parsed(await callTool(tools, "edit", { commands: [{ command: "blockr.core-set_option", args: { id: "n_rows", value: 10 } }] }))).toEqual({
      applied: true,
      undo_step: false,
    });
    expect(parsed(await callTool(tools, "edit", { commands: [{ command: "blockr.test-rename" }] }))).toEqual({ applied: true, undo_step: false });
    expect(core.store.board().name).toBe("Renamed");
    expect(core.store.canUndo("assistant")).toBe(false);
  });

  test("takes no undo step for a list that sets board options beside a command with undo: false, as the store takes none", async () => {
    const { core, tools } = await started();
    core.commands.register({ id: "blockr.test-rename", label: "Rename", undo: false, run: () => ({ name: "Renamed" }) });

    const result = await callTool(tools, "edit", {
      commands: [{ command: "blockr.test-rename" }, { command: "blockr.core-set_option", args: { id: "n_rows", value: 10 } }],
    });
    expect(parsed(result)).toEqual({ applied: true, undo_step: false });
    expect(core.store.board().name).toBe("Renamed");
    expect(core.store.board().options.n_rows).toBe(10);
    expect(core.store.canUndo("assistant")).toBe(false);
  });

  test("takes an undo step for a list where a command without undo: false changes the board beside one with undo: false", async () => {
    const { core, tools } = await started();
    core.commands.register({ id: "blockr.test-rename", label: "Rename", undo: false, run: () => ({ name: "Renamed" }) });

    const result = await callTool(tools, "edit", {
      commands: [{ command: "blockr.test-rename" }, { command: "blockr.core-rename_stack", args: { id: "s1", name: "Data" } }],
    });
    expect(parsed(result)).toEqual({ applied: true, undo_step: true });
    expect(core.store.canUndo("assistant")).toBe(true);
  });

  test("takes no undo step for a delta that sets a board option and gives a block the state it holds, as the store takes none", async () => {
    const { core, tools } = await started();
    // A plugin's command whose delta sets a board option's value and gives
    // block b the state it holds, { n: 6 }. The store announces the block's
    // part of the delta too, but keeps no inverse of it.
    core.commands.register({
      id: "blockr.test-set_rows",
      label: "Set the rows",
      run: () => ({ blocks: { mod: { b: { state: { n: 6 } } } }, options: { set: { n_rows: 10 } } }),
    });

    const result = await callTool(tools, "edit", { commands: [{ command: "blockr.test-set_rows" }] });
    expect(parsed(result)).toMatchObject({ applied: true, undo_step: false });
    expect(core.store.board().options.n_rows).toBe(10);
    expect(core.store.canUndo("assistant")).toBe(false);
  });

  test("returns the index, the id and the failures of a command that fails its preflight, with a hint, applies none of the list, and core raises no notification for it", async () => {
    const { core, tools, sent, settled } = await started();
    const board = core.store.board();
    const before = sent.length;

    const result = await callTool(tools, "edit", {
      commands: [
        { command: "blockr.core-add_block", args: { registry_id: "blockr.core-head_block", id: "h" } },
        { command: "blockr.core-add_link", args: { from: "a", to: "hh" } },
      ],
    });

    expect(result.isError).toBe(true);
    expect(parsed(result)).toEqual({
      applied: false,
      index: 1,
      command: "blockr.core-add_link",
      failures: ['It fails its preflight on the board as it is, with the args {"from":"a","to":"hh"}.'],
      hint: HINT,
    });
    expect(core.store.board()).toBe(board);
    expect(refusedEdits(core)).toEqual([]);
    await settled();
    expect(sent.slice(before).filter(({ kind }) => kind === "evaluate" || kind === "request")).toEqual([]);
  });

  test("gives no hint for a command whose args fail its schema", async () => {
    const { tools } = await started();

    const result = parsed(await callTool(tools, "edit", { commands: [{ command: "blockr.core-remove_block", args: { block: "b" } }] }));

    expect(result).toMatchObject({ applied: false, index: 0, command: "blockr.core-remove_block" });
    expect(result).not.toHaveProperty("hint");
  });

  test("says in its hint that a lock may be why a command fails its preflight on a locked board", async () => {
    const { tools } = await started({
      locked: true,
      plugins: { "blockr.test-notes_plugin": { name: "Notes", definition: { state: { schema: { type: "string" }, default: "" } } } },
    });

    const result = parsed(
      await callTool(tools, "edit", {
        commands: [{ command: "blockr.core-set_plugin_state", args: { plugin: "blockr.test-notes_plugin", patches: [{ op: "replace", path: "", value: "Hi" }] } }],
      }),
    );

    expect(result).toMatchObject({ applied: false, index: 0, command: "blockr.core-set_plugin_state" });
    expect((result as { hint: string }).hint).toBe(
      `${HINT} The board is locked, which may be why: on a locked board, blockr.core-set_plugin_state fails its preflight, and a plugin's own commands fail theirs for what the plugin locks.`,
    );
  });

  test("refuses, before it runs anything, a command of the assistant's own, core's command for the assistant's state, and a command that the app lacks", async () => {
    const { core, tools } = await started();
    const board = core.store.board();
    const head = { command: "blockr.core-set_block", args: { id: "b", state: { n: 3 } } };

    for (const [refused, failure] of [
      [{ command: "blockr.assistant-add_conversation", args: { id: "c1", title: "Hi" } }, 'The app registers no command "blockr.assistant-add_conversation" that you may run. Call list_commands for those that it registers.'],
      [
        { command: "blockr.core-set_plugin_state", args: { plugin: ASSISTANT, patches: [] } },
        `Only the assistant's chat and loop change the assistant's conversations, so an edit sets no state of the plugin "${ASSISTANT}".`,
      ],
      [{ command: "blockr.test-nothing" }, 'The app registers no command "blockr.test-nothing" that you may run. Call list_commands for those that it registers.'],
    ] as const) {
      const result = await callTool(tools, "edit", { commands: [head, refused] });
      expect(result.isError).toBe(true);
      expect(parsed(result)).toEqual({ applied: false, index: 1, command: refused.command, failures: [failure] });
    }
    expect(core.store.board()).toBe(board);
  });

  test("runs the calls of a response one after the other, as undo_edit does", async () => {
    const { tools } = await started();

    expect(tools.map(({ name, executionMode }) => ({ name, executionMode }))).toEqual([
      { name: "edit", executionMode: "sequential" },
      { name: "undo_edit", executionMode: "sequential" },
    ]);
  });
});

describe("undo_edit", () => {
  test("takes back the assistant's last undo step, past a step of the user's after it, and reviews what the undo changed", async () => {
    const { core, tools, requests } = await started();
    await callTool(tools, "edit", { commands: [{ command: "blockr.core-set_block", args: { id: "b", state: { n: 3 } } }] });
    await core.commands.run("blockr.core-rename_block", { id: "d", name: "Subset" });

    const result = await callTool(tools, "undo_edit");

    expect(result.isError).toBe(false);
    expect(parsed(result)).toMatchObject({ applied: true, blocks: { b: { status: "ready", result: "The result of b." } } });
    expect(parsed(result)).not.toHaveProperty("undo_step");
    expect(core.store.board().blocks.b?.state.n).toBe(6);
    expect(core.store.board().blocks.d?.name).toBe("Subset");
    expect(described(requests("describe_result")).at(-1)).toEqual(["b", "a", "c", "e"]);
  });

  test("names what the undo removed", async () => {
    const { core, tools } = await started();
    await callTool(tools, "edit", {
      commands: [
        { command: "blockr.core-add_block", args: { registry_id: "blockr.core-head_block", id: "h" } },
        { command: "blockr.core-add_link", args: { from: "a", to: "h" } },
      ],
    });
    const link = Object.entries(core.store.board().links).find(([, { to }]) => to === "h")?.[0];

    expect(parsed(await callTool(tools, "undo_edit"))).toEqual({ applied: true, removed: { blocks: ["h"], links: [link] } });
  });

  test("changes nothing, and says so as no error, where the assistant has no edit left to take back", async () => {
    const { core, tools } = await started();
    const board = core.store.board();

    const result = await callTool(tools, "undo_edit");

    expect(result.isError).toBe(false);
    expect(parsed(result)).toEqual({
      applied: false,
      notes: ["The assistant has no edit left to take back, so the tool changed nothing. Tell the user that there is nothing to undo."],
    });
    expect(core.store.board()).toBe(board);
  });

  test("returns why the store refuses the undo, leaves the board as it was, and core raises no notification for it", async () => {
    const { core, tools } = await started();
    await callTool(tools, "edit", { commands: [{ command: "blockr.core-remove_link", args: { id: "ab" } }] });
    await core.commands.run("blockr.core-add_link", { from: "d", to: "b", input: "data" });
    const board = core.store.board();

    const result = await callTool(tools, "undo_edit");

    expect(result.isError).toBe(true);
    expect(parsed(result)).toMatchObject({ applied: false, failures: [expect.any(String)] });
    expect(core.store.board()).toBe(board);
    expect(refusedEdits(core)).toEqual([]);
  });
});

// The CoreApi given, whose request() rejects as `fail` says for each call, by
// its count from 1, and otherwise sends the request.
function failing(core: CoreApi, fail: (call: number) => Error | undefined): CoreApi {
  let calls = 0;
  return {
    ...core,
    request: (...args: Parameters<CoreApi["request"]>) => {
      const error = fail(++calls);
      return error === undefined ? core.request(...args) : Promise.reject(error);
    },
  };
}

function named(name: string, message: string, fields: object = {}): Error {
  return Object.assign(new Error(message), { name }, fields);
}

describe("edit meanwhile", () => {
  test("sends the request once more without the blocks that core's rejection names", async () => {
    const stub = await started();
    const status = stub.core.scheduler.status("c");
    const core = failing(stub.core, (call) =>
      call === 1 ? named("RequestError", "The request did not go to R.", { blocks: [{ block: "c", status }], status: null, conditions: [], inputs: [] }) : undefined,
    );

    const result = parsed(await callTool(editTools(core, new AbortController().signal), "edit", { commands: [{ command: "blockr.core-set_block", args: { id: "b", state: { n: 3 } } }] }));

    expect(described(stub.requests("describe_result"))).toEqual([["b", "a", "e"]]);
    expect(result).toMatchObject({ blocks: { b: { result: "The result of b." }, c: { status: "ready" }, e: { result: "The result of e." } } });
    expect((result as { blocks: Record<string, Json> }).blocks.c).not.toHaveProperty("result");
  });

  test("gives each ready block's summary where the request fails twice", async () => {
    const stub = await started({ evaluate: () => ({ summary: "<data.frame> [150 × 5]" }) });
    const core = failing(stub.core, () => named("RequestError", "R replied error.", { blocks: [], status: "error", conditions: [], inputs: [] }));

    const result = await callTool(editTools(core, new AbortController().signal), "edit", {
      commands: [{ command: "blockr.core-set_block", args: { id: "b", state: { n: 3 } } }],
    });

    expect(result.isError).toBe(false);
    expect(parsed(result)).toMatchObject({
      applied: true,
      blocks: { b: { status: "ready", summary: "<data.frame> [150 × 5]" }, a: { summary: "<data.frame> [150 × 5]" } },
      notes: [
        "The review could not finish the request that has R describe the results. R replied error. So it gives each block's status as it is now, and the one-line summary of each ready block's result in place of a description. Call get_block_result for a block's result.",
      ],
    });
  });

  test("evaluates again once where R loses the request to a new session, and gives up the second time", async () => {
    const stub = await started({ evaluate: () => ({ summary: "<data.frame> [6 × 5]" }) });
    const lost = () => named("SessionEndedError", "The session ended before R replied.");
    const once = failing(stub.core, (call) => (call === 1 ? lost() : undefined));

    expect(parsed(await callTool(editTools(once, new AbortController().signal), "edit", { commands: [{ command: "blockr.core-set_block", args: { id: "b", state: { n: 3 } } }] }))).toMatchObject({
      blocks: { b: { result: "The result of b." } },
    });

    const twice = failing(stub.core, () => lost());
    expect(parsed(await callTool(editTools(twice, new AbortController().signal), "edit", { commands: [{ command: "blockr.core-set_block", args: { id: "b", state: { n: 4 } } }] }))).toMatchObject({
      blocks: { b: { summary: "<data.frame> [6 × 5]" } },
      notes: [expect.stringContaining("R's session ended twice before R answered. So it gives")],
    });
  });

  test("reports a block that the user edits meanwhile at its newer revision, waiting for it rather than failing", async () => {
    const late: { core?: CoreApi } = {};
    let edited = false;
    const stub = await started({
      evaluate: ({ block, recipe }) => {
        if (block === "b" && recipe.state.n === 3 && !edited) {
          edited = true;
          void late.core?.commands.run("blockr.core-set_block", { id: "b", state: { n: 4 } });
        }
        return undefined;
      },
    });
    late.core = stub.core;

    const result = await callTool(stub.tools, "edit", { commands: [{ command: "blockr.core-set_block", args: { id: "b", state: { n: 3 } } }] });

    expect(edited).toBe(true);
    expect(stub.core.store.board().blocks.b?.state.n).toBe(4);
    expect(result.isError).toBe(false);
    expect(parsed(result)).toMatchObject({ applied: true, blocks: { b: { status: "ready", result: "The result of b." } } });
    const reads = stub.requests("describe_result").flatMap((request) => request.reads);
    expect(reads.find(({ block }) => block === "b")?.revision).toBe(stub.core.scheduler.status("b")?.revision);
  });

  test("names as removed a block that leaves the board while the tool waits", async () => {
    const late: { core?: CoreApi } = {};
    const stub = await started({
      answers: {
        describe_result: async ({ reads }) => {
          await late.core?.commands.run("blockr.core-remove_block", { id: "e" });
          return Object.fromEntries(reads.map(({ block }) => [block, [`The result of ${block}.`]]));
        },
      },
    });
    late.core = stub.core;

    const result = parsed(await callTool(stub.tools, "edit", { commands: [{ command: "blockr.core-set_block", args: { id: "b", state: { n: 3 } } }] }));

    expect(result).toMatchObject({ blocks: { b: { result: "The result of b." }, e: { removed: "The block left the board while the tool waited for its review." } } });
  });

  test("names each block as removed where every block of the evaluation leaves the board", async () => {
    const late: { core?: CoreApi } = {};
    const stub = await started({
      evaluate: ({ block }) => {
        if (block === "h") late.core?.store.apply({ blocks: { rm: ["h"] } }, "user");
        return undefined;
      },
    });
    late.core = stub.core;

    const result = parsed(
      await callTool(stub.tools, "edit", { commands: [{ command: "blockr.core-add_block", args: { registry_id: "blockr.core-dataset_block", id: "h" } }] }),
    );

    expect(result).toEqual({ applied: true, undo_step: true, added: { blocks: ["h"] }, blocks: { h: { removed: "The block left the board while the tool waited for its review." } } });
  });

  test("takes none of the user's changes, nor the conversations', for its own, while a command prepares", async () => {
    let open: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    let preparing: () => void = () => undefined;
    const prepared = new Promise<void>((resolve) => {
      preparing = resolve;
    });
    const { core, tools } = await started();
    core.commands.register({
      id: "blockr.test-slow_option",
      label: "Set rows slowly",
      prepare: () => {
        preparing();
        return gate;
      },
      run: () => ({ options: { set: { n_rows: 10 } } }),
    });

    const called = callTool(tools, "edit", { commands: [{ command: "blockr.test-slow_option" }] });
    await prepared;
    await core.commands.run("blockr.core-set_block", { id: "d", state: { select: "Species" } });
    await core.commands.run("blockr.assistant-add_conversation", { id: "c1", title: "Rows" }, "assistant");
    await core.commands.run("blockr.core-remove_block", { id: "f" });
    open();

    expect(parsed(await called)).toEqual({ applied: true, undo_step: false });
  });

  test("returns that the commands applied, with no review, where the user stops the turn while a command prepares", async () => {
    let open: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    let preparing: () => void = () => undefined;
    const prepared = new Promise<void>((resolve) => {
      preparing = resolve;
    });
    const { core, tools } = await started();
    core.commands.register({
      id: "blockr.test-slow_head",
      label: "Slow head",
      prepare: () => {
        preparing();
        return gate;
      },
      run: () => ({ blocks: { mod: { b: { state: { n: 2 } } } } }),
    });
    const turn = new AbortController();

    const called = callTool(tools, "edit", { commands: [{ command: "blockr.test-slow_head" }] }, turn.signal);
    await prepared;
    turn.abort(new Error("The user stopped the turn."));
    open();

    const result = await called;
    expect(result.isError).toBe(false);
    expect(parsed(result)).toEqual({
      applied: true,
      undo_step: true,
      notes: ["The user stopped the turn while a command of the list prepared. The commands applied all the same, but the tool reviewed nothing, so do not run them again."],
    });
    expect(core.store.board().blocks.b?.state.n).toBe(2);
  });

  test("returns that the commands applied, with the statuses that it has, where the user stops the turn while it waits", async () => {
    const turn = new AbortController();
    const { tools, requests } = await started({
      evaluate: ({ block }) => {
        if (block === "b") turn.abort(new Error("The user stopped the turn."));
        return undefined;
      },
    });

    const result = await callTool(tools, "edit", { commands: [{ command: "blockr.core-set_block", args: { id: "b", state: { n: 3 } } }] }, turn.signal);

    const value = parsed(result) as { blocks: Record<string, Json> };
    expect(result.isError).toBe(false);
    expect(value).toMatchObject({
      applied: true,
      undo_step: true,
      notes: [
        "The user stopped the turn while the tool waited for its review, after the commands applied. So the review gives each block's status as it was then, with no description of its result.",
      ],
    });
    // R's reply to the evaluation of b may land before the review reads b's
    // status or after, so b reads ready or unverified, but is never described.
    expect(value.blocks.b).toHaveProperty("status");
    expect(value.blocks.b).not.toHaveProperty("result");
    expect(requests("describe_result")).toEqual([]);
  });

  test("rejects with the signal's reason, and runs nothing, where the user stopped the turn before the call", async () => {
    const { core, tools } = await started();
    const board = core.store.board();
    const turn = new AbortController();
    turn.abort(new Error("The user stopped the turn."));

    await expect(callTool(tools, "edit", { commands: [{ command: "blockr.core-set_block", args: { id: "b", state: { n: 3 } } }] }, turn.signal)).rejects.toThrow(
      "The user stopped the turn.",
    );
    expect(core.store.board()).toBe(board);
  });

  test("returns that the commands applied to a board that is no longer open, where another board opens while it waits", async () => {
    let probe: AbortSignal | undefined;
    const late: { core?: CoreApi } = {};
    const stub = await startAssistant({
      plugins: {
        "blockr.test-probe_plugin": {
          name: "Probe",
          definition: {
            start: ({ signal }: { signal: AbortSignal }) => {
              probe = signal;
              return undefined;
            },
          },
        },
      },
      answers: {
        describe_result: () => {
          void late.core?.store.open(late.core.store.save());
          return new Promise(() => undefined);
        },
      },
    });
    await stub.settled();
    late.core = stub.core;
    if (probe === undefined) throw new Error("The probe plugin did not start.");

    const result = parsed(await callTool(editTools(stub.core, probe), "edit", { commands: [{ command: "blockr.core-set_block", args: { id: "b", state: { n: 3 } } }] }));

    expect(probe.aborted).toBe(true);
    expect(result).toEqual({
      applied: true,
      undo_step: true,
      notes: ["Another board opened while the tool waited, so the commands applied to a board that is no longer open."],
    });
  });
});

// A context manager that keeps a context active only through synchronous
// calls, as the StackContextManager of OpenTelemetry's SDK for the browser
// does, which core sets up on the page.
function stackContextManager(): ContextManager {
  let active = ROOT_CONTEXT;
  const manager: ContextManager = {
    active: () => active,
    with(given, fn, thisArg, ...args) {
      const before = active;
      active = given;
      try {
        return fn.call(thisArg, ...args);
      } finally {
        active = before;
      }
    },
    bind: (_given, target) => target,
    enable: () => manager,
    disable() {
      active = ROOT_CONTEXT;
      return manager;
    },
  };
  return manager;
}

describe("spans", () => {
  test("runs the commands and sends the request of the review in the context that was active as the tool was called", async () => {
    const key = createContextKey("blockr.test-span");
    context.setGlobalContextManager(stackContextManager());
    onTestFinished(() => {
      context.disable();
    });
    const stub = await started();
    const seen: unknown[] = [];
    stub.core.commands.register({
      id: "blockr.test-probe",
      label: "Probe",
      run: () => {
        seen.push(["command", context.active().getValue(key)]);
        return [];
      },
    });
    const core: CoreApi = {
      ...stub.core,
      request: (...args: Parameters<CoreApi["request"]>) => {
        seen.push(["request", context.active().getValue(key)]);
        return stub.core.request(...args);
      },
    };
    const tools = editTools(core, new AbortController().signal);

    await context.with(ROOT_CONTEXT.setValue(key, "the tool's span"), () =>
      callTool(tools, "edit", {
        commands: [{ command: "blockr.test-probe" }, { command: "blockr.core-set_block", args: { id: "b", state: { n: 3 } } }],
      }),
    );

    expect(seen).toEqual([
      ["command", "the tool's span"],
      ["request", "the tool's span"],
    ]);
  });
});
