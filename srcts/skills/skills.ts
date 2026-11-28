// The skills of the open board, which R lists and the assistant's tools read
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.2#the-requests-in-r).
// The class's start makes them as each board opens, and they last until the
// next board opens, as the signal aborts:
// 1. They send the request list_skills, with the app's packages, so that R
//    lists the skills of each package that the app uses, then those of the
//    deployment.
// 2. They hold R's reply until the next board opens.
// 3. Where R's session ends before R replies, they ask again, since listing
//    the skills changes nothing, as core asks again for a blockr option.
// 4. Where R cannot list the skills, they hold none and raise the error
//    assistant_skills_failed, which core withdraws as the next board opens
//    (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#what-fails).
//    That is also when they ask R again, so they withdraw nothing themselves.
//    They raise nothing where the next board opened first.
// 5. They drop the notifications of R's reply, ok or error, which the
//    request's notifier takes (../requests/requests.ts), since R logs each
//    condition. So core raises none of them, and R's error reaches the user
//    only in assistant_skills_failed.
//
// They also read a skill's text, for a /name that the user types in the chat
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#slash-commands):
// 1. They send the request read_skill, with the skill's name and the app's
//    packages, and ask again where R's session ends before R replies, as for
//    the list.
// 2. Where R cannot read the skill, they raise the error
//    assistant_skills_failed, which says why, and the chat sends nothing.
// 3. A later read that succeeds withdraws that error, and core withdraws it
//    as the next board opens.
// No read meets a failed list, since the chat then knows no skill to read.

import type { CoreApi, Id, Json, PluginClassId, RegistryId } from "@blockr/core";
import { heldError } from "../notifications/index.ts";
import { answeredText, answeredTexts, appPackages, failureMessage, sendUntilReplied } from "../requests/index.ts";
import { assistantClassId } from "../state/index.ts";

// A skill, as R lists it.
export interface Skill {
  readonly name: string;
  readonly description: string;
  // The registry ids of the block classes that the skill names in `blocks:`,
  // as core gives them.
  readonly blocks: readonly RegistryId[];
  // The ids of the plugin classes that it names in `plugins:`, as core gives
  // them.
  readonly plugins: readonly PluginClassId[];
  // Whether the user may call the skill, as its flag `user-invocable` has it.
  readonly userInvocable: boolean;
  // Whether the model may read the skill, which its flag
  // `disable-model-invocation` forbids.
  readonly modelInvocable: boolean;
}

export interface Skills {
  // Resolves with the skills that R listed for the open board, in R's order,
  // or with none where R could not list them. It never rejects.
  list(): Promise<readonly Skill[]>;
  // Resolves with the text of the skill of the name given, without its
  // frontmatter, as R reads it. It rejects where R cannot read the skill,
  // having raised assistant_skills_failed, unless the next board opened.
  read(name: string): Promise<string>;
}

// What of CoreApi the skills read.
interface Core {
  readonly request: CoreApi["request"];
  readonly notifications: Pick<CoreApi["notifications"], "notify">;
  readonly store: Pick<CoreApi["store"], "packages">;
  readonly id: CoreApi["id"];
}

export function createSkills(core: Core, signal: AbortSignal): Skills {
  const listed = listSkills(core, signal);
  const readFailed = heldError(core, signal, "assistant_skills_failed");
  return {
    list: () => listed,
    async read(name) {
      try {
        const { answer } = await sendUntilReplied(core, "read_skill", { name, packages: appPackages(core) }, { signal });
        const text = answeredText(answer, "read_skill");
        readFailed.withdraw();
        return text;
      } catch (error) {
        readFailed.raise(`The chat sent nothing, since R could not read the skill ${name}: ${failureMessage(error)}`);
        throw error;
      }
    },
  };
}

async function listSkills(core: Core, signal: AbortSignal): Promise<readonly Skill[]> {
  try {
    const { answer } = await sendUntilReplied(core, "list_skills", { packages: appPackages(core) }, { signal });
    return skillsOf(core, answer);
  } catch (error) {
    if (signal.aborted) return [];
    core.notifications.notify(assistantClassId(core), {
      severity: "error",
      code: "assistant_skills_failed",
      message: `The assistant goes on without skills, since R could not list them: ${failureMessage(error)}`,
    });
    return [];
  }
}

// The skills of R's reply, which R writes with every vector as an array.
function skillsOf(core: Pick<Core, "id">, reply: Json | Blob): Skill[] {
  if (!Array.isArray(reply)) throw new TypeError("R's reply to list_skills is not a list of skills.");
  return (reply as readonly Json[]).map((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new TypeError(`R's reply to list_skills holds ${JSON.stringify(entry)}, where it holds a skill.`);
    }
    const fields = entry as Readonly<Record<string, Json>>;
    return {
      name: one(fields, "name"),
      description: one(fields, "description"),
      blocks: classIds(core, fields, "blocks"),
      plugins: classIds(core, fields, "plugins"),
      userInvocable: flag(fields, "user-invocable"),
      modelInvocable: !flag(fields, "disable-model-invocation"),
    };
  });
}

// The ids of the classes that a skill names in `blocks` or `plugins`, as
// core gives them for the records of R's reply. Each record holds the class's
// package and its id, each string as an array of one, and the package of a
// block class that an app script defines as null, which only `blocks` holds.
function classIds(core: Pick<Core, "id">, fields: Readonly<Record<string, Json>>, name: "blocks"): RegistryId[];
function classIds(core: Pick<Core, "id">, fields: Readonly<Record<string, Json>>, name: "plugins"): PluginClassId[];
function classIds(core: Pick<Core, "id">, fields: Readonly<Record<string, Json>>, name: "blocks" | "plugins"): Id<string | null>[] {
  const given = fields[name];
  if (!Array.isArray(given)) {
    throw new TypeError(`R's reply to list_skills gives a skill's ${name} as ${JSON.stringify(given ?? null)}, where it gives a list of classes.`);
  }
  return (given as readonly Json[]).map((entry) => {
    const record = entry !== null && typeof entry === "object" && !Array.isArray(entry) ? (entry as Readonly<Record<string, Json>>) : {};
    const pkg = record.package === null && name === "blocks" ? null : single(record.package);
    const id = single(record.id);
    if (pkg === undefined || id === undefined || Object.keys(record).length !== 2) {
      throw new TypeError(`R's reply to list_skills gives a class of a skill's ${name} as ${JSON.stringify(entry)}, where it gives the class's package and id.`);
    }
    return core.id(pkg, id);
  });
}

// The one string of an array that R wrote, or undefined for anything else.
function single(value: Json | undefined): string | undefined {
  return Array.isArray(value) && value.length === 1 && typeof value[0] === "string" ? value[0] : undefined;
}

function one(fields: Readonly<Record<string, Json>>, name: string): string {
  const [value, ...rest] = answeredTexts(fields[name], "list_skills");
  if (value === undefined || rest.length > 0) {
    throw new TypeError(`R's reply to list_skills gives a skill's ${name} as ${JSON.stringify(fields[name] ?? null)}, where it gives one string.`);
  }
  return value;
}

function flag(fields: Readonly<Record<string, Json>>, name: string): boolean {
  const value = fields[name];
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === "boolean") return value[0];
  throw new TypeError(`R's reply to list_skills gives a skill's ${name} as ${JSON.stringify(value ?? null)}, where it gives true or false.`);
}
