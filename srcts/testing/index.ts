// The assistant's plugin class on blockr.core's CoreApi for tests, which the
// tests of the assistant's tools and skills share
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.1.12#testing).
// It starts core as the page of an app that runs the assistant would, with R
// played from the fixtures of core's wire protocol, so that the tests need
// neither R nor a browser.
// Core opens the board that the test gives, or else the board of core's
// fixture hello.
// A test may give block classes and board options of the package
// blockr.test, which the app offers beside core's.
// A test that asserts on what the board holds, or on what a package defines,
// gives what it asserts on.
// The test then fails where the assistant breaks, and not where core changes
// its fixture or what it defines.
// Core draws no frontend, so nothing demands a block, and every block reads
// unevaluated until something evaluates it.
// Core stops as the test finishes, and the page forgets the visitor's key
// that the class's start shares across boards, as a reload does.
// R answers each of the assistant's requests with what the test gives under
// its name, list_skills with no skill and read_template with no template
// unless the test gives one, and read_model_settings with null, as for an
// app that names no file. R's reply carries the conditions that the test
// gives under the request's name, and none unless it gives some.
// The loop runs on pi's fake provider, whose replies a test scripts, so that
// the tests call no model, and on pi's catalogs, with those of both gateways
// (../loop/catalogs.ts).
// A test records the spans that core and the assistant start in memory, with
// recordSpans() (./spans.ts).

import type { Board, Condition, CoreApi, Json, RegistryEntry } from "@blockr/core";
import { HELLO, stubCore } from "@blockr/core/stubs";
import type { Answer, StubCore, StubCoreOptions } from "@blockr/core/stubs";
import type { Api, Model, ProviderStreams } from "@earendil-works/pi-ai";
import { createFauxCore } from "@earendil-works/pi-ai/providers/faux";
import { onTestFinished } from "vitest";
import { createCatalogs, createLoop, PROVIDER } from "../loop/index.ts";
import type { CatalogParts, Catalogs, Connection, Loop } from "../loop/index.ts";
// The parts of pi, as the page's bundle of pi holds them, pi's code for each
// API, and the catalogs of the gateways' models, as the page's files of them
// hold them.
// eslint-disable-next-line no-restricted-imports
import * as pi from "../loop/vendor.ts";
// eslint-disable-next-line no-restricted-imports
import * as anthropicMessages from "../loop/vendor-anthropic-messages.ts";
// eslint-disable-next-line no-restricted-imports
import * as openaiCompletions from "../loop/vendor-openai-completions.ts";
// eslint-disable-next-line no-restricted-imports
import * as openaiResponses from "../loop/vendor-openai-responses.ts";
// eslint-disable-next-line no-restricted-imports
import { OPENROUTER_MODELS } from "../loop/vendor-openrouter.ts";
// eslint-disable-next-line no-restricted-imports
import { VERCEL_AI_GATEWAY_MODELS } from "../loop/vendor-vercel.ts";
// The module of the assistant's class, which core imports as the page does.
// eslint-disable-next-line no-restricted-imports
import * as assistant from "../modules/assistant_plugin/index.tsx";
import type { Skill, Skills } from "../skills/index.ts";
import { ASSISTANT } from "../state/index.ts";
import type { Tool, ToolResult } from "../tools/index.ts";
import { reloadPageKey } from "../visitor-key/index.ts";

export { recordSpans } from "./spans.ts";

// Pi's catalogs, with those of OpenRouter's models and of the models of
// Vercel's AI Gateway under the hosts of the gateways' base URLs, as the page
// holds them once it loaded each.
export const CATALOG_PARTS: CatalogParts = {
  pi,
  gateways: new Map<string, Readonly<Record<string, Model<Api>>>>([
    ["openrouter.ai", OPENROUTER_MODELS],
    ["ai-gateway.vercel.sh", VERCEL_AI_GATEWAY_MODELS],
  ]),
};

// The catalogs on those parts, as the calls and the footer load them for any
// base URL.
export function testCatalogs(): Promise<Catalogs> {
  return Promise.resolve(createCatalogs(CATALOG_PARTS));
}

// Pi's code for each of the three APIs that the assistant speaks, by pi's name
// for each, as the page loads that of the deployment's API.
export const APIS: Readonly<Record<string, ProviderStreams>> = {
  "anthropic-messages": anthropicMessages,
  "openai-completions": openaiCompletions,
  "openai-responses": openaiResponses,
};
export type { Recorded } from "./spans.ts";

// A request as the mock of the APIs and of the lists of models recorded it,
// which the browser tests read. They run in the page, so they import none of
// the mock's code (./mock-apis.ts).
export type { RecordedRequest } from "./mock-apis.ts";

// A request of the assistant's, as R gets it.
export interface AssistantRequest {
  readonly name: string;
  readonly args: Readonly<Record<string, Json>>;
  // The blocks that the request reads, each at its revision.
  readonly reads: readonly { readonly block: string; readonly revision: number }[];
}

