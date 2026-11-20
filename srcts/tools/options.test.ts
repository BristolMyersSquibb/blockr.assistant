// The tool list_board_options, on blockr.core's CoreApi for tests, where a
// test package defines the board option page_size, which nothing on the page
// uses, and the board option decimals, which the board holds, beside the board
// options of core.

import { describe, expect, test } from "vitest";
import { callTool, parsed, skillsHolding, startAssistant } from "../testing/index.ts";
import { readTools } from "./index.ts";

const PAGE_SIZE = {
  label: "Page size",
  category: "Table",
  schema: { type: "integer", minimum: 1 },
  default: 25,
  ui: { render: () => () => undefined },
};

const DECIMALS = {
  label: "Decimals",
  category: "Table",
  schema: { type: "integer", minimum: 0 },
  default: 3,
  ui: { render: () => () => undefined },
};

describe("list_board_options", () => {
  test("gives every board option that a package defines, with the value of each that the board holds", async () => {
    const { core } = await startAssistant({ options: { page_size: PAGE_SIZE, decimals: DECIMALS }, board: { options: { decimals: 2 } } });
    const tools = readTools(core, skillsHolding());

    const listed = parsed(await callTool(tools, "list_board_options")) as { id: string }[];

    expect(listed.map(({ id }) => id)).toEqual(Object.keys(core.options.registered()));
    expect(listed).toContainEqual({ id: "decimals", label: "Decimals", category: "Table", schema: { type: "integer", minimum: 0 }, value: 2 });
    expect(listed).toContainEqual({ id: "page_size", label: "Page size", category: "Table", schema: { type: "integer", minimum: 1 } });
  });
});
