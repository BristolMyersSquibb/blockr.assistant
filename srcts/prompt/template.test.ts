// The template of the system prompt: blockr.assistant's own, a deployment's
// that keeps, moves or leaves out its sections, and the template of the open
// board, which the class's start has R read, on blockr.core's CoreApi for
// tests, and on a stand-in for what of CoreApi it reads where a test needs a
// failure that the stub cannot play.

import type { CoreApi, Json, Raised } from "@blockr/core";
import { describe, expect, test, vi } from "vitest";
import { requestNotifications, startAssistant } from "../testing/index.ts";
import { createTemplate, fillTemplate, SECTIONS, TEMPLATE } from "./index.ts";

const ROLE = SECTIONS.get("role")?.trim() ?? "";
const BUILD = SECTIONS.get("build")?.trim() ?? "";
const STYLE = SECTIONS.get("style")?.trim() ?? "";

// What of CoreApi the template reads, whose request() answers as `request`
// does, and whose notify() records what it raises.
function standIn(request: () => Promise<Json | Blob>) {
  const raised: Raised[] = [];
  const core = {
    request: vi.fn(request) as unknown as CoreApi["request"],
    notifications: {
      notify: (_plugin: string, notification: Raised) => {
        raised.push(notification);
        return () => undefined;
      },
    },
  };
  return { core, raised };
}

function sessionEnded(): Error {
  const error = new Error("The session ended before R replied to request 7.");
  error.name = "SessionEndedError";
  return error;
}

// The errors that the assistant raised, by code and message.
function moduleErrors(core: CoreApi): { code: string | undefined; message: string }[] {
  return core.notifications
    .get()
    .filter(({ source }) => source.kind === "module")
    .map(({ message, source }) => ({ code: "code" in source ? source.code : undefined, message }));
}

describe("blockr.assistant's template", () => {
  test("sets out the sections role, build and style, each on a line of its own, in that order", () => {
    expect([...SECTIONS.keys()]).toEqual(["role", "build", "style"]);
    expect(TEMPLATE.trim().split(/\n+/)).toEqual(["<<role>>", "<<build>>", "<<style>>"]);
  });

  test("puts in the text of each section, with an empty line between two", () => {
    expect(fillTemplate(TEMPLATE)).toBe(`${ROLE}\n\n${BUILD}\n\n${STYLE}`);
  });

  test("names no tool, so that no template tells the model what a tool's description says", () => {
    expect(fillTemplate(TEMPLATE)).not.toMatch(/\b(list|describe|get|inspect|read|undo)_[a-z_]+|blockr\.[a-z]+-[a-z_]+/);
  });
});

describe("a deployment's template", () => {
  test("keeps the sections that it names, in its order, with text of its own around them", () => {
    const given = "You are the assistant of the clinical data explorer.\n\n<<style>>\n\n<<build>>\n\nCite each study by its id.";

    expect(fillTemplate(given)).toBe(`You are the assistant of the clinical data explorer.\n\n${STYLE}\n\n${BUILD}\n\nCite each study by its id.`);
  });

  test("leaves out the sections that it does not name, and may name none", () => {
    expect(fillTemplate("<<role>>\n")).toBe(ROLE);
    expect(fillTemplate("Ask before you build anything.")).toBe("Ask before you build anything.");
  });

  test("fails where it names an id that is no section, naming each such id and the sections", () => {
    expect(() => fillTemplate("<<role>>\n\n<<edits>>\n\n<<Role>>")).toThrow(
      "The template that the blockr option assistant_template names puts in <<edits>> and <<Role>>, ids that are no sections of blockr.assistant's template, whose sections are role, build and style.",
    );
  });

  test("fails where it names the sections of today's template that the plugin writes, and says that the plugin adds them", () => {
    expect(() => fillTemplate("<<role>>\n\nAnswer concisely.<<skills>><<board>><<focus>>")).toThrow(
      "The template that the blockr option assistant_template names puts in <<skills>>, <<board>> and <<focus>>, ids that are no sections of blockr.assistant's template, whose sections are role, build and style. The plugin adds the skills, the board and the focus itself, whatever the template holds.",
    );
  });

  test("keeps what only looks like an id, such as R's <<-", () => {
    expect(fillTemplate("Never write x <<- 1 >> 2.")).toBe("Never write x <<- 1 >> 2.");
  });
});

