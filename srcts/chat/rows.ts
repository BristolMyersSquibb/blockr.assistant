// How the chat lays out the parts of a reply
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#tool-calls):
// - Each text and each piece of reasoning shows where it came.
// - Tool calls with no text or reasoning between them form a run. In a run,
//   the calls to each tool share one row, which opens to each call, as
//   today's chat groups them. The rows follow the order in which the run
//   first called each tool.
// - Why a turn failed shows where the turn ended.
// Each row is titled from its tool's name, as list_blocks shows as
// "List blocks", as today's rows are.

import { FAILURE } from "./messages.ts";
import type { ShownResult } from "./messages.ts";

// A tool call, as its row shows it.
export interface Call {
  readonly id: string;
  readonly tool: string;
  readonly args: unknown;
  // The result, once the call has one.
  readonly result: ShownResult | undefined;
  // Whether the result is marked as an error.
  readonly error: boolean;
}

// The calls of a run to one tool.
export interface Row {
  readonly tool: string;
  readonly calls: readonly Call[];
}

// A piece of a reply as the chat draws it: a part of assistant-ui's, by its
// index in the reply, a run of tool calls, or why the turn failed.
export type Segment =
  | { readonly kind: "text" | "reasoning"; readonly index: number }
  | { readonly kind: "tools"; readonly rows: readonly Row[] }
  | { readonly kind: "failure"; readonly text: string };

// A part of a reply, as far as the chat reads it.
interface PartLike {
  readonly type: string;
  readonly text?: unknown;
  readonly toolCallId?: unknown;
  readonly toolName?: unknown;
  readonly args?: unknown;
  readonly result?: unknown;
  readonly isError?: unknown;
  readonly name?: unknown;
  readonly data?: unknown;
}

// The pieces of a reply, from assistant-ui's parts of it.
export function segmentsOf(parts: readonly PartLike[]): Segment[] {
  const segments: Segment[] = [];
  let run: Call[] = [];
  const end = (): void => {
    if (run.length > 0) segments.push({ kind: "tools", rows: rowsOf(run) });
    run = [];
  };

  for (const [index, part] of parts.entries()) {
    if (part.type === "tool-call") {
      run.push(callOf(part));
      continue;
    }
    if (part.type === "text" || part.type === "reasoning") {
      end();
      segments.push({ kind: part.type, index });
    } else if (part.type === "data" && part.name === FAILURE && typeof part.data === "string") {
      end();
      segments.push({ kind: "failure", text: part.data });
    }
  }
  end();
  return segments;
}

// The rows of a run: one for each tool, in the order in which the run first
// called it.
export function rowsOf(calls: readonly Call[]): Row[] {
  const rows = new Map<string, Call[]>();
  for (const call of calls) rows.set(call.tool, [...(rows.get(call.tool) ?? []), call]);
  return [...rows].map(([tool, called]) => ({ tool, calls: called }));
}

// The title of a tool's row: its name in sentence case, as "List blocks" for
// list_blocks.
export function toolTitle(tool: string): string {
  const words = tool.replaceAll("_", " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function callOf(part: PartLike): Call {
  return {
    id: typeof part.toolCallId === "string" ? part.toolCallId : "",
    tool: typeof part.toolName === "string" ? part.toolName : "",
    args: part.args,
    result: isShownResult(part.result) ? part.result : undefined,
    error: part.isError === true,
  };
}

function isShownResult(value: unknown): value is ShownResult {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Partial<Record<keyof ShownResult, unknown>>;
  return typeof result.text === "string" && Array.isArray(result.images) && typeof result.count === "number";
}
