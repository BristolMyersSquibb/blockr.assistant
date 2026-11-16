// The tool read_skill, on blockr.core's CoreApi for tests, where R answers
// the request read_skill as the test gives.

import { describe, expect, test } from "vitest";
import { callTool, requestNotifications, skill, skillsHolding, startAssistant } from "../testing/index.ts";
import type { Answers, StartOptions } from "../testing/index.ts";
import { readTools } from "./index.ts";

const SKILLS = [skill("exposure"), skill("review", { userInvocable: true, modelInvocable: false })];

async function started(answers: Answers = {}, conditions: StartOptions["conditions"] = {}) {
  const stub = await startAssistant({ answers, conditions });
  return { ...stub, tools: readTools(stub.core, skillsHolding(...SKILLS)) };
}

describe("read_skill", () => {
  test("sends read_skill with the app's packages, and gives the skill's text", async () => {
    const { tools, requests } = await started({ read_skill: ({ args }) => [`The text of ${JSON.stringify(args.name)}.`] });

    await expect(callTool(tools, "read_skill", { name: "exposure" })).resolves.toEqual({
      text: 'The text of "exposure".',
      isError: false,
      images: [],
    });
    expect(requests("read_skill").map(({ args }) => args)).toEqual([{ name: "exposure", packages: ["blockr.core", "blockr.assistant"] }]);
  });

  test("gives the warnings of R's reply after the skill's text, and core raises no notification for them", async () => {
    const { core, tools } = await started(
      { read_skill: () => ["The text of exposure."] },
      {
        read_skill: [
          {
            severity: "warning",
            class: ["simpleWarning", "warning", "condition"],
            phase: "request",
            message: "incomplete final line found on '/srv/skills/exposure/SKILL.md'",
          },
        ],
      },
    );

    await expect(callTool(tools, "read_skill", { name: "exposure" })).resolves.toEqual({
      text: "The text of exposure.\n\nWarning: incomplete final line found on '/srv/skills/exposure/SKILL.md'",
      isError: false,
      images: [],
    });
    expect(requestNotifications(core)).toEqual([]);
  });

  test("reads a file that the skill bundles, which R takes as its path", async () => {
    const { tools, requests } = await started({ read_skill: ({ args }) => [`The file ${JSON.stringify(args.path)}.`] });

    await expect(callTool(tools, "read_skill", { name: "exposure", file: "notes/tables.md" })).resolves.toMatchObject({
      text: 'The file "notes/tables.md".',
    });
    expect(requests("read_skill").map(({ args }) => args.path)).toEqual(["notes/tables.md"]);
  });

  test("refuses a skill that the model may not read, as one that R did not list, and sends nothing", async () => {
    const { tools, requests } = await started({ read_skill: () => ["Never read."] });

    for (const name of ["review", "unknown"]) {
      await expect(callTool(tools, "read_skill", { name })).resolves.toEqual({
        text: `No skill named "${name}" is available here. The Skills section of the system prompt lists the skills that name no class, and describe_block_type, describe_block and get_plugin_state list those that name one.`,
        isError: true,
        images: [],
      });
    }
    expect(requests("read_skill")).toEqual([]);
  });

  test("gives R's error, such as for a file that the skill does not bundle, and core raises no notification for it", async () => {
    const { core, tools } = await started({
      read_skill: () => {
        throw new Error("Skill exposure bundles no file notes.md. It bundles: SKILL.md.");
      },
    });

    await expect(callTool(tools, "read_skill", { name: "exposure", file: "notes.md" })).resolves.toEqual({
      text: "Skill exposure bundles no file notes.md. It bundles: SKILL.md.",
      isError: true,
      images: [],
    });
    expect(requestNotifications(core)).toEqual([]);
  });
});
