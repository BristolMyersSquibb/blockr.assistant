// The lines that the app's plugins write about their state, which the Board
// section gives after the stacks
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.5#the-sections).
// The assistant knows no other plugin's state. A plugin's package tells the
// model what the state holds now, through a module named `assistant` that
// the package offers in the `modules` of its `._BLOCKR_MODULES_`, so that the
// module's id is `{pkg}-assistant`. The package needs no dependency on
// blockr.assistant for it, as for its skills. As each call goes out:
// 1. For each of the app's plugins but the assistant's own, the assistant
//    loads the module `assistant` of the plugin's package through
//    CoreApi.module(), where the package offers one.
// 2. It calls describe(plugin, state) of the module's default export, with
//    the id of the plugin's class and the plugin's state as the board holds
//    it, or null where the board holds none.
// 3. The function returns the lines that tell the model what the state holds
//    now, the most useful first, since the Board section's cap may cut them.
//    It returns none for a plugin that it has nothing to say about.
// Where the module fails to load, gives no describe(), or describe() fails or
// returns anything but strings, the assistant raises the error
// assistant_describe_failed about the plugin and leaves its lines out, until
// a call reads them again.

import type { CoreApi, Json, PluginClassId } from "@blockr/core";
import { heldError } from "../notifications/index.ts";
import type { HeldError } from "../notifications/index.ts";
import { ASSISTANT } from "../state/index.ts";

// What of CoreApi the lines read.
export type Core = Pick<CoreApi, "store" | "plugins" | "module" | "notifications">;

// The lines that a plugin wrote about its state, with the plugin's name and
// the id of its class.
export interface PluginLines {
  readonly plugin: PluginClassId;
  readonly name: string;
  readonly lines: readonly string[];
}

// The name of the module that a package offers for the assistant.
const MODULE = "assistant";

// What resolves, as each call goes out, with the lines of each of the app's
// plugins that wrote some, in the order of the app's plugins. It never
// rejects: it raises what fails for each plugin.
export function createDescribe(core: Core, signal: AbortSignal): () => Promise<readonly PluginLines[]> {
  // The error of each plugin whose lines failed, which holds until a call
  // reads the plugin's lines again.
  const failed = new Map<PluginClassId, HeldError>();
  const failure = (plugin: PluginClassId): HeldError => {
    const held = failed.get(plugin) ?? heldError(core, signal, "assistant_describe_failed");
    failed.set(plugin, held);
    return held;
  };

  return async () => {
    const plugins = Object.entries(core.plugins.appPlugins()).filter(([id]) => id !== ASSISTANT);
    const loaded = await Promise.all(plugins.map(([id]) => offered(core, moduleId(id))));
    // The board as the modules have loaded, so that the lines are of the
    // board that the Board section gives.
    const states = core.store.board().plugins;
    return plugins.flatMap(([id, { name }], index) => {
      const found = loaded[index];
      try {
        const lines = found === undefined ? [] : linesOf(found, id, Object.hasOwn(states, id) ? (states[id] ?? null) : null);
        failed.get(id)?.withdraw();
        return lines.length === 0 ? [] : [{ plugin: id, name, lines }];
      } catch (error) {
        failure(id).raise(`The Board section leaves out what the plugin ${name} says about its state. ${error instanceof Error ? error.message : String(error)}`);
        return [];
      }
    });
  };
}

// The id of the module `assistant` of the package of a plugin's class, whose
// id names the package before its first dash, as in "blockr.dock-assistant"
// for "blockr.dock-dock_plugin".
function moduleId(plugin: PluginClassId): string {
  return `${plugin.slice(0, plugin.indexOf("-"))}-${MODULE}`;
}

// The exports of the module given, or undefined where no package offers it.
// Where the module fails to load, it gives the error, which describe() raises.
async function offered(core: Pick<Core, "module">, id: string): Promise<Loaded | undefined> {
  try {
    return { id, exports: await core.module(id) };
  } catch (error) {
    // Core rejects with a ModuleError where the module fails to load, and with
    // a plain Error where no package offers the module.
    return error instanceof Error && error.name === "ModuleError" ? { id, error } : undefined;
  }
}

type Loaded = { readonly id: string; readonly exports: unknown } | { readonly id: string; readonly error: Error };

// The lines that the module's describe() returns for the plugin's state. It
// throws where the module failed to load, gives no describe(), or where
// describe() fails or returns anything but strings.
function linesOf(found: Loaded, plugin: PluginClassId, state: Json): readonly string[] {
  if ("error" in found) throw found.error;
  const given = isRecord(found.exports) ? found.exports.default : undefined;
  const describe = isRecord(given) ? given.describe : undefined;
  if (typeof describe !== "function") throw new Error(`The module ${found.id} gives no function describe() in its default export.`);
  let lines: unknown;
  try {
    lines = describe.call(given, plugin, state);
  } catch (error) {
    throw new Error(`The describe() of the module ${found.id} failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  if (!Array.isArray(lines) || !lines.every((line) => typeof line === "string")) {
    throw new Error(`The describe() of the module ${found.id} returned ${shown(lines)}, where it returns an array of strings.`);
  }
  return lines;
}

// The value as a message names it: its JSON, cut at 100 characters, or what
// String() writes where JSON has no form for it, as for undefined.
function shown(value: unknown): string {
  // JSON.stringify() gives undefined for undefined and for a function, which
  // its type leaves out.
  const text = (JSON.stringify(value) as string | undefined) ?? String(value);
  return text.length > 100 ? `${text.slice(0, 100)}…` : text;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
