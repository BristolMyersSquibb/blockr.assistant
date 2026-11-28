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
// - They give each class's registry id as JSON holds it, a record of the
//   package that defines the class and the class's id within it, and
//   describe_block_type takes the id in that form. The package is null for a
//   class that the app's script defines.

import type { Json } from "@blockr/core";
import { object } from "../commands/index.ts";
import { idOf, idRecord, idSchema } from "../ids/index.ts";
import type { IdRecord } from "../ids/index.ts";
import { readToolCap } from "./caps.ts";
import { skillsNaming } from "./context.ts";
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
          [...core.blockRegistry()].map(([id, entry]) => ({
            id: idRecord(id),
            name: entry.name,
            category: entry.category,
            inputs: [...entry.inputs],
            description: cutText(entry.description, max, "call describe_block_type for the full description"),
          })),
        );
      },
    }),

    tool<{ readonly id: IdRecord<string | null> }>({
      name: "describe_block_type",
      description:
        "Describe one block class in full: its name, its category, its description and guidance, its data inputs, the JSON Schema that a block's state has to fit and the skills that name the class. The schema gives the type and the description of each argument of a block's state. A skill named here is more specific than the guidance and wins where the two differ; load one with read_skill.",
      parameters: object({ id: idSchema("The registry id of the block class, as list_block_types gives it.", true) }, ["id"]),
      run: async ({ id: given }) => {
        const id = idOf(core, given);
        if (id === undefined || !core.blockRegistry().has(id)) throw new Error(noBlockType(given));
        const skills = await skillsNaming(context, "blocks", id);
        const entry = core.blockRegistry().get(id);
        if (entry === undefined) throw new Error(noBlockType(given));
        const described: Record<string, Json> = {
          id: idRecord(id),
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
