// The skills of the open board, which the class's start has R list, and the
// text of a skill, which they have R read for the chat's /name, on
// blockr.core's CoreApi for tests, and on a stand-in for what of CoreApi they
// read where a test needs a failure that the stub cannot play.

import type { CoreApi, Json, Raised } from "@blockr/core";
import { describe, expect, test, vi } from "vitest";
import { requestNotifications, startAssistant } from "../testing/index.ts";
import { createSkills } from "./index.ts";

// Two skills as R writes them, every vector as an array: one that names a
// block class, and one that the model may not read.
const LISTED = [
  {
    name: ["exposure"],
    description: ["Exposure tables."],
    blocks: ["blockr.core-dataset_block"],
    plugins: [],
    "user-invocable": [false],
    "disable-model-invocation": [false],
  },
  {
    name: ["review"],
    description: ["A review the user runs."],
    blocks: [],
    plugins: ["blockr.dock-dock_plugin"],
    "user-invocable": [true],
    "disable-model-invocation": [true],
  },
];

// What of CoreApi the skills read, whose request() answers as `request` does,
// and whose notify() records what it raises.
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
    store: { packages: () => ({ "blockr.core": "0.2.0", "blockr.assistant": "0.2.0" }) },
  };
  return { core, raised };
}

function sessionEnded(): Error {
  const error = new Error("The session ended before R replied to request 7.");
  error.name = "SessionEndedError";
  return error;
}

describe("the skills of the open board", () => {
  test("are listed by the class's start as the board opens, with the app's packages", async () => {
    const { requests, settled } = await startAssistant({ answers: { list_skills: () => LISTED } });
    await settled();

    expect(requests("list_skills").map(({ args, reads }) => ({ args, reads }))).toEqual([
      { args: { packages: ["blockr.core", "blockr.assistant"] }, reads: [] },
    ]);
  });

  test("hold each skill as R lists it, with its classes and flags", async () => {
    const { core } = await startAssistant({ answers: { list_skills: () => LISTED } });

    await expect(createSkills(core, new AbortController().signal).list()).resolves.toEqual([
      { name: "exposure", description: "Exposure tables.", blocks: ["blockr.core-dataset_block"], plugins: [], userInvocable: false, modelInvocable: true },
      { name: "review", description: "A review the user runs.", blocks: [], plugins: ["blockr.dock-dock_plugin"], userInvocable: true, modelInvocable: false },
    ]);
  });

  test("drop the warnings of R's reply, for which core raises no notification", async () => {
    const { core, settled } = await startAssistant({
      answers: { list_skills: () => LISTED },
      conditions: {
        list_skills: [
          {
            severity: "warning",
            class: ["simpleWarning", "warning", "condition"],
            phase: "request",
            message: "The skill catalogue takes more than assistant_skill_catalogue_max_chars.",
          },
        ],
      },
    });
    await settled();

    expect(requestNotifications(core)).toEqual([]);
    expect(core.notifications.get()).toEqual([]);
  });

  test("ask R once, however often the tools read them", async () => {
    const { core, requests } = await startAssistant({ answers: { list_skills: () => LISTED } });
    const before = requests("list_skills").length;
    const skills = createSkills(core, new AbortController().signal);

    await skills.list();
    await skills.list();

    expect(requests("list_skills")).toHaveLength(before + 1);
  });

  test("raise assistant_skills_failed where R cannot list them, with what R said, and core raises no notification of R's error beside it", async () => {
    const { core, settled } = await startAssistant({
      answers: {
        list_skills: () => {
          throw new Error("The assistant_skills directory /srv/skills does not exist.");
        },
      },
    });
    await settled();

    expect(
      core.notifications
        .get()
        .filter(({ source }) => source.kind === "module")
        .map(({ severity, message, source }) => ({ severity, message, code: "code" in source ? source.code : undefined })),
    ).toEqual([
      {
        severity: "error",
        message:
          "The assistant goes on without skills, since R could not list them: The assistant_skills directory /srv/skills does not exist.",
        code: "assistant_skills_failed",
      },
    ]);
    expect(requestNotifications(core)).toEqual([]);
  });

  test("hold none where R cannot list them", async () => {
    const { core } = await startAssistant({
      answers: {
        list_skills: () => {
          throw new Error("The assistant_skills directory /srv/skills does not exist.");
        },
      },
    });

    await expect(createSkills(core, new AbortController().signal).list()).resolves.toEqual([]);
  });

  test("hold none and raise assistant_skills_failed where R's reply holds no skills", async () => {
    const { core, raised } = standIn(() => Promise.resolve({ skills: [] }));

    await expect(createSkills(core, new AbortController().signal).list()).resolves.toEqual([]);
    expect(raised).toEqual([
      {
        severity: "error",
        code: "assistant_skills_failed",
        message: "The assistant goes on without skills, since R could not list them: R's reply to list_skills is not a list of skills.",
      },
    ]);
  });

  test("ask again where R's session ends before R replies, and raise nothing", async () => {
    let asked = 0;
    const { core, raised } = standIn(() => {
      asked += 1;
      return asked === 1 ? Promise.reject(sessionEnded()) : Promise.resolve(LISTED);
    });

    const listed = await createSkills(core, new AbortController().signal).list();

    expect(listed.map((skill) => skill.name)).toEqual(["exposure", "review"]);
    expect(asked).toBe(2);
    expect(raised).toEqual([]);
  });

  test("raise nothing where the next board opened before R replied", async () => {
    const opening = new AbortController();
    const { core, raised } = standIn(() => {
      opening.abort();
      return Promise.reject(new DOMException("The board ended.", "AbortError"));
    });

    await expect(createSkills(core, opening.signal).list()).resolves.toEqual([]);
    expect(raised).toEqual([]);
  });
});

