// The tool list_board_options, on blockr.core's CoreApi for tests, where core
// defines the board options n_rows, show_conditions and dark_mode, which the
// board holds, and a test package defines the board option page_size, which
// nothing on the page uses.

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

describe("list_board_options", () => {
  test("gives every board option that a package defines, with the value of each that the board holds", async () => {
    const { core } = await startAssistant({ options: { page_size: PAGE_SIZE } });
    const tools = readTools(core, skillsHolding());
    const registered = core.options.registered();

    const listed = parsed(await callTool(tools, "list_board_options")) as { id: string }[];

    expect(listed.map(({ id }) => id)).toEqual(Object.keys(registered));
    expect(listed).toContainEqual({
      id: "n_rows",
      label: registered.n_rows?.label,
      category: registered.n_rows?.category,
      schema: registered.n_rows?.schema,
      value: 50,
    });
    expect(listed).toContainEqual(expect.objectContaining({ id: "show_conditions", value: ["warning", "error"] }));
    expect(listed).toContainEqual({ id: "page_size", label: "Page size", category: "Table", schema: { type: "integer", minimum: 1 } });
  });
});
