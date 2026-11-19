// The catalogs: pi's catalogs of models, by which the loop builds the model
// that a call talks to, and which give the thinking levels that the model
// takes (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.1#the-models-settings):
// - The catalogs of OpenAI's and of Anthropic's models come in pi's bundle,
//   with pi's two functions of the levels that a model takes (./vendor.ts),
//   wherever the calls go.
// - Pi's catalog of OpenRouter's models loads where the base URL is
//   OpenRouter's, and that of the models of Vercel's AI Gateway where the base
//   URL is the gateway's, as the host of the base URL tells, each in a file of
//   its own (./vendor-openrouter.ts, ./vendor-vercel.ts). A model of such a
//   gateway has an id of the gateway's, such as openai/gpt-5.4, which the
//   catalogs of OpenAI's and of Anthropic's models lack.
// The chat has pi's bundle start to download as it first mounts, beside the
// chat's libraries, and loads the catalogs once the deployment's base URL is
// known, so that the footer knows the levels of each model as it first draws
// (../chat/panel.tsx, ../thinking-levels). The calls take them from there
// (../turns/prepare.ts). Each file loads once for the page, and again where it
// failed.
//
// The thinking level of a call, a turn's or a model call of the plugin's own
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-model):
// - A call takes the conversation's pick of the level, where the pick applies
//   to the model. It applies everywhere but on OpenAI's Chat Completions API
//   for a model of pi's catalog of OpenAI's models. There OpenAI refuses
//   function tools with any reasoning effort but none for the GPT-5.4 models,
//   and documents no list of the models that it refuses them for
//   (blockr.assistant#260). The catalogs find the model in the catalog by the
//   like that the deployment's model settings give it, or else by its id.
// - Without a pick, or where the pick does not apply, a call takes the level
//   that the deployment's model settings give the model, where the model
//   takes that level. A level that the model does not take counts as none.
// - Otherwise a call takes the default: the level off on Chat Completions for
//   a model of pi's catalog of OpenAI's models, and the level medium
//   everywhere else.
// - Where the pick applies, pi's clampThinkingLevel() moves a picked level, or
//   the default, to the next level up that the model takes, or else to the
//   next one down. A model that does not reason takes the level off alone.
// - A conversation may pick from the levels that pi's
//   getSupportedThinkingLevels() gives the model, where the pick applies to
//   it. Pi leaves out each level that the model's thinkingLevelMap maps to
//   null, and xhigh and max where the map does not name them.
// For the level off, the loop gives pi no level, which pi then sends as the
// effort that the catalog gives the model for off, such as none for the
// GPT-5.4 models (./loop.ts). Where the catalog gives the model no effort for
// off, as for gpt-5 and o3, pi sends no effort at all, and the model reasons
// as its provider has it.

import type { Api, Model } from "@earendil-works/pi-ai";
import type { ListedSettings, ModelSettings } from "../model-settings/index.ts";
import type { ThinkingLevel } from "../state/index.ts";
import type { Connection } from "./loop.ts";
import type * as vendor from "./vendor.ts";

// The id of the provider through which every call goes. It names no service,
// since the base URL of a deployment may belong to any.
export const PROVIDER = "blockr.assistant";

// OpenRouter's base URL, as a deployment gives it.
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// The model that a call talks to, which a turn and a model call of the
// plugin's own both name: where the call goes, the model's id, its settings,
// and the conversation's pick of the thinking level.
export interface CallModel {
  readonly connection: Connection;
  // The id of the model, such as "gpt-5.4".
  readonly model: string;
  // The settings that the deployment's model settings give the model, and
  // those that the base URL's list gives it, where either gives any.
  readonly settings?: ModelSettings | undefined;
  readonly listed?: ListedSettings | undefined;
  // The conversation's pick of the thinking level, where it picked one.
  readonly thinkingLevel?: ThinkingLevel | undefined;
}

// The model that a call talks to, as the catalogs read it: of its connection,
// they read where the calls go alone, the base URL and the API.
export type ModelAt = Omit<CallModel, "connection"> & { readonly connection: Pick<Connection, "baseUrl" | "api"> };

// What the catalogs give of a model.
export interface Catalogs {
  // Whether pi's catalog of OpenAI's or of Anthropic's models holds a model
  // of the id given, whose settings a model of the deployment's model
  // settings may take through its like.
  inCatalog(id: string): boolean;
  // The context window of the model, in tokens, as the loop gives it to pi.
  contextWindow(model: ModelAt): number;
  // The thinking levels that a conversation may pick for the model, from none
  // to the most, or none where the conversation's pick does not apply to the
  // model.
  thinkingLevels(model: ModelAt): readonly ThinkingLevel[];
  // The thinking level at which the model's calls reason, given the
  // conversation's pick.
  thinkingLevel(model: ModelAt): ThinkingLevel;
}

