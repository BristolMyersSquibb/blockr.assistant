// The tools that read the block registry, on blockr.core's CoreApi for tests,
// whose registry holds core's block classes and those of a test package: a
// head block, a bind block of any number of data inputs, and a data block,
// which takes none.

import { id } from "@blockr/core/stubs";
import { describe, expect, test } from "vitest";
import { blockClass, callTool, parsed, skill, skillsHolding, startAssistant } from "../testing/index.ts";
import type { StartOptions } from "../testing/index.ts";
import type { Skill } from "../skills/index.ts";
import { readTools } from "./index.ts";

const HEAD = blockClass("head_block", {
  name: "head block",
  description: "Keeps the first rows",
  guidance: "Keeps the first `n` rows of its input.",
  inputs: ["data"],
  schema: { type: "object", properties: { n: { type: "integer", description: "Number of rows to keep." } }, required: ["n"] },
});
const BIND = blockClass("bind_block", { inputs: ["..."] });
const DATA = blockClass("data_block", { category: "input" });

async function started(options: StartOptions = {}, skills: readonly Skill[] = []) {
  const stub = await startAssistant({ blockClasses: [HEAD, BIND, DATA], ...options });
  return { ...stub, tools: readTools(stub.core, skillsHolding(...skills)) };
}

describe("list_block_types", () => {
  test("gives each block class's registry id, as a record of its package and its id, and its name, category, data inputs and description", async () => {
    const { core, tools } = await started();

    const listed = parsed(await callTool(tools, "list_block_types")) as { id: { package: string | null; id: string } }[];

    expect(listed.map(({ id }) => id)).toEqual([...core.blockRegistry().keys()].map((key) => ({ package: key.package, id: key.id })));
    expect(listed).toContainEqual({
      id: { package: "blockr.test", id: "head_block" },
      name: "head block",
      category: "transform",
      inputs: ["data"],
      description: "Keeps the first rows",
    });
    expect(listed).toContainEqual(expect.objectContaining({ id: { package: "blockr.test", id: "bind_block" }, inputs: ["..."] }));
    expect(listed).toContainEqual(expect.objectContaining({ id: { package: "blockr.test", id: "data_block" }, inputs: [] }));
  });

  test("cuts each description at assistant_description_max_chars, pointing at describe_block_type", async () => {
    const { tools } = await started({ blockrOptions: { assistant_description_max_chars: 10 } });

    expect(parsed(await callTool(tools, "list_block_types"))).toContainEqual(
      expect.objectContaining({
        id: { package: "blockr.test", id: "head_block" },
        description: "\n... [+20 chars truncated -- call describe_block_type for the full description]",
      }),
    );
  });
});

describe("describe_block_type", () => {
  test("gives the class in full, with the schema of its state and the skills that name it", async () => {
    const skills = [skill("heads", { blocks: [id("blockr.test", "head_block")] }), skill("binds", { blocks: [id("blockr.test", "bind_block")] })];
    const { tools } = await started({}, skills);

    expect(parsed(await callTool(tools, "describe_block_type", { id: { package: "blockr.test", id: "head_block" } }))).toEqual({
      id: { package: "blockr.test", id: "head_block" },
      name: "head block",
      category: "transform",
      description: "Keeps the first rows",
      guidance: "Keeps the first `n` rows of its input.",
      inputs: ["data"],
      schema: HEAD.schema,
      skills: [{ name: "heads", description: "What heads covers." }],
    });
  });

  test("answers a class that the app does not offer, or whose id core refuses, with the tool that lists those that it offers", async () => {
    const { tools } = await started();

    for (const [given, named] of [
      [{ package: null, id: "head_block" }, "head_block"],
      [{ package: "not a package", id: "head_block" }, "not a package::head_block"],
    ] as const) {
      await expect(callTool(tools, "describe_block_type", { id: given })).resolves.toEqual({
        text: `The app offers no block class "${named}". Call list_block_types for those that it offers.`,
        isError: true,
        images: [],
      });
    }
  });
});
