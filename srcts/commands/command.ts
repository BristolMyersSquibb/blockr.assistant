// A command of the assistant's, as core registers it.

import type { Board, Command, Delta, Json, JsonSchema } from "@blockr/core";

// A command of the assistant's, whose args are an A, as its schema has them.
export interface AssistantCommand<A> {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly args: JsonSchema;
  preflight(board: Board, args: A): boolean;
  run(board: Board, args: A): Delta;
}

// The command as core registers it, with `undo: false`, which every command
// of the assistant's has, so that none takes an undo step.
// The command registry hands preflight() and run() only args that the
// command's schema takes, so they read them as an A, which TypeScript cannot
// take for a Json where it has optional properties.
// The object names each member of core's Command itself, rather than casting
// the definition to one, so that type-checking fails where core renames a
// member, rather than core skipping a check that the command still defines
// under the old name.
export function command<A>(definition: AssistantCommand<A>): Command<Json, unknown> {
  return {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    args: definition.args,
    undo: false,
    preflight: (board, args) => definition.preflight(board, args as unknown as A),
    run: (board, args) => definition.run(board, args as A),
  };
}
