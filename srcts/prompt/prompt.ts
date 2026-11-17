// What the plugin tells the model with each call, in the order in which the
// call sends it
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.5#what-a-call-sends-and-in-which-order):
// 1. The tools' definitions, which pi sends before everything else, and which
//    change only with a release of blockr.assistant.
// 2. The system prompt: the board's template (./template.ts), then the rules
//    in ./rules.md, and then the Skills section (./skills.ts).
// 3. The conversation's messages, which the loop sends.
// 4. The message of the app's, which the loop adds after the conversation's
//    last message, for the call alone: its preamble, which says that the app
//    writes it, then the Board section (./board.ts) and the Focus section
//    (./focus.ts), as they are when the call goes out. The conversation never
//    keeps it.
// So a provider's prompt cache serves the tools, the system prompt and the
// conversation so far, and only the message of the app's and the newest
// messages are read anew.
// - The system prompt changes only with the template and the skills, which
//   the plugin reads once as each board opens, so the plugin writes it once
//   for each board.
// - The rules describe the board and the assistant's tools, the same in every
//   deployment, so they are no section of the template, and no template leaves
//   them out or moves them. They hold no tool's description, which the
//   tool's definition gives already.
// - The call that writes a summary for compaction sends neither the template
//   nor the rules.

import type { CoreApi } from "@blockr/core";
import type { Skills } from "../skills/index.ts";
import { readToolCap } from "../tools/index.ts";
import preamble from "./app-preamble.md" with { type: "text" };
import { boardSection } from "./board.ts";
import { focusSection } from "./focus.ts";
import rules from "./rules.md" with { type: "text" };
import { skillsSection } from "./skills.ts";
import type { Template } from "./template.ts";

export interface Prompt {
  // Resolves with the system prompt of the open board, which it writes once.
  // It rejects where a cap that it reads holds a value that it does not take.
  system(): Promise<string>;
  // Resolves with the message of the app's as the board is now, for the call
  // that goes out. It rejects where a cap that it reads holds a value that it
  // does not take.
  appMessage(): Promise<string>;
}

// What of CoreApi the prompt reads.
export type Core = Pick<CoreApi, "store" | "scheduler" | "options" | "plugins" | "focus" | "onScreen" | "blockrOption">;

export interface PromptOptions {
  // The skills that R listed for the open board.
  readonly skills: Pick<Skills, "list">;
  // The template of the open board.
  readonly template: Template;
}

export function createPrompt(core: Core, options: PromptOptions): Prompt {
  let written: Promise<string> | undefined;
  return {
    system: () => (written ??= systemPrompt(core, options)),
    appMessage: () => appMessage(core),
  };
}

async function systemPrompt(core: Core, { skills, template }: PromptOptions): Promise<string> {
  const [text, listed, max] = await Promise.all([template.text(), skills.list(), readToolCap(core, "assistant_skill_description_max_chars")]);
  const catalogue = skillsSection(listed, max);
  return [text, rules.trim(), ...(catalogue === undefined ? [] : [catalogue])].join("\n\n");
}

async function appMessage(core: Core): Promise<string> {
  const max = await readToolCap(core, "assistant_board_section_max_chars");
  // The board and the screen as they are once the cap is read.
  const focus = focusSection(core);
  return [preamble.trim(), boardSection(core, max), ...(focus === undefined ? [] : [focus])].join("\n\n");
}
