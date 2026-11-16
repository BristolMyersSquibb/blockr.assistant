// What the tools read: core's API, and the skills of the open board.

import type { CoreApi, Json } from "@blockr/core";
import type { Skills } from "../skills/index.ts";
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

// The skills that the model may read and that name the class `id`, a block
// class in their `blocks` or a plugin class in their `plugins`, each with its
// name and its description, cut at assistant_skill_description_max_chars, as
// today's tools list them (R/skills-render.R at fcbdb27).
export async function skillsNaming(context: ToolContext, kind: "blocks" | "plugins", id: string): Promise<Json[]> {
  const [listed, max] = await Promise.all([context.skills.list(), readToolCap(context.core, "assistant_skill_description_max_chars")]);
  return listed
    .filter((skill) => skill.modelInvocable && skill[kind].includes(id))
    .map((skill) => ({ name: skill.name, description: skillBlurb(skill.name, skill.description, max) }));
}
