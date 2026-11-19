// The slash commands that the message field takes, which typing / lists
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#slash-commands):
// - The command /compact compacts the open conversation.
// - The command /clear starts a new conversation, as the drawer's New does.
// - The command /undo takes back the assistant's last undo step.
// - The command /redo applies again what the last undo took back.
// - For each skill that the user may call, the command /name sends the skill
//   with its text.
// The first four are the built-in commands, as today's chat names them
// (register_builtin_commands() in R/ext-commands.R at fcbdb27).
//
// A line names a command by the word after its leading /, up to the first
// space or line break, as today's chat reads it (ChatInput.tsx#L56-L70 of
// shinychat at 6cb1417). A built-in command leaves out the rest of the line,
// as today's do, while a skill takes it as the user's request. A line whose
// word names no command goes to the model as typed.
// Where a skill takes the name of a built-in command, the built-in command
// keeps it, as today's chat registers those before the skills.

import type { Skill } from "../skills/index.ts";

export type Builtin = "compact" | "clear" | "undo" | "redo";

export type SlashCommand =
  | { readonly kind: "builtin"; readonly name: Builtin }
  | { readonly kind: "skill"; readonly skill: Skill };

// A command as the list shows it: by its name, after the /, and with what it
// does.
export interface Listed {
  readonly name: string;
  readonly description: string;
}

const BUILTINS: readonly (Listed & { readonly name: Builtin })[] = [
  { name: "compact", description: "Summarize the conversation so far, keeping the newest messages as they are." },
  { name: "clear", description: "Start a new conversation, keeping this one." },
  { name: "undo", description: "Take back the assistant's last edit of the board." },
  { name: "redo", description: "Apply again what the last undo took back." },
];

// The command that the line names, if any.
export function slashCommandOf(line: string, skills: readonly Skill[]): SlashCommand | undefined {
  const name = /^\/(\S+)/u.exec(line)?.[1];
  if (name === undefined) return undefined;
  const builtin = BUILTINS.find((command) => command.name === name);
  if (builtin !== undefined) return { kind: "builtin", name: builtin.name };
  const skill = callable(skills).find((given) => given.name === name);
  return skill === undefined ? undefined : { kind: "skill", skill };
}

// Whether the command waits, as a message does, so that the field neither
// runs nor drops it (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#while-a-turn-runs):
// - While a turn runs on the board, every command but /clear waits, since
//   /clear starts a conversation, as the drawer does.
// - While the chat lacks the visitor's key, /compact and a skill wait, since
//   they call the model, while /undo and /redo do not.
export function waits(command: SlashCommand, { running, noKey }: { readonly running: boolean; readonly noKey: boolean }): boolean {
  if (command.kind === "builtin" && command.name === "clear") return false;
  if (running) return true;
  return noKey && (command.kind === "skill" || command.name === "compact");
}

// The commands that the list offers: the built-in commands, then each skill
// that the user may call, in the order in which R lists them.
export function slashCommands(skills: readonly Skill[]): readonly Listed[] {
  return [...BUILTINS, ...callable(skills).map(({ name, description }) => ({ name, description }))];
}

// The commands that the list shows for the text in the message field: those
// whose names start with what the text holds after its /, whatever the case.
// The list is closed, and this undefined, unless the text starts with / and
// holds no space or line break.
export function listedFor(text: string, commands: readonly Listed[]): readonly Listed[] | undefined {
  if (!/^\/\S*$/u.test(text)) return undefined;
  const typed = text.slice(1).toLowerCase();
  return commands.filter((command) => command.name.toLowerCase().startsWith(typed));
}

// The skills that the user may call, but for one that takes the name of a
// built-in command.
function callable(skills: readonly Skill[]): Skill[] {
  return skills.filter((skill) => skill.userInvocable && !BUILTINS.some((command) => command.name === skill.name));
}
