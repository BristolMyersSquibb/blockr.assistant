// The TelemetryContext over OpenTelemetry's API (./telemetry.ts), recorded in
// memory through OpenTelemetry's SDK, as core sets it up on the page: pi's
// conformance suite, and ellmer's names for the span of a call to the model.

import { ROOT_CONTEXT, SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type { SpanContext } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace";
import type { RecordedTelemetrySpan, SpanAttributes, SpanStatus, TelemetryCarrier } from "@earendil-works/pi-telemetry";
import { createTelemetryAdapterConformance } from "@earendil-works/pi-telemetry/testing";
import type { TelemetryAdapterFixture } from "@earendil-works/pi-telemetry/testing";
import { describe, expect, test } from "vitest";
import { recordSpans } from "../testing/index.ts";
import { providerName, telemetryUnder } from "./telemetry.ts";

// The spans as pi's conformance suite reads them, in the order that they
// ended. Each span's id is its place in that order, and its parent's id the
// parent's place, or null for a root. A failed span gives the name of its
// error from error.type, which the TelemetryContext sets beside the status.
function normalized(spans: readonly ReadableSpan[]): RecordedTelemetrySpan[] {
  const ended = new Map(spans.map((span, at) => [span.spanContext().spanId, at]));
  return spans.map((span, at) => {
    const parent = span.parentSpanContext;
    const { "error.type": failed, ...attributes } = span.attributes;
    return {
      id: at,
      parentId: parent === undefined ? null : (ended.get(parent.spanId) ?? null),
      context: carrier(span.spanContext()),
      parentContext: parent === undefined ? null : carrier(parent),
      links: span.links.map((link) => ({ context: carrier(link.context), attributes: (link.attributes ?? {}) as SpanAttributes })),
      name: span.name,
      attributes: attributes as SpanAttributes,
      events: span.events.map((event) => ({ name: event.name, attributes: (event.attributes ?? {}) as SpanAttributes })),
      status: statusOf(span, failed),
      settled: span.ended,
      endSequence: at,
    };
  });
}

function carrier({ traceId, spanId }: SpanContext): TelemetryCarrier {
  return { traceId, spanId };
}

function statusOf(span: ReadableSpan, failed: unknown): SpanStatus {
  if (span.status.code !== SpanStatusCode.ERROR) return { status: "ok" };
  return typeof failed === "string" ? { status: "error", error: { name: failed, message: span.status.message ?? "" } } : { status: "error" };
}

const conformance = createTelemetryAdapterConformance(() => {
  const recorded = recordSpans();
  return Promise.resolve({
    context: telemetryUnder(ROOT_CONTEXT),
    getSpans: () => Promise.resolve(normalized(recorded.spans())),
    [Symbol.asyncDispose]() {
      recorded.stop();
      return Promise.resolve();
    },
  } satisfies TelemetryAdapterFixture);
});

describe("the TelemetryContext, by pi's conformance suite", () => {
  for (const conformanceCase of conformance) {
    test(`${conformanceCase.group}: ${conformanceCase.name}`, () => conformanceCase.run());
  }
});

describe("the span of a call to the model", () => {
  test("takes ellmer's names: chat <model>, a client span, with pi's attributes by OpenTelemetry's names for generative AI", async () => {
    const recorded = recordSpans();

    await telemetryUnder(ROOT_CONTEXT).startSpan(
      { name: "pi.ai.request", attributes: { provider: "blockr.assistant", api: "anthropic-messages", model: "claude-haiku-5-5", reasoning: "medium" } },
      (span) => {
        span.addEvent("pi.ai.first_chunk");
        span.addEvent("pi.ai.block", { type: "text", index: 0, chars: 42 });
        span.setAttributes({
          stop: "stop",
          "usage.input": 12,
          "usage.output": 30,
          "usage.cache_read": 400,
          "usage.cache_write": 50,
          "cost.total": 0.002,
          "response.id": "msg_1",
        });
      },
    );

    const call = recorded.span("chat claude-haiku-5-5");
    expect(call.kind).toBe(SpanKind.CLIENT);
    expect(call.attributes).toEqual({
      "gen_ai.operation.name": "chat",
      "gen_ai.provider.name": "anthropic",
      "gen_ai.request.model": "claude-haiku-5-5",
      "gen_ai.response.id": "msg_1",
      "gen_ai.usage.input_tokens": 462,
      "gen_ai.usage.output_tokens": 30,
      api: "anthropic-messages",
      reasoning: "medium",
      stop: "stop",
      "usage.input": 12,
      "usage.cache_read": 400,
      "usage.cache_write": 50,
      "cost.total": 0.002,
    });
    expect(call.events.map(({ name, attributes }) => [name, attributes ?? {}])).toEqual([
      ["pi.ai.first_chunk", {}],
      ["pi.ai.block", { type: "text", index: 0, chars: 42 }],
    ]);
  });

  test("keeps pi's status of a failed call, with its message, and names the error by error.type", async () => {
    const recorded = recordSpans();

    await telemetryUnder(ROOT_CONTEXT).startSpan({ name: "pi.ai.request", attributes: { provider: "blockr.assistant", api: "openai-responses", model: "gpt-5.4" } }, (span) => {
      span.setAttributes({ stop: "error" });
      span.setStatus({ status: "error", error: { name: "provider_error", message: "429 Too Many Requests" } });
    });

    const call = recorded.span("chat gpt-5.4");
    expect(call.status).toEqual({ code: SpanStatusCode.ERROR, message: "429 Too Many Requests" });
    expect(call.attributes).toMatchObject({ "gen_ai.provider.name": "openai", "error.type": "provider_error", stop: "error" });
  });

  test("names the provider after the API that the call speaks, and any other API after itself", () => {
    expect(["anthropic-messages", "openai-responses", "openai-completions", "faux"].map(providerName)).toEqual(["anthropic", "openai", "openai", "faux"]);
  });

  test("leaves every span that pi does not name pi.ai.request as it is named", async () => {
    const recorded = recordSpans();

    await telemetryUnder(ROOT_CONTEXT).startSpan({ name: "pi.ai.poll", attributes: { provider: "blockr.assistant", model: "gpt-5.4" } }, () => undefined);

    expect(recorded.span("pi.ai.poll").attributes).toEqual({ provider: "blockr.assistant", model: "gpt-5.4" });
  });
});