// A catalog of pi's: its models, by id.
type Catalog = Readonly<Record<string, Model<Api>>>;

// The parts of pi that the catalogs read: pi's catalogs of OpenAI's and of
// Anthropic's models, with its two functions of the levels, and the catalogs
// of the gateways that loaded, by the host of each gateway's base URL.
export interface CatalogParts {
  readonly pi: Pick<typeof vendor, "ANTHROPIC_MODELS" | "OPENAI_MODELS" | "clampThinkingLevel" | "getSupportedThinkingLevels">;
  readonly gateways: ReadonlyMap<string, Catalog>;
}

// The gateways whose catalogs pi holds, by the host of their base URL, each
// with the import of its catalog.
const GATEWAYS: ReadonlyMap<string, () => Promise<Catalog>> = new Map<string, () => Promise<Catalog>>([
  ["openrouter.ai", async () => (await import("./vendor-openrouter.ts")).OPENROUTER_MODELS],
  ["ai-gateway.vercel.sh", async () => (await import("./vendor-vercel.ts")).VERCEL_AI_GATEWAY_MODELS],
]);

// The parts that load, or loaded, for the calls to each gateway, by its host,
// and for those to any other base URL, under "".
const loading = new Map<string, Promise<CatalogParts>>();

// Has the browser start to import pi's bundle, which holds the catalogs of
// OpenAI's and of Anthropic's models, before the base URL is known, since the
// bundle is the same for every base URL. The catalogs then take the import
// that it started. Where it fails, the catalogs fail as they load.
export function preloadCatalogs(): void {
  void import("./vendor.ts").catch(() => undefined);
}

// The catalogs for the calls to the base URL, which load once for the page.
export async function loadCatalogs(baseUrl: string): Promise<Catalogs> {
  return createCatalogs(await loadCatalogParts(baseUrl));
}

// The parts of pi that the catalogs read for the calls to the base URL, which
// load once for the page, and again where they failed.
export function loadCatalogParts(baseUrl: string): Promise<CatalogParts> {
  const host = gatewayOf(baseUrl) ?? "";
  const loaded = loading.get(host);
  if (loaded !== undefined) return loaded;
  const gateway = GATEWAYS.get(host);
  const parts = Promise.all([import("./vendor.ts"), gateway?.()]).then(
    ([pi, models]): CatalogParts => ({ pi, gateways: new Map(models === undefined ? [] : [[host, models]]) }),
  );
  loading.set(host, parts);
  parts.catch(() => {
    if (loading.get(host) === parts) loading.delete(host);
  });
  return parts;
}

// The catalogs on the parts given.
export function createCatalogs(parts: CatalogParts): Catalogs {
  return {
    inCatalog: (id) => knownModel(parts.pi, id) !== undefined,
    contextWindow: (called) => buildModel(parts, called).contextWindow,
    thinkingLevels: (called) => (levelApplies(parts, called) ? parts.pi.getSupportedThinkingLevels(buildModel(parts, called)) : []),
    thinkingLevel: (called) => levelOf(parts, called, buildModel(parts, called)),
  };
}

