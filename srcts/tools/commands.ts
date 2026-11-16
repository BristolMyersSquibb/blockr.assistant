// The tools that read the command registry: list_commands and
// describe_command, which follow list_block_types and describe_block_type
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.2#the-tools).
// - They leave out the assistant's own commands, since only the assistant's
//   chat and loop change its conversations.
// - The tool list_commands cuts each description at
//   assistant_description_max_chars, as list_block_types does, and points at
//   describe_command for the rest. A command without a description is listed
//   with its label.
// - The tool describe_command cuts nothing, as describe_block_type cuts
//   nothing.

import type { Command, Json } from "@blockr/core";
import { assistantCommands, object } from "../commands/index.ts";
import { readToolCap } from "./caps.ts";
import { own } from "./context.ts";
import type { ToolContext } from "./context.ts";
import { cutText } from "./cut.ts";
import { noCommand } from "./failures.ts";
import { json, tool } from "./tool.ts";
import type { Tool } from "./tool.ts";

const OWN = new Set(assistantCommands.map((command) => command.id));

export function commandTools({ core }: ToolContext): Tool[] {
  // The commands that the model may run, by id.
  const offered = (): Command<Json, unknown>[] => Object.values(core.commands.registered()).filter((command) => !OWN.has(command.id));

  return [
    tool<Record<string, never>>({
      name: "list_commands",
      description:
        "List every command that the app registers, through which the board and its plugins change, each with its id and its description, which says what the command does and when to use it. Call describe_command for one command's full description and the JSON Schema of its args.",
      parameters: object({}, []),
      run: async () => {
        const max = await readToolCap(core, "assistant_description_max_chars");
        return json(
          offered().map((command) => ({
            id: command.id,
            description: cutText(command.description ?? command.label, max, "call describe_command for the full description"),
          })),
        );
      },
    }),

    tool<{ readonly id: string }>({
      name: "describe_command",
      description:
        "Describe one command in full: its label, its description, the JSON Schema of its args, with a description of each arg, and `undo`, which is false where the command takes no undo step.",
      parameters: object({ id: { type: "string", description: "The command's id, as list_commands gives it." } }, ["id"]),
      run: ({ id }) => {
        const command = OWN.has(id) ? undefined : own(core.commands.registered(), id);
        if (command === undefined) throw new Error(noCommand(id));
        return Promise.resolve(
          json({
            id,
            label: command.label,
            ...(command.description === undefined ? {} : { description: command.description }),
            args: command.args ?? null,
            undo: command.undo !== false,
          }),
        );
      },
    }),
  ];
}
