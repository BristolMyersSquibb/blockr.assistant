import { OPENAI_MODELS } from "@earendil-works/pi-ai/providers/openai.models";
import { OPENROUTER_MODELS } from "@earendil-works/pi-ai/providers/openrouter.models";
import { describe, expect, test } from "vitest";
import type { ModelSettings } from "../model-settings/index.ts";
import type { ThinkingLevel } from "../state/index.ts";
import { CATALOG_PARTS } from "../testing/index.ts";
import { createCatalogs, loadCatalogParts } from "./catalogs.ts";

const catalogs = createCatalogs(CATALOG_PARTS);

const RESPONSES = { baseUrl: "https://api.openai.com/v1", api: "openai-responses" };
const COMPLETIONS = { baseUrl: "https://proxy.invalid/v1", api: "openai-completions" };
const ANTHROPIC = { baseUrl: "https://api.anthropic.com", api: "anthropic-messages" };
const OPENROUTER = { baseUrl: "https://openrouter.ai/api/v1", api: "openai-completions" };
const VERCEL = { baseUrl: "https://ai-gateway.vercel.sh", api: "anthropic-messages" };

describe("the catalogs", () => {
  test("hold the models of pi's catalogs of OpenAI's and Anthropic's models, by their ids, for a like", () => {
    expect(["gpt-5.4", "claude-sonnet-5-5", "company-gpt", "openai/gpt-5.4"].map((id) => catalogs.inCatalog(id))).toEqual([true, true, false, false]);
  });

  test("give the context window of a model as pi takes it, from the model settings, the catalog, the list or the default", () => {
    expect(catalogs.contextWindow({ connection: RESPONSES, model: "gpt-5.4" })).toBe(OPENAI_MODELS["gpt-5.4"].contextWindow);
    expect(catalogs.contextWindow({ connection: RESPONSES, model: "gpt-5.4", settings: { contextWindow: 100_000 } })).toBe(100_000);
    expect(catalogs.contextWindow({ connection: COMPLETIONS, model: "deepseek/deepseek-v3.2", listed: { contextWindow: 163_840 } })).toBe(163_840);
    expect(catalogs.contextWindow({ connection: COMPLETIONS, model: "company-gpt" })).toBe(128_000);
  });

  test("give the context window of a model of a gateway's catalog where the base URL is the gateway's", () => {
    expect(catalogs.contextWindow({ connection: OPENROUTER, model: "openai/gpt-5.4", listed: { contextWindow: 100_000 } })).toBe(
      OPENROUTER_MODELS["openai/gpt-5.4"].contextWindow,
    );
    expect(catalogs.contextWindow({ connection: COMPLETIONS, model: "openai/gpt-5.4", listed: { contextWindow: 100_000 } })).toBe(100_000);
  });
});

