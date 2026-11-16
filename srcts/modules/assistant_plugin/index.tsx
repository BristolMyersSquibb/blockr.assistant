// The module of the assistant's plugin class,
// blockr.assistant-assistant_plugin, which blockr.assistant lists in R with
// the class's id. Its default export is the class without its id
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.1.12#a-plugin).
// - The class keeps the assistant's state, its conversations, which
//   ../../state defines. It gives core the schema of the state, which the
//   build generates from the state's types, and the default of the state,
//   which holds no conversation. The class is at version 1, with no `migrate`
//   until a version 2 needs one, and no `update`, since nothing in the state
//   names one of core's objects
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.3#the-schema-the-default-and-the-version).
// - It gives core the assistant's commands, which ../../commands defines and
//   core registers with the class.
// - Its start makes the conversations of the board that opens, which cut
//   every conversation to the cap on what the state keeps, or move every one
//   into the plugin's memory under a cap of 0 (../../conversations). Where
//   that fails, as for a cap that nobody can read, it logs the error.
// - Its `ui`, which every frontend places for the assistant, draws an empty
//   panel. It draws in React, on the one copy of React that core puts on the
//   page, in a root of its own.

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { JsonSchema, PluginClass, PluginModule } from "@blockr/core";
// The schema of the class's state is the file that the build writes for R,
// beside the bundle.
// eslint-disable-next-line no-restricted-imports
import schema from "../../../inst/js/assistant_plugin.schema.json" with { type: "json" };
import { assistantCommands } from "../../commands/index.ts";
import { createConversations } from "../../conversations/index.ts";

export const api = 1;

const ui = {
  render({ el }) {
    const root = createRoot(el);
    // React draws the panel before render() returns.
    flushSync(() => {
      root.render(<div />);
    });
    return () => {
      root.unmount();
    };
  },
} satisfies PluginModule;

export default {
  ui,
  // TypeScript gives the objects in the JSON's arrays properties that may be
  // undefined, which no Json has, so it does not take the schema for a Json,
  // though it is one.
  state: { schema: schema as unknown as JsonSchema, default: { conversations: {} } },
  commands: assistantCommands,
  start({ core, signal }) {
    createConversations(core, signal).opened.catch((error: unknown) => {
      core.log("blockr.assistant").error(error instanceof Error ? error : new Error(String(error)));
    });
    return undefined;
  },
} satisfies Omit<PluginClass, "id">;
