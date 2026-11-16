// The spans of a turn, which go into core's traces through the OpenTelemetry
// API that core maps on the page, under the names that ellmer gives the spans
// of today's turns (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4#proposal).
// The loop records the turn's span, invoke_agent, and a span
// execute_tool <tool> under it for each tool call (./loop.ts). It records
// them through the TelemetryContext of pi-telemetry that telemetryUnder()
// gives. The loop also gives pi the turn's span, and pi then records the span
// of each call to the model under it.
//
// - The TelemetryContext starts each span under its parent's context. While
//   the span's callback runs, the span is active. The page's
//   StackContextManager keeps a span active through synchronous calls alone.
//   So where a tool runs a command or sends a request before its first await,
//   core puts its span of it under the tool's span
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.1.14#tracing).
// - It keeps the contract of pi-telemetry, which pi's conformance suite
//   checks. A span ends once what its callback returned settles. The last
//   status set wins, and a span ignores what is called on it after it ended.
//   Where the callback throws or rejects, the span fails, unless the callback
//   set a status.
// - A failed span takes the error's message as the message of its status. It
//   takes the error's name as error.type, as OpenTelemetry's conventions name
//   the class of an error. A span that did not fail leaves its status unset,
//   as core's spans do.
// - It offers pi no metrics, since core records none in the client.
// - The span of a call to the model, which pi names pi.ai.request, takes the
//   name that ellmer gives its own, chat <model>, as a client span. Its
//   attributes take ellmer's names, which are OpenTelemetry's for generative
//   AI: model, response.id and usage.output become gen_ai.request.model,
//   gen_ai.response.id and gen_ai.usage.output_tokens. The span adds
//   gen_ai.usage.input_tokens, the sum of usage.input, usage.cache_read and
//   usage.cache_write, since ellmer counts the cached input in. It adds
//   gen_ai.operation.name as well, as ellmer does on each span. It keeps pi's
//   other attributes and events as they are.
// - The call's span names its provider after the API that the call speaks,
//   as gen_ai.provider.name: anthropic for Anthropic's Messages API, and
//   openai for both of OpenAI's APIs. That is how ellmer names a provider:
//   after its client. The attribute provider that pi sets goes, since it
//   names the loop's one provider, blockr.assistant, on every call.

