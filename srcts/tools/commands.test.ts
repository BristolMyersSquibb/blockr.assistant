// The tools that read the command registry, on blockr.core's CoreApi for
// tests, which registers core's commands and those of the app's plugin
// classes, the assistant's among them.

import { describe, expect, test } from "vitest";
import { callTool, parsed, skillsHolding, startAssistant } from "../testing/index.ts";
import type { StartOptions } from "../testing/index.ts";
import { readTools } from "./index.ts";

async function started(options: StartOptions = {}) {
  const stub = await startAssistant(options);
  return { ...stub, tools: readTools(stub.core, skillsHolding()) };
}

describe("list_commands", () => {
  test("gives each command's id and description, and leaves out the assistant's own", async () => {
    const { core, tools } = await started();
    const ids = Object.keys(core.commands.registered());

    const listed = parsed(await callTool(tools, "list_commands")) as { id: string }[];

    expect(ids).toContain("blockr.assistant-add_message");
    expect(listed.map(({ id }) => id)).toEqual(ids.filter((id) => !id.startsWith("blockr.assistant-")));
    expect(listed).toContainEqual({
      id: "blockr.core-change_block",
      description: core.commands.registered()["blockr.core-change_block"]?.description,
    });
  });

  test("cuts each description at assistant_description_max_chars, pointing at describe_command, and lists a command without one by its label", async () => {
    const { core, tools } = await started({ blockrOptions: { assistant_description_max_chars: 90 } });
    core.commands.register({
      id: "blockr.test-sort",
      label: "Sort",
      description: "Sorts the rows of a block's result by the columns given, each in the order given, the first column first.",
      run: () => [],
    });
    core.commands.register({ id: "blockr.test-noop", label: "Do nothing", undo: false, run: () => [] });

    const listed = parsed(await callTool(tools, "list_commands"));

    expect(listed).toContainEqual({
      id: "blockr.test-sort",
      description: "Sorts the row\n... [+92 chars truncated -- call describe_command for the full description]",
    });
    expect(listed).toContainEqual({ id: "blockr.test-noop", description: "Do nothing" });
  });
});

describe("describe_command", () => {
  test("gives the command's label, its description in full, the schema of its args, and whether it takes an undo step", async () => {
    const { core, tools } = await started({ blockrOptions: { assistant_description_max_chars: 10 } });
    const command = core.commands.registered()["blockr.core-change_block"];

    expect(parsed(await callTool(tools, "describe_command", { id: "blockr.core-change_block" }))).toEqual({
      id: "blockr.core-change_block",
      label: command?.label,
      description: command?.description,
      args: command?.args,
      undo: true,
    });
  });

  test("says of a command with `undo: false` and no args that it takes no undo step and no args", async () => {
    const { core, tools } = await started();
    core.commands.register({ id: "blockr.test-noop", label: "Do nothing", undo: false, run: () => [] });

    expect(parsed(await callTool(tools, "describe_command", { id: "blockr.test-noop" }))).toEqual({
      id: "blockr.test-noop",
      label: "Do nothing",
      args: null,
      undo: false,
    });
  });

  test("answers a command of the assistant's own, as one that the app lacks, with the tool that lists the commands", async () => {
    const { tools } = await started();

    for (const id of ["blockr.assistant-add_message", "blockr.core-fly"]) {
      await expect(callTool(tools, "describe_command", { id })).resolves.toEqual({
        text: `The app registers no command "${id}" that you may run. Call list_commands for those that it registers.`,
        isError: true,
        images: [],
      });
    }
  });
});
