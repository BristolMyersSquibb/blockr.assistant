// The tools that read the app's plugins, on blockr.core's CoreApi for tests,
// where the app runs core's plugins, the assistant and a plugin of notes,
// whose class keeps the notes in its state.

import { describe, expect, test } from "vitest";
import { callTool, parsed, skill, skillsHolding, startAssistant } from "../testing/index.ts";
import type { StartOptions } from "../testing/index.ts";
import type { Skill } from "../skills/index.ts";
import { ASSISTANT } from "../state/index.ts";
import { readTools } from "./index.ts";

const NOTES = "blockr.test-notes_plugin";

const TEXT = "Look at the outliers first, then at the groups that hold fewer than ten rows.";

const SCHEMA = {
  type: "object",
  description:
    "The notes beside the board, in markdown, which the plugin shows in its panel. Each note is a paragraph of its own, and the plugin draws them in the order of the text.",
  properties: { text: { type: "string", description: "The text of the notes." } },
  required: ["text"],
  additionalProperties: false,
};

async function started(options: StartOptions = {}, skills: readonly Skill[] = []) {
  const stub = await startAssistant({
    plugins: { [NOTES]: { name: "Notes", definition: { state: { schema: SCHEMA, default: { text: TEXT } } } } },
    ...options,
  });
  return { ...stub, tools: readTools(stub.core, skillsHolding(...skills)) };
}

describe("list_plugins", () => {
  test("gives each of the app's plugins by its class's id and name, with the description of its state, and leaves out the assistant", async () => {
    const { core, tools } = await started();

    const listed = parsed(await callTool(tools, "list_plugins")) as { id: string }[];

    expect(Object.keys(core.plugins.appPlugins())).toContain(ASSISTANT);
    expect(listed.map(({ id }) => id)).toEqual(Object.keys(core.plugins.appPlugins()).filter((id) => id !== ASSISTANT));
    expect(listed).toContainEqual({ id: NOTES, name: "Notes", description: SCHEMA.description });
    expect(listed).toContainEqual({ id: "blockr.core-file_storage_plugin", name: "File storage" });
  });

  test("cuts each description at assistant_description_max_chars, pointing at get_plugin_state", async () => {
    const { tools } = await started({ blockrOptions: { assistant_description_max_chars: 100 } });

    expect(parsed(await callTool(tools, "list_plugins"))).toContainEqual({
      id: NOTES,
      name: "Notes",
      description: "The notes beside the bo\n... [+143 chars truncated -- call get_plugin_state for the full description]",
    });
  });
});

describe("get_plugin_state", () => {
  test("gives the plugin's state, with the schema that describes it and the skills that name its class", async () => {
    const skills = [skill("notes", { plugins: [NOTES] }), skill("blocks", { blocks: ["blockr.core-head_block"] })];
    const { tools } = await started({}, skills);

    expect(parsed(await callTool(tools, "get_plugin_state", { id: NOTES }))).toEqual({
      id: NOTES,
      name: "Notes",
      state: { text: TEXT },
      schema: SCHEMA,
      skills: [{ name: "notes", description: "What notes covers." }],
    });
  });

  test("cuts the state's strings at assistant_state_max_chars", async () => {
    const { tools } = await started({ blockrOptions: { assistant_state_max_chars: 40 } });

    expect(parsed(await callTool(tools, "get_plugin_state", { id: NOTES }))).toMatchObject({
      state: { text: "Look at the ou\n... [+63 chars truncated]" },
    });
  });

  test("gives no state and no schema for a plugin whose class keeps none", async () => {
    const { tools } = await started();

    expect(parsed(await callTool(tools, "get_plugin_state", { id: "blockr.core-file_storage_plugin" }))).toEqual({
      id: "blockr.core-file_storage_plugin",
      name: "File storage",
      state: null,
      schema: null,
    });
  });

  test("answers the assistant's own plugin, as one that the app does not run, with the tool that lists the plugins", async () => {
    const { tools } = await started();

    for (const id of [ASSISTANT, "blockr.dock-dock_plugin"]) {
      await expect(callTool(tools, "get_plugin_state", { id })).resolves.toEqual({
        text: `The app runs no plugin "${id}" that you may read. Call list_plugins for those that it runs.`,
        isError: true,
        images: [],
      });
    }
  });
});