// The model that the call talks to, at the connection's base URL, in its API,
// through the plugin's provider. It takes each setting from the first of these
// that gives it
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.1#the-models-settings):
// 1. The deployment's model settings, which give the model's settings by its
//    id (../model-settings).
// 2. The model of pi's catalog of OpenAI's or of Anthropic's models that the
//    model settings name in like, or else the catalogs' model of the same id,
//    in those catalogs or in the catalog of the gateway that the base URL
//    names. Such a model takes the catalog's settings, such as the thinking
//    that it takes, which Anthropic's current models refuse in any other form,
//    and the levels that it takes. It takes the catalog's settings for the API
//    alone where the catalog's model speaks the connection's API.
// 3. The base URL's list of models, which may give the model's context window,
//    its cap for a reply and whether it takes images (../models).
// 4. Settings that every API takes:
//    - The model does not reason, so that pi sends no reasoning effort and
//      asks for no thinking, which a model that does not reason refuses, and
//      the model reasons as its provider has it, as today's calls leave it
//      to.
//    - It takes images, so that the plots of inspect_results reach the model,
//      as today's assistant sends them to every model.
//    - Its context window holds 128,000 tokens, as gpt-4o's does, and each
//      call asks for up to 16,384 tokens for its reply, the most that gpt-4o
//      takes. The cap goes out with every call, and pi lowers it only as the
//      input nears the window.
//    - Its cost is unknown, so pi counts none.
//
// A model whose id starts with anthropic/, on OpenRouter's Chat Completions,
// also takes pi's compat with Anthropic's format of cache marks.
// Through OpenRouter, Anthropic's cache keeps only what a call marks
// (https://openrouter.ai/docs/features/prompt-caching), and pi marks the
// calls of such a model only where its provider is named openrouter.
export function buildModel(parts: CatalogParts, called: ModelAt): Model<Api> {
  const { connection, model: id } = called;
  const given = called.settings ?? {};
  const listed = called.listed ?? {};
  const at = { id, api: connection.api, provider: PROVIDER, baseUrl: connection.baseUrl };
  const known = given.like === undefined ? (knownModel(parts.pi, id) ?? gatewayModel(parts, connection.baseUrl, id)) : knownModel(parts.pi, given.like);
  // The catalog's headers belong to the catalog's provider, so they go.
  const base: Model<Api> =
    known === undefined
      ? {
          ...at,
          name: id,
          reasoning: false,
          input: includeImages(["text", "image"], listed.images),
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: listed.contextWindow ?? 128_000,
          maxTokens: listed.maxTokens ?? 16_384,
        }
      : { ...known, ...at, headers: undefined, compat: known.api === connection.api ? known.compat : undefined };
  const anthropicOnOpenRouter = connection.api === "openai-completions" && connection.baseUrl === OPENROUTER_BASE_URL && id.startsWith("anthropic/");
  return {
    ...base,
    reasoning: given.reasoning ?? base.reasoning,
    input: includeImages(base.input, given.images),
    contextWindow: given.contextWindow ?? base.contextWindow,
    maxTokens: given.maxTokens ?? base.maxTokens,
    ...(anthropicOnOpenRouter ? { compat: { ...base.compat, cacheControlFormat: "anthropic" as const } } : {}),
  };
}

// The thinking level at which the model's calls reason, given the
// conversation's pick, for the model that buildModel() gave.
export function levelOf(parts: CatalogParts, called: ModelAt, model: Model<Api>): ThinkingLevel {
  // The level that the model settings give the model, where the model takes it.
  const given = called.settings?.thinkingLevel;
  const fromSettings = given !== undefined && parts.pi.getSupportedThinkingLevels(model).includes(given) ? given : undefined;
  if (!levelApplies(parts, called)) return fromSettings ?? "off";
  return parts.pi.clampThinkingLevel(model, called.thinkingLevel ?? fromSettings ?? "medium");
}

// Whether the conversation's pick of the level applies to the model: anywhere
// but on Chat Completions for a model of pi's catalog of OpenAI's models.
function levelApplies(parts: CatalogParts, called: ModelAt): boolean {
  return called.connection.api !== "openai-completions" || !Object.hasOwn(parts.pi.OPENAI_MODELS, called.settings?.like ?? called.model);
}

// The inputs of a model, with images or without them, as the setting given
// says, or as they are where it says nothing.
function includeImages(input: Model<Api>["input"], images: boolean | undefined): Model<Api>["input"] {
  if (images === undefined) return input;
  const others = input.filter((kind) => kind !== "image");
  return images ? [...others, "image"] : others;
}

// The model of the id given in pi's catalog of OpenAI's or of Anthropic's
// models, or undefined.
function knownModel(pi: CatalogParts["pi"], id: string): Model<Api> | undefined {
  for (const catalog of [pi.ANTHROPIC_MODELS, pi.OPENAI_MODELS] as readonly Catalog[]) {
    if (Object.hasOwn(catalog, id)) return catalog[id];
  }
  return undefined;
}

// The model of the id given in pi's catalog of the gateway that the base URL
// names, or undefined.
function gatewayModel(parts: CatalogParts, baseUrl: string, id: string): Model<Api> | undefined {
  const host = gatewayOf(baseUrl);
  const catalog = host === undefined ? undefined : parts.gateways.get(host);
  return catalog !== undefined && Object.hasOwn(catalog, id) ? catalog[id] : undefined;
}

// The host of the base URL, where it is that of a gateway whose catalog pi
// holds, or undefined.
function gatewayOf(baseUrl: string): string | undefined {
  let host: string;
  try {
    host = new URL(baseUrl).host;
  } catch {
    return undefined;
  }
  return GATEWAYS.has(host) ? host : undefined;
}
