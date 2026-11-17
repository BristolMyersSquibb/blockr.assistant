// The settings of models that the deployment gives in a YAML file, which the
// blockr option assistant_model_settings names, by each model's id, such as
// for a model that a company's own proxy serves under a name of its own
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.1#the-models-settings).
// The class's start reads them as each board opens, and they last until the
// next board opens, as the signal aborts:
// 1. They send the request read_model_settings, in whose reply R gives what
//    the file holds, as YAML parses it, or nothing where the option names no
//    file.
// 2. They check the settings that R's reply gives each model.
// 3. They check that each model's like names a model of pi's catalogs, once
//    the first turn has loaded the loop, which holds the catalogs.
// 4. Where R's session ends before R replies, they ask again, since reading
//    the file changes nothing, as core asks again for a blockr option.
// 5. Where R cannot read the file, or where the file gives a value that a
//    setting does not take, they hold no settings, and raise the error
//    assistant_model_settings_failed, which core withdraws as the next board
//    opens (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#what-fails).
//    The calls go on with pi's catalogs and the defaults until then.
//    They raise nothing where the next board opened first.
// 6. They drop the conditions of R's reply, ok or error, since R logs each.
//    So core raises no notification for them, and R's error reaches the user
//    only in assistant_model_settings_failed.

import type { CoreApi, Json } from "@blockr/core";
import { heldError } from "../notifications/index.ts";
import type { HeldError } from "../notifications/index.ts";
import { failureMessage, sendUntilReplied } from "../requests/index.ts";

// A model's settings, each of which is undefined where its source gives none.
export interface ModelSettings {
  // The id of a model of pi's catalogs of OpenAI's and Anthropic's models,
  // whose settings the model takes where the file gives none.
  readonly like?: string;
  // Whether the model reasons, so that pi asks it to, at the thinking level
  // medium.
  readonly reasoning?: boolean;
  // Whether the model takes images. Where it takes none, pi replaces each
  // image of inspect_results with "(tool image omitted: model does not
  // support images)".
  readonly images?: boolean;
  // The model's context window, in tokens.
  readonly contextWindow?: number;
  // The most tokens that each call asks for the reply.
  readonly maxTokens?: number;
}

// The settings of a model that the base URL's list gives (../models).
export type ListedSettings = Pick<ModelSettings, "images" | "contextWindow" | "maxTokens">;

export interface ModelSettingsFile {
  // Resolves with the settings that the file gives each model, by the model's
  // id, once each like names a model that pi's catalogs hold, as the function
  // given says. It resolves with none where the file failed, and never
  // rejects. Each call resolves with what the first resolved with.
  checked(inCatalog: (id: string) => boolean): Promise<ReadonlyMap<string, ModelSettings>>;
}

// What of CoreApi the settings read.
interface Core {
  readonly request: CoreApi["request"];
  readonly notifications: Pick<CoreApi["notifications"], "notify">;
}

const NONE: ReadonlyMap<string, ModelSettings> = new Map();

const WITHOUT = "The assistant goes on without the deployment's model settings";
const FILE = "the file that the blockr option assistant_model_settings names";
const CATALOGS = "pi's catalogs of OpenAI's and Anthropic's models";

export function createModelSettings(core: Core, signal: AbortSignal): ModelSettingsFile {
  const failed = heldError(core, signal, "assistant_model_settings_failed");
  const read = readSettings(core, signal, failed);
  let checking: Promise<ReadonlyMap<string, ModelSettings>> | undefined;
  return {
    checked(inCatalog) {
      checking ??= read.then((settings) => {
        for (const [id, given] of settings) {
          if (given.like !== undefined && !inCatalog(given.like)) {
            failed.raise(`${WITHOUT}, since ${FILE} gives the model ${id} the like ${JSON.stringify(given.like)}, which names no model of ${CATALOGS}.`);
            return NONE;
          }
        }
        return settings;
      });
      return checking;
    },
  };
}

async function readSettings(core: Core, signal: AbortSignal, failed: HeldError): Promise<ReadonlyMap<string, ModelSettings>> {
  let answer: Json | Blob;
  try {
    ({ answer } = await sendUntilReplied(core, "read_model_settings", {}, { signal }));
  } catch (error) {
    if (!signal.aborted) failed.raise(`${WITHOUT}, since R could not read them: ${failureMessage(error)}`);
    return NONE;
  }
  try {
    return settingsOf(answer);
  } catch (error) {
    failed.raise(`${WITHOUT}, since ${error instanceof Error ? error.message : String(error)}`);
    return NONE;
  }
}

// The settings of R's reply, which gives what the file holds, every vector as
// an array, or null where the option names no file. An entry of null gives no
// settings, as for a model whose id the file names alone.
function settingsOf(reply: Json | Blob): ReadonlyMap<string, ModelSettings> {
  if (reply === null) return NONE;
  if (!isObject(reply)) throw new TypeError(`${FILE} gives ${shown(reply)}, where it gives each model's settings by the model's id.`);
  return new Map(Object.entries(reply).map(([id, entry]) => [id, entryOf(id, entry)]));
}

function entryOf(id: string, entry: Json): ModelSettings {
  if (entry === null) return {};
  if (!isObject(entry)) {
    throw new TypeError(`${FILE} gives the model ${id} ${shown(entry)}, where it gives the model's settings by their names, such as reasoning: true.`);
  }
  let settings: ModelSettings = {};
  for (const [name, value] of Object.entries(entry)) {
    switch (name) {
      case "like":
        settings = { ...settings, like: text(id, name, value) };
        break;
      case "reasoning":
        settings = { ...settings, reasoning: flag(id, name, value) };
        break;
      case "images":
        settings = { ...settings, images: flag(id, name, value) };
        break;
      case "context_window":
        settings = { ...settings, contextWindow: tokens(id, name, value) };
        break;
      case "max_tokens":
        settings = { ...settings, maxTokens: tokens(id, name, value) };
        break;
      default:
        throw new TypeError(
          `${FILE} gives the model ${id} the setting ${name}, which the assistant does not know. A model's settings are like, reasoning, images, context_window and max_tokens.`,
        );
    }
  }
  return settings;
}

// The value of a setting, which R writes as an array of one.
function one(value: Json): Json | undefined {
  return Array.isArray(value) && value.length === 1 ? (value[0] as Json) : undefined;
}

function text(id: string, name: string, value: Json): string {
  const given = one(value);
  if (typeof given === "string" && given !== "") return given;
  throw refused(id, name, value, `the id of a model of ${CATALOGS}, such as claude-sonnet-5-5`);
}

function flag(id: string, name: string, value: Json): boolean {
  const given = one(value);
  if (typeof given === "boolean") return given;
  throw refused(id, name, value, "true or false");
}

function tokens(id: string, name: string, value: Json): number {
  const given = one(value);
  if (typeof given === "number" && Number.isSafeInteger(given) && given > 0) return given;
  throw refused(id, name, value, "a whole number of tokens above 0, such as 128000");
}

function refused(id: string, name: string, value: Json, takes: string): TypeError {
  return new TypeError(`${FILE} gives the model ${id} the ${name} ${shown(value)}, where ${name} takes ${takes}.`);
}

function isObject(value: Json | Blob): value is Readonly<Record<string, Json>> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Blob);
}

// A value as the file gives it: the one value of an array of one, as R writes
// it, or else the JSON that R wrote.
function shown(value: Json | Blob): string {
  if (value instanceof Blob) return "a file";
  return JSON.stringify(one(value) ?? value);
}
