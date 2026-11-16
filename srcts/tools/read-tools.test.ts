// The list of the assistant's read tools, on blockr.core's CoreApi for tests.

import { describe, expect, test } from "vitest";
import { skillsHolding, startAssistant } from "../testing/index.ts";
import { readTools } from "./index.ts";

describe("readTools", () => {
  test("offers the read tools of the page by today's names, and pi runs the calls of each at once", async () => {
    const { core } = await startAssistant();

    const tools = readTools(core, skillsHolding());

    expect(tools.map(({ name }) => name)).toEqual([
      "list_blocks",
      "describe_block",
      "get_block_state",
      "get_block_conditions",
      "list_links",
      "list_stacks",
      "describe_stack",
      "list_block_types",
      "describe_block_type",
      "list_commands",
      "describe_command",
      "list_plugins",
      "get_plugin_state",
      "list_board_options",
      "get_block_result",
      "inspect_results",
      "read_skill",
    ]);
    expect(new Set(tools.map(({ executionMode }) => executionMode))).toEqual(new Set(["parallel"]));
  });

  test("gives each tool a description and the schema of an object of args, which takes no others", async () => {
    const { core } = await startAssistant();

    for (const { description, parameters } of readTools(core, skillsHolding())) {
      expect(description).not.toBe("");
      expect(parameters).toMatchObject({ type: "object", additionalProperties: false });
    }
  });
});
