// The tools that read the links and the stacks of the board, on blockr.core's
// CoreApi for tests, on a board of a test package's block classes: a data
// block a, which feeds the head block b, and the bind block c of a and b,
// with the stack s1 of a and b.

import type { Board } from "@blockr/core";
import { id } from "@blockr/core/stubs";
import { describe, expect, test } from "vitest";
import { blockClass, callTool, parsed, skillsHolding, startAssistant } from "../testing/index.ts";
import type { StartOptions } from "../testing/index.ts";
import { readTools } from "./index.ts";

const DATA = blockClass("data_block", { category: "input" });
const HEAD = blockClass("head_block", { inputs: ["data"] });
const BIND = blockClass("bind_block", { inputs: ["..."] });

const BOARD = {
  blocks: {
    a: { registry_id: id("blockr.test", "data_block"), state: {}, name: "Iris", locked: null },
    b: { registry_id: id("blockr.test", "head_block"), state: {}, name: "Head", locked: null },
    c: { registry_id: id("blockr.test", "bind_block"), state: {}, name: "Bind", locked: null },
  },
  links: {
    ab: { from: "a", to: "b", input: "data" },
    ac: { from: "a", to: "c", input: "" },
    bc: { from: "b", to: "c", input: "" },
  },
  stacks: { s1: { name: "Input", blocks: ["a", "b"], color: "#66c2a5" } },
} satisfies Partial<Board>;

async function started(options: StartOptions = {}) {
  const stub = await startAssistant({ blockClasses: [DATA, HEAD, BIND], board: BOARD, ...options });
  return { ...stub, tools: readTools(stub.core, skillsHolding()) };
}

describe("list_links", () => {
  test("gives each link's id, the blocks that it joins and the input that it feeds", async () => {
    const { tools } = await started();

    expect(parsed(await callTool(tools, "list_links"))).toEqual([
      { id: "ab", from: "a", to: "b", input: "data" },
      { id: "ac", from: "a", to: "c", input: "" },
      { id: "bc", from: "b", to: "c", input: "" },
    ]);
  });
});

describe("list_stacks", () => {
  test("gives each stack's id, name and blocks", async () => {
    const { tools } = await started();

    expect(parsed(await callTool(tools, "list_stacks"))).toEqual([{ id: "s1", name: "Input", blocks: ["a", "b"] }]);
  });
});

describe("describe_stack", () => {
  test("gives the stack's name and color, and its blocks with their names and statuses", async () => {
    const { core, tools } = await started();
    await core.scheduler.evaluate(["a"]);

    expect(parsed(await callTool(tools, "describe_stack", { id: "s1" }))).toEqual({
      id: "s1",
      name: "Input",
      color: "#66c2a5",
      blocks: [
        { id: "a", name: "Iris", status: "ready" },
        { id: "b", name: "Head", status: "unevaluated" },
      ],
    });
  });

  test("cuts its text at assistant_summary_max_chars, pointing at list_stacks", async () => {
    const { tools } = await started({ blockrOptions: { assistant_summary_max_chars: 120 } });

    const { text } = await callTool(tools, "describe_stack", { id: "s1" });

    expect(Array.from(text)).toHaveLength(120);
    expect(text).toMatch(/^\{"id":"s1","name":"Input",.*\n\.\.\. \[\+\d+ chars truncated -- call list_stacks for every block of the stack\]$/s);
  });

  test("answers a stack that the board lacks with the tool that lists the stacks", async () => {
    const { tools } = await started();

    await expect(callTool(tools, "describe_stack", { id: "s9" })).resolves.toEqual({
      text: 'The board holds no stack "s9". Call list_stacks for the stacks that it holds.',
      isError: true,
      images: [],
    });
  });
});