// What R answers to a request of the assistant's, given the request: a value
// as R writes it, every vector as an array, or an error, which R replies with
// where the function throws.
export type Answers = Readonly<Record<string, (request: AssistantRequest) => Json | Promise<Json>>>;

export interface StartOptions {
  readonly answers?: Answers;
  // The messages and warnings that R's reply to a request of the assistant's
  // carries, under the request's name, as the request's function raised them.
  // A reply of error carries them before the error of an answer that throws.
  readonly conditions?: Readonly<Record<string, readonly Condition[]>>;
  readonly blockrOptions?: Readonly<Record<string, Json>>;
  readonly evaluate?: StubCoreOptions["evaluate"];
  // The kinds of request that the transport refuses to send, as a closed
  // transport does.
  readonly refuse?: StubCoreOptions["refuse"];
  // Whether the app sets the board lock.
  readonly locked?: boolean;
  // Plugin classes that the app runs beside the assistant and core's own, by
  // id, each with its name and its module's default export.
  readonly plugins?: Readonly<Record<string, { readonly name: string; readonly definition: unknown }>>;
  // Board options that the package blockr.test defines beside core's, by id,
  // each the default export of its module.
  readonly options?: Readonly<Record<string, unknown>>;
  // Block classes that the package blockr.test registers beside core's, each
  // as its entry in the block registry gives it (blockClass()).
  readonly blockClasses?: readonly RegistryEntry[];
  // The board that core opens in place of the board of core's fixture hello.
  // It holds the blocks, links, stacks and values of board options given, and
  // none of those that the fixture's board holds.
  readonly board?: Partial<Pick<Board, "blocks" | "links" | "stacks" | "options">>;
}

export interface Started extends StubCore {
  // Each request of the assistant's that core sent R, in order, of the name
  // given.
  readonly requests: (name: string) => AssistantRequest[];
}

// R's reply to hello in an app that runs the assistant beside core's plugins,
// with where R serves the module of the assistant's class.
export const HELLO_ASSISTANT: typeof HELLO = {
  ...HELLO,
  packages: { ...HELLO.packages, "blockr.assistant": "0.2.0" },
  plugins: {
    ...HELLO.plugins,
    [ASSISTANT]: { name: "Assistant", version: 1, module: "blockr.assistant/js/assistant_plugin.js" },
  },
};

// R's reply to hello given, with the block classes given beside the classes
// of its block registry.
// Where a board is given, the reply opens that board in place of its own.
// R writes each block of that board with the version of its class, and each
// value of a board option with the version of the board option's shape.
export function helloWith(hello: typeof HELLO, given: Pick<StartOptions, "blockClasses" | "board">): typeof HELLO {
  const registry = { ...hello.block_registry, ...Object.fromEntries((given.blockClasses ?? []).map((entry) => [entry.id, entry])) };
  if (given.board === undefined) return { ...hello, block_registry: registry };
  const { blocks = {}, links = {}, stacks = {}, options = {} } = given.board;
  return {
    ...hello,
    block_registry: registry,
    board: {
      ...hello.board,
      board: {
        ...hello.board.board,
        blocks: Object.fromEntries(Object.entries(blocks).map(([id, block]) => [id, { ...block, version: registry[block.registry_id]?.version ?? 1 }])),
        links,
        stacks,
        options: Object.fromEntries(Object.entries(options).map(([id, value]) => [id, { value, version: hello.options[id]?.version ?? 1 }])),
      },
    },
  };
}

// A block class under the registry id given, as its entry in the block
// registry gives it, with what the test gives.
// Unless the test gives them, the class has the category transform and no
// data inputs, a block of it starts with no state args, and any state fits
// the schema of its state.
export function blockClass(id: string, given: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id,
    name: id,
    description: `What ${id} does.`,
    keywords: [],
    category: "transform",
    icon: "",
    inputs: [],
    module: `blockr.test/${id}.js`,
    version: 1,
    schema: { type: "object" },
    state: {},
    requests: {},
    ...given,
  };
}

