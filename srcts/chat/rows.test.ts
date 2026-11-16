// How the chat lays out a reply's parts (./rows.ts).

import { describe, expect, test } from "vitest";
import { segmentsOf, toolTitle } from "./rows.ts";

const call = (id: string, tool: string, result?: string, isError = false) => ({
  type: "tool-call",
  toolCallId: id,
  toolName: tool,
  args: {},
  ...(result === undefined ? {} : { result: { text: result, images: [], count: 0 }, isError }),
});

describe("the pieces of a reply", () => {
  test("give each run of tool calls with no text between them one row for each tool, in the order the run first called it", () => {
    const segments = segmentsOf([call("1", "list_blocks"), call("2", "list_links"), call("3", "list_blocks"), { type: "text", text: "Two blocks." }, call("4", "list_blocks")]);

    expect(segments.map((segment) => (segment.kind === "tools" ? segment.rows.map((row) => [row.tool, row.calls.map((c) => c.id)]) : segment.kind))).toEqual([
      [
        ["list_blocks", ["1", "3"]],
        ["list_links", ["2"]],
      ],
      "text",
      [["list_blocks", ["4"]]],
    ]);
  });

  test("end a run at the model's reasoning, as at text", () => {
    const segments = segmentsOf([call("1", "list_blocks"), { type: "reasoning", text: "Hmm." }, call("2", "list_blocks")]);

    expect(segments.map((segment) => segment.kind)).toEqual(["tools", "reasoning", "tools"]);
    expect(segments[1]).toEqual({ kind: "reasoning", index: 1 });
  });

  test("give each call its result, and why the turn failed where it ended", () => {
    const segments = segmentsOf([call("1", "describe_block", "No block x.", true), call("2", "list_blocks"), { type: "data", name: "failure", data: "The call failed." }]);

    expect(segments[0]).toEqual({
      kind: "tools",
      rows: [
        { tool: "describe_block", calls: [{ id: "1", tool: "describe_block", args: {}, result: { text: "No block x.", images: [], count: 0 }, error: true }] },
        { tool: "list_blocks", calls: [{ id: "2", tool: "list_blocks", args: {}, result: undefined, error: false }] },
      ],
    });
    expect(segments[1]).toEqual({ kind: "failure", text: "The call failed." });
  });
});

describe("the title of a tool's row", () => {
  test("is the tool's name in sentence case", () => {
    expect(["list_blocks", "edit", "undo_edit", "inspect_results"].map(toolTitle)).toEqual(["List blocks", "Edit", "Undo edit", "Inspect results"]);
  });
});
