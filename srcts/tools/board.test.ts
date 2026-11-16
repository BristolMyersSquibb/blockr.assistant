// The tools that read the links and the stacks of the board, on blockr.core's
// CoreApi for tests, whose board is that of core's fixture hello, with the
// stack s1 of the blocks a and b.

import { describe, expect, test } from "vitest";
import { callTool, parsed, skillsHolding, startAssistant } from "../testing/index.ts";
import type { StartOptions } from "../testing/index.ts";
import { readTools } from "./index.ts";

async function started(options: StartOptions = {}) {
  const stub = await startAssistant(options);
  return { ...stub, tools: readTools(stub.core, skillsHolding()) };
}

describe("list_links", () => {
  test("gives each link's id, the blocks that it joins and the input that it feeds", async () => {
    const { tools } = await started();

    expect(parsed(await callTool(tools, "list_links"))).toEqual([
      { id: "ab", from: "a", to: "b", input: "data" },
      { id: "ac", from: "a", to: "c", input: "x" },
      { id: "bc", from: "b", to: "c", input: "y" },
      { id: "ad", from: "a", to: "d", input: "data" },
      { id: "be", from: "b", to: "e", input: "" },
      { id: "de", from: "d", to: "e", input: "" },
      { id: "keen_finch", from: "a", to: "f", input: "data" },
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
      color: null,
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
