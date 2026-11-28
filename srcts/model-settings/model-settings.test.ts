// The deployment's model settings, which the class's start has R read, on
// blockr.core's CoreApi for tests, and on a stand-in for what of CoreApi they
// read where a test needs a reply or a failure that the stub cannot play.

import type { CoreApi, Json, PluginClassId, Raised } from "@blockr/core";
import { id } from "@blockr/core/stubs";
import { describe, expect, test, vi } from "vitest";
import { requestNotifications, startAssistant } from "../testing/index.ts";
import { createModelSettings } from "./index.ts";

// R's reply for a file that gives two models their settings, as R writes it,
// every vector as an array, and a third model's id alone.
const READ = {
  "corp-claude": { like: ["claude-sonnet-5-5"] },
  "corp-gpt": { reasoning: [true], thinking_level: ["high"], images: [false], context_window: [200000], max_tokens: [32000] },
  "corp-mini": null,
};

const HELD = new Map([
  ["corp-claude", { like: "claude-sonnet-5-5" }],
  ["corp-gpt", { reasoning: true, thinkingLevel: "high", images: false, contextWindow: 200000, maxTokens: 32000 }],
  ["corp-mini", {}],
]);

// Whether pi's catalogs hold a model of the id, here for two of their ids.
const inCatalog = (id: string): boolean => id === "claude-sonnet-5-5" || id === "gpt-5.4";

// What of CoreApi the settings read, whose request() answers as `request` does,
// whose notify() records what it raises, and whose ids are those that the
// stubs give, which are core's.
function standIn(request: () => Promise<Json | Blob>) {
  const raised: Raised[] = [];
  const core = {
    request: vi.fn(request) as unknown as CoreApi["request"],
    notifications: {
      notify: (_plugin: PluginClassId, notification: Raised) => {
        raised.push(notification);
        return () => undefined;
      },
    },
    id,
  };
  return { core, raised };
}

function sessionEnded(): Error {
  const error = new Error("The session ended before R replied to request 7.");
  error.name = "SessionEndedError";
  return error;
}

const FILE = "the file that the blockr option assistant_model_settings names";

