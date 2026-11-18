// The tools that read the block registry, on blockr.core's CoreApi for tests,
// whose registry holds core's block classes.

import { describe, expect, test } from "vitest";
import { callTool, parsed, skill, skillsHolding, startAssistant } from "../testing/index.ts";
import type { StartOptions } from "../testing/index.ts";
import type { Skill } from "../skills/index.ts";
import { readTools } from "./index.ts";

async function started(options: StartOptions = {}, skills: readonly Skill[] = []) {
  const stub = await startAssistant(options);
  return { ...stub, tools: readTools(stub.core, skillsHolding(...skills)) };
}

describe("list_block_types", () => {
  test("gives each block class's registry id, name, category, data inputs and description", async () => {
    const { tools } = await started();

    const listed = parsed(await callTool(tools, "list_block_types"));

    expect(listed).toHaveLength(7);
    expect(listed).toContainEqual({
      id: "blockr.core-head_block",
      name: "head/tail block",
      category: "transform",
      inputs: ["data"],
      description: "Data head/tail",
    });
    expect(listed).toContainEqual(expect.objectContaining({ id: "blockr.core-rbind_block", inputs: ["..."] }));
    expect(listed).toContainEqual(expect.objectContaining({ id: "blockr.core-dataset_block", inputs: [] }));
  });

  test("cuts each description at assistant_description_max_chars, pointing at describe_block_type", async () => {
    const { tools } = await started({ blockrOptions: { assistant_description_max_chars: 10 } });

    expect(parsed(await callTool(tools, "list_block_types"))).toContainEqual(
      expect.objectContaining({
        id: "blockr.core-head_block",
        description: "\n... [+14 chars truncated -- call describe_block_type for the full description]",
      }),
    );
  });
});

describe("describe_block_type", () => {
  test("gives the class in full, with the schema of its state and the skills that name it", async () => {
    const skills = [skill("heads", { blocks: ["blockr.core-head_block"] }), skill("subsets", { blocks: ["blockr.core-subset_block"] })];
    const { core, tools } = await started({}, skills);
    const entry = core.blockRegistry()["blockr.core-head_block"];

    expect(parsed(await callTool(tools, "describe_block_type", { id: "blockr.core-head_block" }))).toEqual({
      id: "blockr.core-head_block",
      name: "head/tail block",
      category: "transform",
      description: "Data head/tail",
      guidance: entry?.guidance,
      inputs: ["data"],
      schema: entry?.schema,
      skills: [{ name: "heads", description: "What heads covers." }],
    });
  });

  test("answers a class that the app does not offer with the tool that lists those that it offers", async () => {
    const { tools } = await started();

    await expect(callTool(tools, "describe_block_type", { id: "head_block" })).resolves.toEqual({
      text: 'The app offers no block class "head_block". Call list_block_types for those that it offers.',
      isError: true,
      images: [],
    });
  });
});
