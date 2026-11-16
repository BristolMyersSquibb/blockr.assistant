// The tools that read results through requests that R answers, on
// blockr.core's CoreApi for tests, whose board is that of core's fixture
// hello, and where R answers each request as the test gives.

import type { Condition, CoreApi } from "@blockr/core";
import { describe, expect, test } from "vitest";
import { callTool, skillsHolding, startAssistant } from "../testing/index.ts";
import type { StartOptions } from "../testing/index.ts";
import { readTools } from "./index.ts";

const ERROR: Condition = { severity: "error", class: ["simpleError", "error", "condition"], phase: "expr", message: "object 'Sepal.Width' not found" };

// A PNG as base64, which R writes for each plot.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function started(options: StartOptions = {}) {
  const stub = await startAssistant(options);
  return { ...stub, tools: readTools(stub.core, skillsHolding()) };
}

function sessionEnded(): Error {
  const error = new Error("The session ended before R replied to request 12.");
  error.name = "SessionEndedError";
  return error;
}

describe("get_block_result", () => {
  test("sends describe_result for the block, which core evaluates first, and gives what R writes", async () => {
    const { core, tools, requests } = await started({
      answers: { describe_result: ({ reads }) => Object.fromEntries(reads.map(({ block }) => [block, [`The result of ${block}.`]])) },
    });

    await expect(callTool(tools, "get_block_result", { id: "b" })).resolves.toEqual({ text: "The result of b.", isError: false, images: [] });
    expect(requests("describe_result")).toEqual([{ name: "describe_result", args: {}, reads: [{ block: "b", revision: core.scheduler.status("b")?.revision }] }]);
    expect(core.scheduler.status("b")?.status).toBe("ready");
  });

  test("gives the status of each block that it reads and that is not ready, and sends R nothing", async () => {
    const { tools, requests } = await started({
      evaluate: ({ block }) => (block === "d" ? { status: "error", conditions: [ERROR] } : undefined),
      answers: { describe_result: () => ({}) },
    });

    await expect(callTool(tools, "get_block_result", { id: "d" })).resolves.toEqual({
      text: 'The request did not go to R, since a block that it reads is not ready:\n- Block "d" reads failed: object \'Sepal.Width\' not found',
      isError: true,
      images: [],
    });
    expect(requests("describe_result")).toEqual([]);
  });

  test("says that R lost the request where R's session ended before it answered", async () => {
    const { core } = await started();
    const lost: CoreApi = { ...core, request: () => Promise.reject(sessionEnded()) };

    await expect(callTool(readTools(lost, skillsHolding()), "get_block_result", { id: "b" })).resolves.toEqual({
      text: "R's session ended before R answered, so the request was lost, and core does not send it to the new session. Call the tool again to send it there.",
      isError: true,
      images: [],
    });
  });

  test("answers a block that the board lacks with the tool that lists the blocks, and sends nothing", async () => {
    const { tools, requests } = await started();

    await expect(callTool(tools, "get_block_result", { id: "z" })).resolves.toMatchObject({
      text: 'The board holds no block "z". Call list_blocks for the blocks that it holds.',
      isError: true,
    });
    expect(requests("describe_result")).toEqual([]);
  });
});

describe("inspect_results", () => {
  test("sends the model's code with the blocks that it reads and the size of its plots, and gives what the code printed and drew", async () => {
    const { tools, requests } = await started({ answers: { inspect_results: () => ({ output: ["[1] 150"], plots: [PNG, PNG] }) } });

    await expect(callTool(tools, "inspect_results", { code: "nrow(a)", blocks: ["a"], width: 400 })).resolves.toEqual({
      text: "[1] 150",
      isError: false,
      images: [
        { data: PNG, mimeType: "image/png" },
        { data: PNG, mimeType: "image/png" },
      ],
    });
    expect(requests("inspect_results").map(({ args, reads }) => ({ args, reads: reads.map(({ block }) => block) }))).toEqual([
      { args: { code: "nrow(a)", width: 400 }, reads: ["a"] },
    ]);
  });

  test("gives R's error in the model's code", async () => {
    const { tools } = await started({
      answers: {
        inspect_results: () => {
          throw new Error("object 'x' not found");
        },
      },
    });

    await expect(callTool(tools, "inspect_results", { code: "x", blocks: [] })).resolves.toEqual({
      text: "object 'x' not found",
      isError: true,
      images: [],
    });
  });

  test("refuses on a locked board before core evaluates any block that it reads", async () => {
    const { tools, sent, settled } = await started({ locked: true, answers: { inspect_results: () => ({ output: [""], plots: [] }) } });
    await settled();
    const before = sent.length;

    await expect(callTool(tools, "inspect_results", { code: "nrow(f)", blocks: ["f"] })).resolves.toEqual({
      text: "The board is locked, so the assistant runs no R code of its own.",
      isError: true,
      images: [],
    });
    await settled();
    expect(sent.slice(before)).toEqual([]);
  });

  test("answers blocks that the board lacks with the tool that lists the blocks", async () => {
    const { tools } = await started();

    await expect(callTool(tools, "inspect_results", { code: "x", blocks: ["a", "y", "z"] })).resolves.toMatchObject({
      text: 'The board holds no blocks "y", "z". Call list_blocks for the blocks that it holds.',
      isError: true,
    });
  });

  test("rejects with the signal's reason where the user stops the turn", async () => {
    const { tools } = await started({ answers: { inspect_results: () => new Promise(() => undefined) } });
    const turn = new AbortController();

    const called = callTool(tools, "inspect_results", { code: "1", blocks: [] }, turn.signal);
    turn.abort(new Error("The user stopped the turn."));

    await expect(called).rejects.toThrow("The user stopped the turn.");
  });
});
