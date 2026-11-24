// The tools that read the blocks of the board, on blockr.core's CoreApi for
// tests, on a board of a test package's block classes: a data block a, b and
// d downstream of it, the merge block c of a and b, and the bind block e of b
// and d.

import type { Board, Condition } from "@blockr/core";
import { describe, expect, test } from "vitest";
import { blockClass, callTool, parsed, skill, skillsHolding, startAssistant } from "../testing/index.ts";
import type { StartOptions } from "../testing/index.ts";
import type { Skill } from "../skills/index.ts";
import { readTools } from "./index.ts";

const ERROR: Condition = { severity: "error", class: ["simpleError", "error", "condition"], phase: "expr", message: "object 'Sepal.Width' not found" };
const WARNING: Condition = { severity: "warning", class: ["simpleWarning", "warning", "condition"], phase: "expr", message: "NaNs produced" };

const DATA = blockClass("blockr.test-data_block", { category: "input" });
const HEAD = blockClass("blockr.test-head_block", { inputs: ["data"] });
const MERGE = blockClass("blockr.test-merge_block", { inputs: ["x", "y"] });
const SUBSET = blockClass("blockr.test-subset_block", { inputs: ["data"] });
const BIND = blockClass("blockr.test-bind_block", { inputs: ["..."] });

const BOARD = {
  blocks: {
    a: { registry_id: DATA.id, state: { dataset: "iris" }, name: "Iris", locked: null },
    b: { registry_id: HEAD.id, state: { n: 6 }, name: "Head", locked: null },
    c: { registry_id: MERGE.id, state: { by: ["Species"], all_x: false, all_y: false }, name: "Merge", locked: null },
    d: { registry_id: SUBSET.id, state: { subset: "log(Sepal.Width - 3) > 0", select: "" }, name: "Wide sepals", locked: null },
    e: { registry_id: BIND.id, state: {}, name: "Bind", locked: null },
  },
  links: {
    ab: { from: "a", to: "b", input: "data" },
    ac: { from: "a", to: "c", input: "x" },
    bc: { from: "b", to: "c", input: "y" },
    ad: { from: "a", to: "d", input: "data" },
    be: { from: "b", to: "e", input: "" },
    de: { from: "d", to: "e", input: "" },
  },
} satisfies Partial<Board>;

async function started(options: StartOptions = {}, skills: readonly Skill[] = []) {
  const stub = await startAssistant({ blockClasses: [DATA, HEAD, MERGE, SUBSET, BIND], board: BOARD, ...options });
  return { ...stub, tools: readTools(stub.core, skillsHolding(...skills)) };
}

describe("list_blocks", () => {
  test("gives each block's id, name, registry id and status, as the board holds them now", async () => {
    const { core, tools } = await started();
    await core.scheduler.evaluate(["b"]);

    const result = await callTool(tools, "list_blocks");

    expect(result.isError).toBe(false);
    expect(parsed(result)).toEqual([
      { id: "a", name: "Iris", registry_id: "blockr.test-data_block", status: "ready" },
      { id: "b", name: "Head", registry_id: "blockr.test-head_block", status: "ready" },
      { id: "c", name: "Merge", registry_id: "blockr.test-merge_block", status: "unevaluated" },
      { id: "d", name: "Wide sepals", registry_id: "blockr.test-subset_block", status: "unevaluated" },
      { id: "e", name: "Bind", registry_id: "blockr.test-bind_block", status: "unevaluated" },
    ]);
  });
});

