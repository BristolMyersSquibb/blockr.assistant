// The tools that read the app's plugins: list_plugins and get_plugin_state,
// which take the place of today's list_extensions, describe_extension and
// list_views, and follow list_blocks and get_block_state in their names and
// caps (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.2#the-tools).
// - They leave out the assistant's own plugin, since its state holds the
//   conversations, and the model has its own conversation already.
// - The tool list_plugins gives each plugin the description of the schema of
//   its class's state, cut at assistant_description_max_chars, and points at
//   get_plugin_state for the rest.
// - The tool get_plugin_state gives a plugin's state, bounded at
//   assistant_state_max_chars as get_block_state bounds a block's, with the
//   schema in full.

import type { Json } from "@blockr/core";
import { object } from "../commands/index.ts";
import { ASSISTANT } from "../state/index.ts";
import { readToolCap } from "./caps.ts";
import { own, skillsNaming } from "./context.ts";
import type { ToolContext } from "./context.ts";
import { bounded, cutText } from "./cut.ts";
import { noPlugin } from "./failures.ts";
import { json, tool } from "./tool.ts";
import type { Tool } from "./tool.ts";

export function pluginTools(context: ToolContext): Tool[] {
  const { core } = context;

  // The name of the plugin, where the app runs it and the model may read it.
  const named = (id: string): string => {
    const plugin = id === ASSISTANT ? undefined : own(core.plugins.appPlugins(), id);
    if (plugin === undefined) throw new Error(noPlugin(id));
    return plugin.name;
  };

  // The schema of the state of the plugin's class, which the class may lack.
  const schema = (id: string): Json => core.plugins.pluginClass(id).state?.schema ?? null;

  return [
    tool<Record<string, never>>({
      name: "list_plugins",
      description:
        "List the app's plugins, which show or change the board as a whole, such as the dock, each with the id of its class, its name and the description of its state. Call get_plugin_state for one plugin's state.",
      parameters: object({}, []),
      run: async () => {
        const max = await readToolCap(core, "assistant_description_max_chars");
        return json(
          Object.entries(core.plugins.appPlugins())
            .filter(([id]) => id !== ASSISTANT)
            .map(([id, { name }]) => {
              const described = core.plugins.pluginClass(id).state?.schema.description;
              return {
                id,
                name,
                ...(typeof described === "string"
                  ? { description: cutText(described, max, "call get_plugin_state for the full description") }
                  : {}),
              };
            }),
        );
      },
    }),

    tool<{ readonly id: string }>({
      name: "get_plugin_state",
      description:
        "Give one plugin's state, with the JSON Schema that describes it, whose descriptions say what each part means, and the skills that name the plugin's class. The plugin's own commands change its state, and so does blockr.core-set_plugin_state, by that schema. A skill named here says how to use the plugin; load one with read_skill.",
      parameters: object({ id: { type: "string", description: "The id of the plugin's class, as list_plugins gives it." } }, ["id"]),
      run: async ({ id }) => {
        named(id);
        const [skills, max] = await Promise.all([skillsNaming(context, "plugins", id), readToolCap(core, "assistant_state_max_chars")]);
        // The plugin as it is once the skills and the cap are read.
        const name = named(id);
        const described: Record<string, Json> = {
          id,
          name,
          state: bounded(own(core.store.board().plugins, id) ?? null, max),
          schema: schema(id),
          ...(skills.length === 0 ? {} : { skills }),
        };
        return json(described);
      },
    }),
  ];
}