describe("the deployment's model settings", () => {
  test("are read by the class's start as the board opens", async () => {
    const { requests, settled } = await startAssistant({ answers: { read_model_settings: () => READ } });
    await settled();

    expect(requests("read_model_settings").map(({ args, reads }) => ({ args, reads }))).toEqual([{ args: {}, reads: [] }]);
  });

  test("hold the settings that the file gives each model, by the model's id", async () => {
    const { core } = await startAssistant({ answers: { read_model_settings: () => READ } });

    await expect(createModelSettings(core, new AbortController().signal).checked(inCatalog)).resolves.toEqual(HELD);
  });

  test("hold none, and raise nothing, where the option names no file", async () => {
    const { core, settled } = await startAssistant();
    await settled();

    await expect(createModelSettings(core, new AbortController().signal).checked(inCatalog)).resolves.toEqual(new Map());
    expect(core.notifications.get()).toEqual([]);
  });

  test("raise assistant_model_settings_failed where R cannot read the file, with what R said, and core raises no notification of R's error beside it", async () => {
    const { core, settled } = await startAssistant({
      answers: {
        read_model_settings: () => {
          throw new Error("R cannot read the model settings /srv/models.yml that the blockr option assistant_model_settings names: cannot open the connection");
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
          "The assistant goes on without the deployment's model settings, since R could not read them: R cannot read the model settings /srv/models.yml that the blockr option assistant_model_settings names: cannot open the connection",
        code: "assistant_model_settings_failed",
      },
    ]);
    expect(requestNotifications(core)).toEqual([]);
  });

  test("hold none where R cannot read the file", async () => {
    const { core } = await startAssistant({
      answers: {
        read_model_settings: () => {
          throw new Error("R cannot read the model settings.");
        },
      },
    });

    await expect(createModelSettings(core, new AbortController().signal).checked(inCatalog)).resolves.toEqual(new Map());
  });

  test.each<{ readonly what: string; readonly reply: Json; readonly why: string }>([
    { what: "a list of models", reply: ["corp-gpt"], why: `${FILE} gives "corp-gpt", where it gives each model's settings by the model's id.` },
    { what: "a model without settings by their names", reply: { "corp-gpt": [true] }, why: `${FILE} gives the model corp-gpt true, where it gives the model's settings by their names, such as reasoning: true.` },
    {
      what: "a setting that the assistant does not know",
      reply: { "corp-gpt": { context_windows: [200000] } },
      why: `${FILE} gives the model corp-gpt the setting context_windows, which the assistant does not know. A model's settings are like, reasoning, thinking_level, images, context_window and max_tokens.`,
    },
    { what: "a reasoning that is no true or false", reply: { "corp-gpt": { reasoning: ["yes"] } }, why: `${FILE} gives the model corp-gpt the reasoning "yes", where reasoning takes true or false.` },
    {
      what: "a thinking level that pi does not have",
      reply: { "corp-gpt": { thinking_level: ["none"] } },
      why: `${FILE} gives the model corp-gpt the thinking_level "none", where thinking_level takes off, minimal, low, medium, high, xhigh or max.`,
    },
    {
      what: "a thinking level that is no word",
      reply: { "corp-gpt": { thinking_level: [false] } },
      why: `${FILE} gives the model corp-gpt the thinking_level false, where thinking_level takes off, minimal, low, medium, high, xhigh or max.`,
    },
    { what: "images that are no true or false", reply: { "corp-gpt": { images: [1] } }, why: `${FILE} gives the model corp-gpt the images 1, where images takes true or false.` },
    {
      what: "a context window that is no whole number",
      reply: { "corp-gpt": { context_window: ["1e6"] } },
      why: `${FILE} gives the model corp-gpt the context_window "1e6", where context_window takes a whole number of tokens above 0, such as 128000.`,
    },
    {
      what: "a cap of no tokens",
      reply: { "corp-gpt": { max_tokens: [0] } },
      why: `${FILE} gives the model corp-gpt the max_tokens 0, where max_tokens takes a whole number of tokens above 0, such as 128000.`,
    },
    {
      what: "two values for one setting",
      reply: { "corp-gpt": { max_tokens: [8000, 16000] } },
      why: `${FILE} gives the model corp-gpt the max_tokens [8000,16000], where max_tokens takes a whole number of tokens above 0, such as 128000.`,
    },
    {
      what: "a like that is no id",
      reply: { "corp-claude": { like: [""] } },
      why: `${FILE} gives the model corp-claude the like "", where like takes the id of a model of pi's catalogs of OpenAI's and Anthropic's models, such as claude-sonnet-5-5.`,
    },
  ])("hold none, and raise assistant_model_settings_failed, for $what", async ({ reply, why }) => {
    const { core, raised } = standIn(() => Promise.resolve(reply));

    await expect(createModelSettings(core, new AbortController().signal).checked(inCatalog)).resolves.toEqual(new Map());
    expect(raised).toEqual([{ severity: "error", code: "assistant_model_settings_failed", message: `The assistant goes on without the deployment's model settings, since ${why}` }]);
  });

  test("hold none, and raise assistant_model_settings_failed, where a like names no model of pi's catalogs", async () => {
    const { core, raised } = standIn(() => Promise.resolve({ ...READ, "corp-opus": { like: ["claude-opus-9"] } }));

    await expect(createModelSettings(core, new AbortController().signal).checked(inCatalog)).resolves.toEqual(new Map());
    expect(raised).toEqual([
      {
        severity: "error",
        code: "assistant_model_settings_failed",
        message: `The assistant goes on without the deployment's model settings, since ${FILE} gives the model corp-opus the like "claude-opus-9", which names no model of pi's catalogs of OpenAI's and Anthropic's models.`,
      },
    ]);
  });

  test("check each like once, however often the turns ask, and ask R once", async () => {
    const { core } = standIn(() => Promise.resolve(READ));
    const asked: string[] = [];
    const settings = createModelSettings(core, new AbortController().signal);
    const counting = (id: string): boolean => {
      asked.push(id);
      return inCatalog(id);
    };

    await settings.checked(counting);
    await expect(settings.checked(counting)).resolves.toEqual(HELD);

    expect(asked).toEqual(["claude-sonnet-5-5"]);
    expect(core.request).toHaveBeenCalledTimes(1);
  });

  test("ask again where R's session ends before R replies, and raise nothing", async () => {
    let asked = 0;
    const { core, raised } = standIn(() => {
      asked += 1;
      return asked === 1 ? Promise.reject(sessionEnded()) : Promise.resolve(READ);
    });

    await expect(createModelSettings(core, new AbortController().signal).checked(inCatalog)).resolves.toEqual(HELD);
    expect(asked).toBe(2);
    expect(raised).toEqual([]);
  });

  test("raise nothing where the next board opened before R replied", async () => {
    const opening = new AbortController();
    const { core, raised } = standIn(() => {
      opening.abort();
      return Promise.reject(new DOMException("The board ended.", "AbortError"));
    });

    await expect(createModelSettings(core, opening.signal).checked(inCatalog)).resolves.toEqual(new Map());
    expect(raised).toEqual([]);
  });
});
