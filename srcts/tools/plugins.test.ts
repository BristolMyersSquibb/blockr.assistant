// The tools that read the app's plugins, on blockr.core's CoreApi for tests,
// where the app runs core's plugins, the assistant, a plugin of notes, whose
// class keeps the notes in its state, and a plugin that tidies the board,
// whose class keeps no state.

import { id } from "@blockr/core/stubs";
import { describe, expect, test } from "vitest";
import { callTool, parsed, skill, skillsHolding, startAssistant } from "../testing/index.ts";
import type { StartOptions } from "../testing/index.ts";
import type { Skill } from "../skills/index.ts";
import { readTools } from "./index.ts";

// The ids of the classes of the plugins of notes and of tidying, as JSON
// holds them.
const NOTES = { package: "blockr.test", id: "notes_plugin" };
const TIDY = { package: "blockr.test", id: "tidy_plugin" };

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
    plugins: {
      "blockr.test": {
        notes_plugin: { name: "Notes", definition: { state: { schema: SCHEMA, default: { text: TEXT } } } },
        tidy_plugin: { name: "Tidy", definition: {} },
      },
    },
    ...options,
  });
  return { ...stub, tools: readTools(stub.core, skillsHolding(...skills)) };
}

describe("list_plugins", () => {
  test("gives each of the app's plugins by its class's id, as a record of its package and its id, and its name, with the description of its state, and leaves out the assistant", async () => {
    const { core, tools } = await started();
    const assistant = core.id("blockr.assistant", "assistant_plugin");
    const ids = [...core.plugins.appPlugins().keys()];

    const listed = parsed(await callTool(tools, "list_plugins")) as { id: { package: string; id: string } }[];

    expect(ids).toContain(assistant);
    expect(listed.map(({ id }) => id)).toEqual(ids.filter((key) => key !== assistant).map((key) => ({ package: key.package, id: key.id })));
    expect(listed).toContainEqual({ id: NOTES, name: "Notes", description: SCHEMA.description });
    expect(listed).toContainEqual({ id: TIDY, name: "Tidy" });
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
    const skills = [skill("notes", { plugins: [id("blockr.test", "notes_plugin")] }), skill("blocks", { blocks: [id("blockr.core", "head_block")] })];
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

    expect(parsed(await callTool(tools, "get_plugin_state", { id: TIDY }))).toEqual({
      id: TIDY,
      name: "Tidy",
      state: null,
      schema: null,
    });
  });

  test("answers the assistant's own plugin, as one that the app does not run or whose id core refuses, with the tool that lists the plugins", async () => {
    const { tools } = await started();

    for (const given of [
      { package: "blockr.assistant", id: "assistant_plugin" },
      { package: "blockr.dock", id: "dock_plugin" },
      { package: "not a package", id: "dock_plugin" },
    ]) {
      await expect(callTool(tools, "get_plugin_state", { id: given })).resolves.toEqual({
        text: `The app runs no plugin "${given.package}::${given.id}" that you may read. Call list_plugins for those that it runs.`,
        isError: true,
        images: [],
      });
    }
  });
});
