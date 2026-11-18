// The tools that read the block registry: list_block_types and
// describe_block_type
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.2#the-tools).
// The registry's entries give each block class's data inputs and the JSON
// Schema of its state without building a block. The schema gives each state
// arg's type, and its description where the class writes one.
// - The tool list_block_types cuts each description at
//   assistant_description_max_chars, as today's does (R/tools-read.R at
//   fcbdb27), and points at describe_block_type for the rest.
// - The tool describe_block_type cuts nothing. It gives the guidance in full,
//   where a class writes its worked examples, and no worked examples of its
//   own.

import type { Json } from "@blockr/core";
import { object } from "../commands/index.ts";
import { readToolCap } from "./caps.ts";
import { own, skillsNaming } from "./context.ts";
import type { ToolContext } from "./context.ts";
import { cutText } from "./cut.ts";
import { noBlockType } from "./failures.ts";
import { json, tool } from "./tool.ts";
import type { Tool } from "./tool.ts";

export function blockTypeTools(context: ToolContext): Tool[] {
  const { core } = context;

  return [
    tool<Record<string, never>>({
      name: "list_block_types",
      description:
        'List every block class that the app offers, the types that a block can have, each with its registry id, its name, its category, its data inputs and its description. Call describe_block_type for one class\'s guidance and the JSON Schema of its state before you add a block of it. The inputs are the names that a link into such a block takes as its input: a class with none takes no link, and one whose inputs are ["..."] takes any number of links.',
      parameters: object({}, []),
      run: async () => {
        const max = await readToolCap(core, "assistant_description_max_chars");
        return json(
          Object.values(core.blockRegistry()).map((entry) => ({
            id: entry.id,
            name: entry.name,
            category: entry.category,
            inputs: [...entry.inputs],
            description: cutText(entry.description, max, "call describe_block_type for the full description"),
          })),
        );
      },
    }),

    tool<{ readonly id: string }>({
      name: "describe_block_type",
      description:
        "Describe one block class in full: its name, its category, its description and guidance, its data inputs, the JSON Schema that a block's state has to fit and the skills of this deployment that name the class. The schema gives the type and the description of each argument of a block's state. A skill named here is more specific than the guidance and wins where the two differ; load one with read_skill.",
      parameters: object({ id: { type: "string", description: "The registry id of the block class, as list_block_types gives it." } }, ["id"]),
      run: async ({ id }) => {
        if (own(core.blockRegistry(), id) === undefined) throw new Error(noBlockType(id));
        const skills = await skillsNaming(context, "blocks", id);
        const entry = own(core.blockRegistry(), id);
        if (entry === undefined) throw new Error(noBlockType(id));
        const described: Record<string, Json> = {
          id,
          name: entry.name,
          category: entry.category,
          description: entry.description,
          ...(entry.guidance === undefined ? {} : { guidance: entry.guidance }),
          inputs: [...entry.inputs],
          schema: entry.schema,
          ...(skills.length === 0 ? {} : { skills }),
        };
        return json(described);
      },
    }),
  ];
}
