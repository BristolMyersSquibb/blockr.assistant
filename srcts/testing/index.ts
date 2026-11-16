// The assistant's plugin class on blockr.core's CoreApi for tests, which the
// tests of the assistant's tools and skills share
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.1.12#testing).
// It starts core as the page of an app that runs the assistant would, on the
// board of core's fixture hello, with R played from the fixtures of core's
// wire protocol, so that the tests need neither R nor a browser. Core draws no
// frontend, so nothing demands a block, and every block reads unevaluated
// until something evaluates it. Core stops as the test finishes.
// R answers each of the assistant's requests with what the test gives under
// its name, and list_skills with no skill unless the test gives one.

import type { Json } from "@blockr/core";
import { HELLO, stubCore } from "@blockr/core/stubs";
import type { Answer, StubCore, StubCoreOptions } from "@blockr/core/stubs";
import { onTestFinished } from "vitest";
// The module of the assistant's class, which core imports as the page does.
// eslint-disable-next-line no-restricted-imports
import * as assistant from "../modules/assistant_plugin/index.tsx";
import type { Skill, Skills } from "../skills/index.ts";
import { ASSISTANT } from "../state/index.ts";
import type { Tool, ToolResult } from "../tools/index.ts";

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
  readonly blockrOptions?: Readonly<Record<string, Json>>;
  readonly evaluate?: StubCoreOptions["evaluate"];
  // Whether the app sets the board lock.
  readonly locked?: boolean;
  // Plugin classes that the app runs beside the assistant and core's own, by
  // id, each with its name and its module's default export.
  readonly plugins?: Readonly<Record<string, { readonly name: string; readonly definition: unknown }>>;
  // Board options that the package blockr.test defines beside core's, by id,
  // each the default export of its module.
  readonly options?: Readonly<Record<string, unknown>>;
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

export async function startAssistant(options: StartOptions = {}): Promise<Started> {
  const answers: Answers = { list_skills: () => [], ...options.answers };
  const answer: Answer = (request) => {
    const asked = assistantRequest(request);
    const answered = asked === undefined ? undefined : answers[asked.name];
    return asked === undefined || answered === undefined ? undefined : answered(asked);
  };
  const plugins = Object.entries(options.plugins ?? {});
  const boardOptions = Object.entries(options.options ?? {});
  const stubbed = await stubCore({
    hello: {
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
    modules: {
      [ASSISTANT]: assistant,
      ...Object.fromEntries(plugins.map(([id, { definition }]) => [id, { api: 1, default: definition }])),
      ...Object.fromEntries(boardOptions.map(([id, definition]) => [id, { api: 1, default: definition }])),
    },
    answer,
    ...(options.blockrOptions === undefined ? {} : { blockrOptions: options.blockrOptions }),
    ...(options.evaluate === undefined ? {} : { evaluate: options.evaluate }),
  });
  onTestFinished(() => {
    stubbed.stop();
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

// The skills of the open board as R lists them, here those given.
export function skillsHolding(...skills: readonly Skill[]): Skills {
  return { list: () => Promise.resolve(skills) };
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