describe("describe_block", () => {
  test("gives the block's class, status, summary, conditions, inputs with the links into them, and state", async () => {
    const { core, tools } = await started({ evaluate: () => ({ summary: "<data.frame> [150 × 5]" }) });
    await core.scheduler.evaluate(["c"]);

    expect(parsed(await callTool(tools, "describe_block", { id: "c" }))).toEqual({
      id: "c",
      name: "Merge",
      registry_id: "blockr.test-merge_block",
      status: "ready",
      summary: "<data.frame> [150 × 5]",
      conditions: [],
      inputs: ["x", "y"],
      links: [
        { id: "ac", from: "a", input: "x" },
        { id: "bc", from: "b", input: "y" },
      ],
      state: { by: ["Species"], all_x: false, all_y: false },
    });
  });

  test("says of a block that is not evaluated what that means, and evaluates nothing", async () => {
    const { tools, sent, settled } = await started();
    await settled();
    const before = sent.length;

    const described = parsed(await callTool(tools, "describe_block", { id: "e" }));

    expect(described).toMatchObject({ status: "unevaluated", inputs: ["..."], links: [{ id: "be", from: "b", input: "" }, { id: "de", from: "d", input: "" }] });
    expect(described).toHaveProperty("note", expect.stringContaining("has not been evaluated yet") as unknown);
    await settled();
    expect(sent.slice(before).filter(({ kind }) => kind === "evaluate" || kind === "request")).toEqual([]);
  });

  test("gives why a block is invalid, and why one downstream of it waits", async () => {
    const { core, tools } = await started({
      evaluate: ({ block }) => (block === "d" ? { status: "invalid", reason: "The subset is not a condition." } : undefined),
    });
    await core.scheduler.evaluate(["b", "d"]);

    expect(parsed(await callTool(tools, "describe_block", { id: "d" }))).toMatchObject({ status: "invalid", reason: "The subset is not a condition." });
    expect(parsed(await callTool(tools, "describe_block", { id: "e" }))).toMatchObject({
      status: "waiting",
      reason: expect.stringContaining('"d"') as unknown,
    });
  });

  test("gives the conditions of a block that failed", async () => {
    const { core, tools } = await started({
      evaluate: ({ block }) => (block === "d" ? { status: "error", conditions: [WARNING, ERROR] } : undefined),
    });
    await core.scheduler.evaluate(["d"]);

    expect(parsed(await callTool(tools, "describe_block", { id: "d" }))).toMatchObject({
      status: "failed",
      conditions: [
        { severity: "warning", phase: "expr", message: "NaNs produced" },
        { severity: "error", phase: "expr", message: "object 'Sepal.Width' not found" },
      ],
    });
  });

  test("gives why the transport could not send the block's latest evaluation", async () => {
    const { core, tools } = await started({ refuse: ["evaluate"] });
    await core.scheduler.evaluate(["a"]);
    const unsent = core.scheduler.status("a")?.unsent;

    expect(unsent).toEqual(expect.any(String));
    expect(parsed(await callTool(tools, "describe_block", { id: "a" }))).toMatchObject({ status: "failed", unsent, conditions: [] });
  });

  test("leaves out a value of the state too long to show, and marks it with get_block_state", async () => {
    const { tools } = await started({ blockrOptions: { assistant_state_value_max_chars: 20 } });

    expect(parsed(await callTool(tools, "describe_block", { id: "d" }))).toMatchObject({
      state: { subset: "[24 chars omitted -- call get_block_state for the full argument values]", select: "" },
    });
  });

  test("cuts its text at assistant_summary_max_chars, the state first, and marks the cut with get_block_state", async () => {
    const { core, tools } = await started({ blockrOptions: { assistant_state_value_max_chars: 5000, assistant_summary_max_chars: "2000" } });
    await core.commands.run("blockr.core-change_block", { id: "d", state: { subset: "Sepal.Width > 3".repeat(200) } });

    const { text } = await callTool(tools, "describe_block", { id: "d" });

    expect(Array.from(text)).toHaveLength(2000);
    expect(text).toMatch(/"links":\[\{"id":"ad","from":"a","input":"data"\}\],"state":\{"subset":"(Sepal\.Width > 3)+/);
    expect(text).toMatch(/\n\.\.\. \[\+\d+ chars truncated -- call get_block_state for the full argument values\]$/);
  });

  test("lists the skills that the model may read and that name the block's class, each description on one line and cut", async () => {
    const skills = [
      skill("subsets", { blocks: ["blockr.test-subset_block"], description: `How this site\n  writes   its subsets: ${"a".repeat(150)}` }),
      skill("hidden", { blocks: ["blockr.test-subset_block"], modelInvocable: false }),
      skill("heads", { blocks: ["blockr.test-head_block"] }),
    ];
    const { tools } = await started({ blockrOptions: { assistant_skill_description_max_chars: 100 } }, skills);

    expect(parsed(await callTool(tools, "describe_block", { id: "d" }))).toMatchObject({
      skills: [{ name: "subsets", description: 'How this site writes its subse\n... [+154 chars truncated -- call read_skill("subsets") for the rest]' }],
    });
    expect(parsed(await callTool(tools, "describe_block", { id: "a" }))).not.toHaveProperty("skills");
  });

  test("answers a block that the board lacks with the tool that lists the blocks", async () => {
    const { tools } = await started();

    await expect(callTool(tools, "describe_block", { id: "z" })).resolves.toEqual({
      text: 'The board holds no block "z". Call list_blocks for the blocks that it holds.',
      isError: true,
      images: [],
    });
  });

  test("fails with the value of a cap that the cap does not take", async () => {
    const { tools } = await started({ blockrOptions: { assistant_summary_max_chars: "many" } });

    await expect(callTool(tools, "describe_block", { id: "d" })).resolves.toMatchObject({
      text: 'The blockr option assistant_summary_max_chars is "many", where it takes a whole number of 0 or more.',
      isError: true,
    });
  });
});

describe("get_block_state", () => {
  test("gives the state in full", async () => {
    const { tools } = await started({ blockrOptions: { assistant_state_value_max_chars: 5 } });

    expect(parsed(await callTool(tools, "get_block_state", { id: "d" }))).toEqual({
      id: "d",
      state: { subset: "log(Sepal.Width - 3) > 0", select: "" },
    });
  });

  test("cuts the state's strings at what is left of assistant_state_max_chars, in order", async () => {
    const { tools } = await started({ blockrOptions: { assistant_state_max_chars: 12 } });

    expect(parsed(await callTool(tools, "get_block_state", { id: "d" }))).toEqual({
      id: "d",
      state: { subset: "\n... [+24 chars truncated]", select: "" },
    });
  });

  test("answers a block that the board lacks with the tool that lists the blocks", async () => {
    const { tools } = await started();

    await expect(callTool(tools, "get_block_state", { id: "z" })).resolves.toMatchObject({ isError: true });
  });
});

describe("get_block_conditions", () => {
  test("gives the conditions by severity, errors first, each with its phase", async () => {
    const { core, tools } = await started({
      evaluate: ({ block }) => (block === "d" ? { status: "error", conditions: [WARNING, ERROR] } : undefined),
    });
    await core.scheduler.evaluate(["d"]);

    expect(parsed(await callTool(tools, "get_block_conditions", { id: "d" }))).toEqual({
      id: "d",
      status: "failed",
      conditions: {
        error: [{ phase: "expr", message: "object 'Sepal.Width' not found" }],
        warning: [{ phase: "expr", message: "NaNs produced" }],
      },
    });
  });

  test("says of a stale block that its conditions come from before its latest change", async () => {
    const { core, tools } = await started({
      evaluate: ({ block }) => (block === "d" ? { status: "error", conditions: [ERROR] } : undefined),
    });
    await core.scheduler.evaluate(["d"]);
    core.scheduler.invalidate("d");

    expect(parsed(await callTool(tools, "get_block_conditions", { id: "d" }))).toEqual({
      id: "d",
      status: "stale",
      note: expect.stringContaining("out of date") as unknown,
      conditions: { error: [{ phase: "expr", message: "object 'Sepal.Width' not found" }] },
    });
  });

  test("gives why the transport could not send the block's latest evaluation, which raised nothing", async () => {
    const { core, tools } = await started({ refuse: ["evaluate"] });
    await core.scheduler.evaluate(["a"]);
    const unsent = core.scheduler.status("a")?.unsent;

    expect(unsent).toEqual(expect.any(String));
    expect(parsed(await callTool(tools, "get_block_conditions", { id: "a" }))).toEqual({ id: "a", status: "failed", unsent, conditions: {} });
  });

  test("gives why the transport could not send the evaluation of a stale block before its latest change", async () => {
    const { core, tools } = await started({ refuse: ["evaluate"] });
    await core.scheduler.evaluate(["a"]);
    core.scheduler.invalidate("a");
    const unsent = core.scheduler.status("a")?.unsent;

    expect(unsent).toEqual(expect.any(String));
    expect(parsed(await callTool(tools, "get_block_conditions", { id: "a" }))).toEqual({
      id: "a",
      status: "stale",
      unsent,
      note: expect.stringContaining("out of date") as unknown,
      conditions: {},
    });
  });
});
