// The template of the system prompt: blockr.assistant's own, or a deployment's
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.5#what-a-deployment-adds).
// The template holds what is a matter of taste, which a deployment may want
// otherwise: who the assistant is, whether it builds or asks first, and how it
// answers. What describes the board and the assistant's tools is the same in
// every deployment, so the plugin sends it after the template, whatever the
// template holds (./prompt.ts).
// - The template of blockr.assistant, ./template.md, sets out its sections,
//   each as <<id>> on a line of its own, in the order in which the model reads
//   them.
//   The text of each section lives beside the template, as ./role.md holds
//   the section role.
// - A deployment's template is one Markdown file, which the blockr option
//   assistant_template names. Each <<id>> in it puts in blockr.assistant's
//   section of that id. So the file keeps a section by naming it, moves the
//   sections by the order in which it names them, leaves one out by not
//   naming it, and adds text of its own around them.
//
// The template of the open board, which the class's start reads as each board
// opens, as the skills are listed, through requestOnOpen() (../requests):
// 1. It sends the request read_template once.
// 2. Where R answers with no text, since the option names no file, the board
//    takes blockr.assistant's template.
// 3. Where R cannot read the file, or the file names an id that is no section
//    of blockr.assistant's template, it raises the error
//    assistant_template_failed, and the board takes blockr.assistant's
//    template until the next board opens
//    (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#what-fails).
// 4. Where R's session ends before R replies, it asks again.

import type { CoreApi } from "@blockr/core";
import { answeredText, requestOnOpen } from "../requests/index.ts";
import build from "./build.md" with { type: "text" };
import role from "./role.md" with { type: "text" };
import style from "./style.md" with { type: "text" };
import template from "./template.md" with { type: "text" };

// The text of each section of blockr.assistant's template, by the section's
// id, in the order of the template.
export const SECTIONS: ReadonlyMap<string, string> = new Map([
  ["role", role],
  ["build", build],
  ["style", style],
]);

// The template of blockr.assistant, as ./template.md sets it out.
export const TEMPLATE: string = template;

// What names a section: its id between << and >>.
const NAMED = /<<([A-Za-z0-9_-]+)>>/g;

// The ids of the sections that the plugin writes itself, which today's
// template named in its last line.
const WRITTEN = new Set(["skills", "board", "focus"]);

export interface Template {
  // Resolves with the template of the open board, its sections put in. It
  // never rejects.
  text(): Promise<string>;
}

// What of CoreApi the template reads.
interface Core {
  readonly request: CoreApi["request"];
  readonly notifications: Pick<CoreApi["notifications"], "notify">;
}

export function createTemplate(core: Core, signal: AbortSignal): Template {
  const read = readTemplate(core, signal);
  return { text: () => read };
}

// The template given, with the text of blockr.assistant's section of each id
// that it names put in place of the id, and no white space at its ends. It
// throws where the template names an id that is no section of
// blockr.assistant's template.
export function fillTemplate(given: string): string {
  const unknown = [...new Set(Array.from(given.matchAll(NAMED), ([, id]) => id ?? ""))].filter((id) => !SECTIONS.has(id));
  if (unknown.length > 0) throw new Error(unknownSections(unknown));
  return given.replace(NAMED, (_, id: string) => (SECTIONS.get(id) ?? "").trim()).trim();
}

function readTemplate(core: Core, signal: AbortSignal): Promise<string> {
  const own = fillTemplate(TEMPLATE);
  return requestOnOpen(core, signal, "read_template", {}, {
    read: (answer) => (answer === null ? own : fillTemplate(answeredText(answer, "read_template"))),
    fallback: own,
    code: "assistant_template_failed",
    message: (why) => `The assistant uses its own template: ${why}`,
  });
}

// Why a deployment's template fails, which names the ids given.
function unknownSections(ids: readonly string[]): string {
  const named = listed(ids.map((id) => `<<${id}>>`));
  const which = ids.length === 1 ? "an id that is no section" : "ids that are no sections";
  const written = ids.some((id) => WRITTEN.has(id)) ? " The plugin adds the skills, the board and the focus itself, whatever the template holds." : "";
  return `The template that the blockr option assistant_template names puts in ${named}, ${which} of blockr.assistant's template, whose sections are ${listed([...SECTIONS.keys()])}.${written}`;
}

// The words given as a list in a sentence, as "a, b and c".
function listed(words: readonly string[]): string {
  return words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1) ?? ""}`;
}