import { context, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import type { Attributes, Context, Link, Span, SpanContext, Tracer } from "@opentelemetry/api";
import type { SpanAttributes, SpanLink, SpanOptions, SpanStatus, TelemetryContext, TelemetrySpan } from "@earendil-works/pi-telemetry";

// The name of the assistant's tracer, as of its package.
const SCOPE = "blockr.assistant";

// The name that pi gives the span of a call to the model.
const PI_CALL = "pi.ai.request";

// The providers by OpenTelemetry's names for them, by pi's name for the API
// that a call speaks.
const PROVIDERS = new Map([
  ["anthropic-messages", "anthropic"],
  ["openai-completions", "openai"],
  ["openai-responses", "openai"],
]);

// The attributes of pi's span of a call that take another name, by pi's name.
const RENAMED = new Map([
  ["model", "gen_ai.request.model"],
  ["response.id", "gen_ai.response.id"],
  ["usage.output", "gen_ai.usage.output_tokens"],
]);

// The attributes of pi's span of a call that count its input tokens: those
// that no cache held, those read from the cache and those written to it.
const INPUT = ["usage.input", "usage.cache_read", "usage.cache_write"] as const;

// The span context of each span that the module started, by the span that its
// callback got, so that a link to that span finds it.
const started = new WeakMap<TelemetryContext, SpanContext>();

// The TelemetryContext whose spans start under the context given.
export function telemetryUnder(parent: Context): TelemetryContext {
  return { startSpan: (options, callback) => startSpan(parent, options, callback) };
}

// The provider of a call by OpenTelemetry's name for it, for the API that the
// call speaks, by pi's name for the API. Any other API names the provider
// itself, as the fake API of the tests does.
export function providerName(api: string): string {
  return PROVIDERS.get(api) ?? api;
}

// The assistant's tracer. The module asks the API for it each time, as core
// asks for its own, since a tracer keeps the tracer provider that it first
// found, and a test sets a provider of its own up.
function tracer(): Tracer {
  return trace.getTracer(SCOPE);
}

// How a span is named, and the attributes that it records for those given.
interface Naming {
  readonly name: string;
  readonly kind: SpanKind;
  // The attributes that the span starts with.
  readonly attributes: Attributes;
  // The attributes that the span records for those that the callback sets.
  set(attributes: SpanAttributes): Attributes;
}

function startSpan<T>(parent: Context, options: SpanOptions, callback: (span: TelemetrySpan) => T | Promise<T>): Promise<T> {
  const naming = namingOf(options);
  const span = tracer().startSpan(naming.name, { kind: naming.kind, attributes: naming.attributes, links: linksOf(options.links ?? []) }, parent);
  const active = trace.setSpan(parent, span);
  let ended = false;
  let status: SpanStatus | undefined;

  const given: TelemetrySpan = {
    startSpan: (childOptions, childCallback) => (ended ? startInert(childCallback) : startSpan(active, childOptions, childCallback)),
    addLink(link) {
      const linked = ended ? undefined : linkOf(link);
      if (linked !== undefined) span.addLink(linked);
    },
    addEvent(name, attributes) {
      if (!ended) span.addEvent(name, defined(attributes ?? {}));
    },
    setAttributes(attributes) {
      if (!ended) span.setAttributes(naming.set(attributes));
    },
    setStatus(set) {
      if (!ended) status = set;
    },
  };
  started.set(given, span.spanContext());

  return settled(
    () => context.with(active, () => callback(given)),
    (failure) => {
      ended = true;
      end(span, status ?? failure);
    },
  );
}

// Runs the callback at once, and calls end once what the callback returned
// settles: with the status of the failure where the callback threw or
// rejected, and with none otherwise. It resolves and rejects as the callback
// does.
async function settled<T>(run: () => T | Promise<T>, end: (failure?: SpanStatus) => void): Promise<T> {
  let value: T;
  try {
    value = await run();
  } catch (error) {
    end(failureOf(error));
    throw error;
  }
  end();
  return value;
}

function failureOf(error: unknown): SpanStatus {
  return error instanceof Error ? { status: "error", error: { name: error.name, message: error.message } } : { status: "error" };
}

// Ends the span with the status given, where it failed.
function end(span: Span, status: SpanStatus | undefined): void {
  if (status?.status === "error") {
    const { error } = status;
    span.setStatus(error === undefined ? { code: SpanStatusCode.ERROR } : { code: SpanStatusCode.ERROR, message: error.message });
    if (error !== undefined) span.setAttribute("error.type", error.name);
  }
  span.end();
}

// A span that records nothing, which a span that ended gives a child that
// starts from it, as pi-telemetry's contract has it.
const INERT: TelemetrySpan = {
  startSpan: (_options, callback) => startInert(callback),
  addLink: () => undefined,
  addEvent: () => undefined,
  setAttributes: () => undefined,
  setStatus: () => undefined,
};

async function startInert<T>(callback: (span: TelemetrySpan) => T | Promise<T>): Promise<T> {
  return await callback(INERT);
}

// The link to a span that the module started, or undefined for a link to
// anything else, such as the context of telemetryUnder() itself, which pi's
// contract ignores.
function linkOf(link: SpanLink): Link | undefined {
  const linked = started.get(link.context);
  return linked === undefined ? undefined : { context: linked, attributes: defined(link.attributes ?? {}) };
}

function linksOf(links: readonly SpanLink[]): Link[] {
  return links.flatMap((link) => linkOf(link) ?? []);
}

// The attributes that hold a value, with each array copied, so that a change
// to an array after the call changes no span.
function defined(attributes: SpanAttributes): Attributes {
  const kept: Attributes = {};
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== undefined) kept[name] = typeof value === "object" ? value.slice() : value;
  }
  return kept;
}

// How the span of the options is named: pi's span of a call to the model as
// ellmer names its own, and any other as the options name it.
function namingOf(options: SpanOptions): Naming {
  const attributes = options.attributes ?? {};
  if (options.name !== PI_CALL) return { name: options.name, kind: SpanKind.INTERNAL, attributes: defined(attributes), set: defined };
  const set = callAttributes();
  return {
    name: typeof attributes.model === "string" ? `chat ${attributes.model}` : "chat",
    kind: SpanKind.CLIENT,
    attributes: { "gen_ai.operation.name": "chat", ...set(attributes) },
    set,
  };
}

// The attributes that a call's span records for those that pi sets, by
// ellmer's names. It keeps the input tokens that pi set so far, so that the
// sum takes each.
function callAttributes(): (attributes: SpanAttributes) => Attributes {
  const input = new Map<string, number>();
  return (attributes) => {
    const given = defined(attributes);
    const named: Attributes = {};
    for (const [name, value] of Object.entries(given)) {
      if (name === "provider") continue;
      if (name === "api" && typeof value === "string") named["gen_ai.provider.name"] = providerName(value);
      if (isInput(name) && typeof value === "number") input.set(name, value);
      named[RENAMED.get(name) ?? name] = value;
    }
    if (INPUT.some((name) => Object.hasOwn(given, name))) {
      named["gen_ai.usage.input_tokens"] = [...input.values()].reduce((sum, tokens) => sum + tokens, 0);
    }
    return named;
  };
}

function isInput(name: string): boolean {
  return (INPUT as readonly string[]).includes(name);
}