// The notifications of the assistant's own that core holds, each by its
// severity, its code and its message.
function raisedBy(core: CoreApi): { severity: string; code: string | undefined; message: string }[] {
  return core.notifications
    .get()
    .filter(({ source }) => source.kind === "module")
    .map(({ severity, message, source }) => ({ severity, code: "code" in source ? source.code : undefined, message }));
}

describe("the skills, as they read a skill's text for a /name that the user types,", () => {
  test("give what R reads, through the request read_skill with the skill's name and the app's packages, and raise nothing for the warnings of R's reply", async () => {
    const { core, requests } = await startAssistant({
      answers: { list_skills: () => LISTED, read_skill: () => ["How to review."] },
      conditions: { read_skill: [{ severity: "warning", class: ["simpleWarning", "warning", "condition"], phase: "request", message: "The skill names no class." }] },
    });

    await expect(createSkills(core, new AbortController().signal).read("review")).resolves.toBe("How to review.");
    expect(requests("read_skill").map(({ args }) => args)).toEqual([{ name: "review", packages: ["blockr.core", "blockr.assistant"] }]);
    expect(requestNotifications(core)).toEqual([]);
    expect(core.notifications.get()).toEqual([]);
  });

  test("raise assistant_skills_failed where R cannot read it, with what R said, until a later read succeeds", async () => {
    let asked = 0;
    const { core } = await startAssistant({
      answers: {
        list_skills: () => LISTED,
        read_skill: () => {
          asked += 1;
          if (asked === 1) throw new Error("The file /srv/skills/review/SKILL.md is gone.");
          return ["How to review."];
        },
      },
    });
    const skills = createSkills(core, new AbortController().signal);

    await expect(skills.read("review")).rejects.toThrow();
    expect(raisedBy(core)).toEqual([
      {
        severity: "error",
        code: "assistant_skills_failed",
        message: "The chat sent nothing, since R could not read the skill review: The file /srv/skills/review/SKILL.md is gone.",
      },
    ]);
    expect(requestNotifications(core)).toEqual([]);

    await expect(skills.read("review")).resolves.toBe("How to review.");
    expect(raisedBy(core)).toEqual([]);
  });

  test("raise nothing where the next board opened before R replied", async () => {
    const opening = new AbortController();
    const { core, raised } = standIn(() => {
      opening.abort();
      return Promise.reject(new DOMException("The board ended.", "AbortError"));
    });

    await expect(createSkills(core, opening.signal).read("review")).rejects.toThrow();
    expect(raised).toEqual([]);
  });
});
