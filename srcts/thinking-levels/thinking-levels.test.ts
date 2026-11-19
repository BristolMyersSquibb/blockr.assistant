import { describe, expect, test } from "vitest";
import type { Deployment } from "../deployment/index.ts";
import type { Catalogs } from "../loop/index.ts";
import type { ModelSettings } from "../model-settings/index.ts";
import { testCatalogs } from "../testing/index.ts";
import { createThinkingLevels } from "./thinking-levels.ts";

const DEPLOYMENT: Deployment = { baseUrl: "https://api.openai.com/v1", api: "openai-responses", credential: { kind: "none" }, models: undefined };

// The model settings, which resolve with the settings given once the test
// lets them, and record the like that the catalogs checked.
function heldSettings(settings: ReadonlyMap<string, ModelSettings> = new Map()) {
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const checked: boolean[] = [];
  return {
    release,
    checked,
    file: {
      checked: async (inCatalog: (id: string) => boolean) => {
        checked.push(inCatalog("gpt-5.4"), inCatalog("company-gpt"));
        await released;
        return settings;
      },
    },
  };
}

describe("the thinking levels", () => {
  test("load nothing until the chat has them load", async () => {
    const asked: string[] = [];
    createThinkingLevels(new AbortController().signal, {
      deployment: Promise.resolve(DEPLOYMENT),
      settings: heldSettings().file,
      catalogs: (baseUrl) => {
        asked.push(baseUrl);
        return testCatalogs();
      },
    });
    await Promise.resolve();

    expect(asked).toEqual([]);
  });

  test("give the levels of each model once the catalogs and the model settings are in, and tell whoever follows them", async () => {
    const settings = heldSettings(new Map([["company-gpt", { reasoning: true, thinkingLevel: "high" }]]));
    const asked: string[] = [];
    const levels = createThinkingLevels(new AbortController().signal, {
      deployment: Promise.resolve(DEPLOYMENT),
      settings: settings.file,
      catalogs: (baseUrl) => {
        asked.push(baseUrl);
        return testCatalogs();
      },
    });
    let told = 0;
    levels.subscribe(() => {
      told += 1;
    });

    await levels.load();
    expect(asked).toEqual([DEPLOYMENT.baseUrl]);
    expect(settings.checked).toEqual([true, false]);
    expect(levels.current()).toBeUndefined();

    settings.release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const of = levels.current();
    expect(told).toBe(1);
    expect(of?.("gpt-5.4", undefined, undefined)).toEqual({ levels: ["off", "low", "medium", "high", "xhigh"], level: "medium" });
    expect(of?.("gpt-5.4", "minimal", undefined)).toEqual({ levels: ["off", "low", "medium", "high", "xhigh"], level: "low" });
    expect(of?.("company-gpt", undefined, undefined)).toEqual({ levels: ["off", "minimal", "low", "medium", "high"], level: "high" });
    expect(of?.("faux-1", "high", undefined)).toEqual({ levels: ["off"], level: "off" });
    expect(levels.current()).toBe(of);

    await levels.load();
    expect(asked).toHaveLength(1);
  });

  test("give nothing where the catalogs fail to load, and load them again as the chat next has them load", async () => {
    let failing = true;
    const levels = createThinkingLevels(new AbortController().signal, {
      deployment: Promise.resolve(DEPLOYMENT),
      settings: { checked: () => Promise.resolve(new Map()) },
      catalogs: (): Promise<Catalogs> => (failing ? Promise.reject(new Error("Failed to fetch dynamically imported module")) : testCatalogs()),
    });

    await expect(levels.load()).resolves.toBeUndefined();
    expect(levels.current()).toBeUndefined();

    failing = false;
    await levels.load();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(levels.current()?.("gpt-5.4", undefined, undefined).levels).toEqual(["off", "low", "medium", "high", "xhigh"]);
  });

  test("give nothing where the deployment's blockr options cannot be read", async () => {
    const deployment = Promise.reject(new Error("The blockr option assistant_api holds a value that it does not take."));
    deployment.catch(() => undefined);
    const levels = createThinkingLevels(new AbortController().signal, {
      deployment,
      settings: { checked: () => Promise.resolve(new Map()) },
      catalogs: testCatalogs,
    });

    await expect(levels.load()).resolves.toBeUndefined();
    expect(levels.current()).toBeUndefined();
  });

  test("give nothing once the next board opened", async () => {
    const opening = new AbortController();
    const settings = heldSettings();
    const levels = createThinkingLevels(opening.signal, { deployment: Promise.resolve(DEPLOYMENT), settings: settings.file, catalogs: testCatalogs });

    await levels.load();
    opening.abort();
    settings.release();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(levels.current()).toBeUndefined();
  });
});