describe("the thinking levels of a model", () => {
  test.each<{
    readonly what: string;
    readonly connection: { readonly baseUrl: string; readonly api: string };
    readonly model: string;
    readonly settings?: ModelSettings;
    readonly levels: readonly ThinkingLevel[];
  }>([
    { what: "those of pi's catalog for a model of it", connection: RESPONSES, model: "gpt-5.4", levels: ["off", "low", "medium", "high", "xhigh"] },
    { what: "those of the model that the like names", connection: ANTHROPIC, model: "corp-claude", settings: { like: "claude-opus-5-5" }, levels: ["low", "medium", "high", "xhigh", "max"] },
    { what: "off alone for a model that does not reason", connection: COMPLETIONS, model: "company-gpt", levels: ["off"] },
    { what: "off to high for a model that the model settings say reasons", connection: COMPLETIONS, model: "company-gpt", settings: { reasoning: true }, levels: ["off", "minimal", "low", "medium", "high"] },
    { what: "off alone for a model of the catalog that the model settings say does not reason", connection: RESPONSES, model: "gpt-5.4", settings: { reasoning: false }, levels: ["off"] },
    { what: "none on Chat Completions for a model of pi's catalog of OpenAI's models", connection: COMPLETIONS, model: "gpt-5.4", levels: [] },
    { what: "none on Chat Completions for a model whose like names one", connection: COMPLETIONS, model: "corp-gpt", settings: { like: "gpt-5.4" }, levels: [] },
    { what: "those of pi's catalog of OpenRouter's models at OpenRouter's base URL", connection: OPENROUTER, model: "openai/gpt-5.4", levels: ["off", "low", "medium", "high", "xhigh"] },
    { what: "those of pi's catalog of the models of Vercel's AI Gateway at its base URL", connection: VERCEL, model: "anthropic/claude-sonnet-4.5", levels: ["off", "minimal", "low", "medium", "high"] },
    { what: "off alone for a model of a gateway's catalog at another base URL", connection: COMPLETIONS, model: "openai/gpt-5.4", levels: ["off"] },
  ])("are $what", ({ connection, model, settings, levels }) => {
    expect(catalogs.thinkingLevels({ connection, model, ...(settings === undefined ? {} : { settings }) })).toEqual(levels);
  });

  test.each<{
    readonly what: string;
    readonly connection: { readonly baseUrl: string; readonly api: string };
    readonly model: string;
    readonly settings?: ModelSettings;
    readonly thinkingLevel?: ThinkingLevel;
    readonly level: ThinkingLevel;
  }>([
    { what: "medium without a pick", connection: RESPONSES, model: "gpt-5.4", level: "medium" },
    { what: "the level of the model settings without a pick", connection: RESPONSES, model: "gpt-5.4", settings: { thinkingLevel: "low" }, level: "low" },
    { what: "the pick, before the level of the model settings", connection: RESPONSES, model: "gpt-5.4", settings: { thinkingLevel: "low" }, thinkingLevel: "xhigh", level: "xhigh" },
    { what: "the next level up that the model takes, for a pick that it does not take", connection: RESPONSES, model: "gpt-5.4", thinkingLevel: "max", level: "xhigh" },
    { what: "the level that the model takes, for a model that takes one", connection: RESPONSES, model: "gpt-5-pro", level: "high" },
    { what: "off on Chat Completions for a model of pi's catalog of OpenAI's models, whatever the pick", connection: COMPLETIONS, model: "gpt-5.4", thinkingLevel: "high", level: "off" },
    { what: "off for a model that does not reason, whatever the pick", connection: COMPLETIONS, model: "company-gpt", thinkingLevel: "high", level: "off" },
    { what: "medium at OpenRouter's base URL, for a model of its catalog", connection: OPENROUTER, model: "openai/gpt-5.4", level: "medium" },
    { what: "medium for a level of the model settings that the model does not take", connection: RESPONSES, model: "gpt-5", settings: { thinkingLevel: "off" }, level: "medium" },
    { what: "medium, moved to a level that the model takes, for such a level", connection: RESPONSES, model: "gpt-5-pro", settings: { thinkingLevel: "low" }, level: "high" },
    { what: "off on Chat Completions for such a level of a model of pi's catalog of OpenAI's models", connection: COMPLETIONS, model: "gpt-5.4", settings: { thinkingLevel: "minimal" }, level: "off" },
  ])("is $what", ({ connection, model, settings, thinkingLevel, level }) => {
    expect(
      catalogs.thinkingLevel({ connection, model, ...(settings === undefined ? {} : { settings }), ...(thinkingLevel === undefined ? {} : { thinkingLevel }) }),
    ).toBe(level);
  });
});

describe("loading the catalogs", () => {
  test("loads the catalog of OpenRouter's models where the base URL is OpenRouter's alone, once for each", async () => {
    const atOpenRouter = loadCatalogParts("https://openrouter.ai/api/v1");
    const elsewhere = loadCatalogParts("https://api.openai.com/v1");

    expect(loadCatalogParts("https://openrouter.ai/api/v1")).toBe(atOpenRouter);
    expect([...(await atOpenRouter).gateways.keys()]).toEqual(["openrouter.ai"]);
    expect((await atOpenRouter).gateways.get("openrouter.ai")).toBe(OPENROUTER_MODELS);
    expect([...(await elsewhere).gateways.keys()]).toEqual([]);
    expect(Object.hasOwn((await elsewhere).pi.OPENAI_MODELS, "gpt-5.4")).toBe(true);
  });
});
