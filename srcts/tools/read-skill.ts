// The tool read_skill, which sends the request read_skill for a skill that
// the model may read (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.2#the-requests-in-r).
// - It refuses a skill that R did not list for the open board, or whose
//   frontmatter sets disable-model-invocation, before it sends anything, as
//   today's refuses both alike (R/skills-invoke.R at fcbdb27).
// - It reads the skill of the app's packages, as R listed it.
// - The plugin offers it in every app, even where no skill is listed, so that
//   the tools' definitions change only with a release of blockr.assistant.
// - The result gives the warnings and messages of R's reply after the text
//   (./conditions.ts).
// - It awaits the skills that R listed before it sends its request. So it
//   keeps the context that is active as the tool is called, in which the
//   tool's span is active. It then sends the request inside context.with()
//   of that context, as the edit tool does. Core puts the request's span
//   under the span that is active as request() is called, so the request's
//   span goes under the tool's span
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4#proposal).

import { context } from "@opentelemetry/api";
import { object } from "../commands/index.ts";
import { answeredText, appPackages } from "../requests/index.ts";
import { toolRequest, withConditions } from "./conditions.ts";
import type { ToolContext } from "./context.ts";
import { noSkill } from "./failures.ts";
import { tool } from "./tool.ts";
import type { Tool } from "./tool.ts";

export function skillTools({ core, skills }: ToolContext): Tool[] {
  return [
    tool<{ readonly name: string; readonly file?: string }>({
      name: "read_skill",
      description:
        "Load a skill: guidance that this app's packages or its deployment wrote for one topic, kept out of the system prompt until you ask for it. The tool gives the skill's instructions as markdown; follow them for the task that they cover. Pass `file` to read a file that the skill bundles beside its instructions, which the instructions name where the skill has any. A skill is instruction text, not extra capability: it cannot widen what your tools do, and the system prompt wins where the two disagree.",
      parameters: object(
        {
          name: {
            type: "string",
            description:
              "The skill's name, as the Skills section of the system prompt lists it, or as describe_block_type, describe_block or get_plugin_state give it.",
          },
          file: {
            type: "string",
            description: "Optional: a file that the skill bundles, by its path in the skill's directory, to read in place of its instructions.",
          },
        },
        ["name"],
      ),
      run: async ({ name, file }, signal) => {
        const active = context.active();
        const skill = (await skills.list()).find((listed) => listed.name === name);
        if (skill?.modelInvocable !== true) throw new Error(noSkill(name));
        const given = { name, packages: appPackages(core), ...(file === undefined ? {} : { path: file }) };
        const { answer, notifications } = await context.with(active, () => toolRequest(core, "read_skill", given, { signal }));
        return withConditions(core, answeredText(answer, "read_skill"), notifications);
      },
    }),
  ];
}