export async function startAssistant(options: StartOptions = {}): Promise<Started> {
  const answers: Answers = { list_skills: () => [], read_template: () => null, read_model_settings: () => null, ...options.answers };
  const answer: Answer = (request) => {
    const asked = assistantRequest(request);
    const answered = asked === undefined ? undefined : answers[asked.name];
    return asked === undefined || answered === undefined ? undefined : answered(asked);
  };
  const conditions: StubCoreOptions["conditions"] = (request) => {
    const asked = assistantRequest(request);
    return asked === undefined ? undefined : options.conditions?.[asked.name];
  };
  const plugins = Object.entries(options.plugins ?? {});
  const boardOptions = Object.entries(options.options ?? {});
  const stubbed = await stubCore({
    hello: helloWith(
      {
        ...HELLO_ASSISTANT,
        lock: { ...HELLO_ASSISTANT.lock, board: options.locked === true },
        plugins: {
          ...HELLO_ASSISTANT.plugins,
          ...Object.fromEntries(plugins.map(([id, { name }]) => [id, { name, version: 1, module: `app/${id}.js` }])),
        },
        options: {
          ...HELLO_ASSISTANT.options,
          ...Object.fromEntries(boardOptions.map(([id]) => [id, { package: "blockr.test", module: `blockr.test/${id}.js`, version: 1 }])),
        },
      },
      options,
    ),
    modules: {
      [ASSISTANT]: assistant,
      ...Object.fromEntries(plugins.map(([id, { definition }]) => [id, { api: 1, default: definition }])),
      ...Object.fromEntries(boardOptions.map(([id, definition]) => [id, { api: 1, default: definition }])),
    },
    answer,
    conditions,
    ...(options.blockrOptions === undefined ? {} : { blockrOptions: options.blockrOptions }),
    ...(options.evaluate === undefined ? {} : { evaluate: options.evaluate }),
    ...(options.refuse === undefined ? {} : { refuse: options.refuse }),
  });
  onTestFinished(() => {
    stubbed.stop();
    reloadPageKey();
  });
  return Object.assign(stubbed, {
    requests: (name: string) => stubbed.sent.flatMap((request) => assistantRequest(request) ?? []).filter((asked) => asked.name === name),
  });
}

// Calls the tool `name` of the tools given with the args given, as pi calls
// it once the args fit the tool's schema.
export function callTool(
  tools: readonly Tool[],
  name: string,
  given: Readonly<Record<string, Json>> = {},
  signal: AbortSignal = new AbortController().signal,
): Promise<ToolResult> {
  const called = tools.find((offered) => offered.name === name);
  if (called === undefined) throw new Error(`The tools hold no tool ${name}.`);
  return called.execute(given, signal);
}

// What a tool's result gives as JSON.
export function parsed(result: ToolResult): unknown {
  return JSON.parse(result.text);
}

// What the browser's storage given holds, as text, which a test reads to tell
// that the visitor's key is not in it.
export function storedIn(storage: Storage): string {
  return JSON.stringify(
    Array.from({ length: storage.length }, (_, index) => {
      const name = storage.key(index) ?? "";
      return [name, storage.getItem(name)];
    }),
  );
}

// The notifications that core holds for the conditions of R's replies to the
// plugins' requests, each by its severity and message.
export function requestNotifications(core: Pick<CoreApi, "notifications">): { severity: string; message: string }[] {
  return core.notifications
    .get()
    .filter(({ source }) => source.kind === "r" && source.request.type === "plugin")
    .map(({ severity, message }) => ({ severity, message }));
}

// The skills of the open board as R lists them, here those given, which R
// reads as the text that it gives each.
export function skillsHolding(...skills: readonly Skill[]): Skills {
  return {
    list: () => Promise.resolve(skills),
    read: (name) => (skills.some((given) => given.name === name) ? Promise.resolve(`The text of ${name}.`) : Promise.reject(new Error(`No skill named ${name}.`))),
  };
}

// A skill as R lists it, which the model may read and the user may not call,
// and which names no class unless given.
export function skill(name: string, given: Partial<Skill> = {}): Skill {
  return { name, description: `What ${name} covers.`, blocks: [], plugins: [], userInvocable: false, modelInvocable: true, ...given };
}

// The request as a request of the assistant's, or undefined for another.
function assistantRequest(request: Parameters<Answer>[0]): AssistantRequest | undefined {
  if (request.kind !== "request" || request.type !== "plugin" || request.plugin !== ASSISTANT) return undefined;
  return { name: request.name, args: request.args, reads: request.reads };
}

// The name of the API of pi's fake provider, which the tests' connection names.
export const FAUX_API = "faux";

export interface FauxLoop {
  // The fake provider, whose replies a test scripts with setResponses().
  readonly faux: ReturnType<typeof createFauxCore>;
  readonly loop: Loop;
  // The connection to the fake provider, which gives the key given for each
  // call.
  readonly connection: Connection;
}

export interface FauxOptions {
  // The key that the connection gives, "test-key" unless given.
  readonly key?: string | undefined;
  // How fast the fake provider streams, in tokens a second, on timers, as a
  // test that stops a reply while it streams needs. It streams each chunk on
  // a microtask of its own unless given.
  readonly tokensPerSecond?: number;
}

// The loop on pi's fake provider, whose replies carry the loop's provider and
// the fake API, so that pi takes them for replies of the model that the turn
// talks to.
export function fauxLoop(options: FauxOptions = {}): FauxLoop {
  const faux = createFauxCore({
    api: FAUX_API,
    provider: PROVIDER,
    ...(options.tokensPerSecond === undefined ? {} : { tokensPerSecond: options.tokensPerSecond }),
  });
  const key = "key" in options ? options.key : "test-key";
  return {
    faux,
    loop: createLoop(pi, CATALOG_PARTS, { [FAUX_API]: faux }),
    connection: { baseUrl: "https://faux.invalid/v1", api: FAUX_API, apiKey: () => Promise.resolve(key) },
  };
}
