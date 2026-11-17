// Records in memory the spans that start from now on, in place of the page's
// tracing, as blockr.core's tests record theirs. It registers a tracer
// provider and the StackContextManager as the globals of OpenTelemetry's API,
// as core's OpenTelemetry module sets them up on the page. The modules share
// one copy of the API, so the spans of core and those of the assistant go
// into the same exporter. The globals go once stop() runs, or else as the test
// finishes.

import { context, trace } from "@opentelemetry/api";
import { InMemorySpanExporter, SimpleSpanProcessor, StackContextManager, TracerProvider } from "@opentelemetry/sdk-trace";
import type { ReadableSpan } from "@opentelemetry/sdk-trace";
import { onTestFinished } from "vitest";

export interface Recorded {
  // The spans that ended, in the order that they ended.
  spans(): readonly ReadableSpan[];
  // The one span of the name that ended, or an error where none or several did.
  span(name: string): ReadableSpan;
  // Has the API record nothing, as before the page's tracing is set up.
  stop(): void;
}

export function recordSpans(): Recorded {
  const exporter = new InMemorySpanExporter();
  trace.setGlobalTracerProvider(new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] }));
  context.setGlobalContextManager(new StackContextManager().enable());
  onTestFinished(stopRecording);
  return {
    spans: () => exporter.getFinishedSpans(),
    span(name) {
      const named = exporter.getFinishedSpans().filter((span) => span.name === name);
      const [span] = named;
      if (named.length !== 1 || span === undefined) {
        throw new Error(`${String(named.length)} spans named "${name}" ended, where one was expected.`);
      }
      return span;
    },
    stop: stopRecording,
  };
}

function stopRecording(): void {
  trace.disable();
  context.disable();
}
