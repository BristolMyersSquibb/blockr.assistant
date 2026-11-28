// What the tools read: core's API, and the skills of the open board.

import type { CommandId, CoreApi, Id, Json } from "@blockr/core";
import { assistantCommands } from "../commands/index.ts";
import type { Skills } from "../skills/index.ts";
import { PACKAGE } from "../state/index.ts";
import { readToolCap } from "./caps.ts";
import { skillBlurb } from "./cut.ts";

export interface ToolContext {
  readonly core: CoreApi;
  readonly skills: Skills;
}

// The value that the record holds under the key as its own, or undefined.
export function own<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

// The ids of the assistant's own commands, as core gives them, which the
// tools leave out and the edit tool refuses, since only the assistant's chat
// and loop change its conversations.
export function assistantCommandIds(core: Pick<CoreApi, "id">): ReadonlySet<CommandId> {
  return new Set(assistantCommands.map((command) => core.id(PACKAGE, command.id)));
}

// The skills that the model may read and that name the class `id`, a block
// class in their `blocks` or a plugin class in their `plugins`, each with its
// name and its description, cut at assistant_skill_description_max_chars, as
// today's tools list them (R/skills-render.R at fcbdb27). Core gives the same
// Id for the same pair, so includes() finds the class among those that a
// skill names.
export async function skillsNaming(context: ToolContext, kind: "blocks" | "plugins", id: Id<string | null>): Promise<Json[]> {
  const [listed, max] = await Promise.all([context.skills.list(), readToolCap(context.core, "assistant_skill_description_max_chars")]);
  return listed
    .filter((skill) => skill.modelInvocable && (skill[kind] as readonly Id<string | null>[]).includes(id))
    .map((skill) => ({ name: skill.name, description: skillBlurb(skill.name, skill.description, max) }));
}
