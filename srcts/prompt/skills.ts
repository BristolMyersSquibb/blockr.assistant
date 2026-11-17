// The Skills section, which the system prompt holds after the template and
// the rules, whatever the template holds, so that a package's skills, such as
// the dock's layout, reach the model in every app that uses the package
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.5#the-sections).
// It lists each skill that the model may read and that names no block class
// or plugin class, by its name and its description, in the order of R's list,
// under today's preamble (R/skills-render.R at fcbdb27). Each description is
// cut at assistant_skill_description_max_chars, while the list is not cut.
// Where no skill qualifies, the system prompt has no Skills section, as
// today's has none.

import type { Skill } from "../skills/index.ts";
import { skillBlurb } from "../tools/index.ts";
import preamble from "./skills-preamble.md" with { type: "text" };

// The Skills section of the skills given, each description cut at `max`
// characters, or undefined where none qualifies.
export function skillsSection(skills: readonly Skill[], max: number): string | undefined {
  const listed = skills.filter((skill) => skill.modelInvocable && skill.blocks.length === 0 && skill.plugins.length === 0);
  if (listed.length === 0) return undefined;
  return ["## Skills", preamble.trim(), "", ...listed.map((skill) => `- \`${skill.name}\`: ${skillBlurb(skill.name, skill.description, max)}`)].join("\n");
}