describe("the template of the open board", () => {
  test("is read by the class's start as the board opens, once", async () => {
    const { requests, settled } = await startAssistant();
    await settled();

    expect(requests("read_template").map(({ args, reads }) => ({ args, reads }))).toEqual([{ args: {}, reads: [] }]);
  });

  test("is blockr.assistant's where the option names no file", async () => {
    const { core } = await startAssistant({ answers: { read_template: () => null } });

    await expect(createTemplate(core, new AbortController().signal).text()).resolves.toBe(fillTemplate(TEMPLATE));
    expect(moduleErrors(core)).toEqual([]);
  });

  test("is the deployment's where R reads it, with blockr.assistant's sections put in", async () => {
    const { core } = await startAssistant({ answers: { read_template: () => ["You help with study boards.\n\n<<build>>"] } });

    await expect(createTemplate(core, new AbortController().signal).text()).resolves.toBe(`You help with study boards.\n\n${BUILD}`);
    expect(moduleErrors(core)).toEqual([]);
  });

  test("raises assistant_template_failed where R cannot read the file, with what R said, and core raises no notification of R's error beside it", async () => {
    const { core, settled } = await startAssistant({
      answers: {
        read_template: () => {
          throw new Error("R cannot read the template /srv/template.md that the blockr option assistant_template names: cannot open file");
        },
      },
    });
    await settled();

    expect(moduleErrors(core)).toEqual([
      {
        code: "assistant_template_failed",
        message:
          "The assistant uses its own template: R cannot read the template /srv/template.md that the blockr option assistant_template names: cannot open file",
      },
    ]);
    expect(requestNotifications(core)).toEqual([]);
  });

  test("is blockr.assistant's where R cannot read the file", async () => {
    const { core, raised } = standIn(() => Promise.reject(new Error("R cannot read the template.")));

    await expect(createTemplate(core, new AbortController().signal).text()).resolves.toBe(fillTemplate(TEMPLATE));
    expect(raised.map(({ code }) => code)).toEqual(["assistant_template_failed"]);
  });

  test("is blockr.assistant's, with the error assistant_template_failed, where the file names an id that is no section", async () => {
    const { core, raised } = standIn(() => Promise.resolve(["<<role>>\n\n<<edits>>"]));

    await expect(createTemplate(core, new AbortController().signal).text()).resolves.toBe(fillTemplate(TEMPLATE));
    expect(raised).toEqual([
      {
        severity: "error",
        code: "assistant_template_failed",
        message:
          "The assistant uses its own template: The template that the blockr option assistant_template names puts in <<edits>>, an id that is no section of blockr.assistant's template, whose sections are role, build and style.",
      },
    ]);
  });

  test("is asked for again where R's session ends before R replies, and raises nothing", async () => {
    let asked = 0;
    const { core, raised } = standIn(() => {
      asked += 1;
      return asked === 1 ? Promise.reject(sessionEnded()) : Promise.resolve(["<<style>>"]);
    });

    await expect(createTemplate(core, new AbortController().signal).text()).resolves.toBe(STYLE);
    expect(asked).toBe(2);
    expect(raised).toEqual([]);
  });

  test("raises nothing where the next board opened before R replied", async () => {
    const opening = new AbortController();
    const { core, raised } = standIn(() => {
      opening.abort();
      return Promise.reject(new DOMException("The board ended.", "AbortError"));
    });

    await expect(createTemplate(core, opening.signal).text()).resolves.toBe(fillTemplate(TEMPLATE));
    expect(raised).toEqual([]);
  });
});
