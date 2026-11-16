// The shape of the assistant's tools, the plugin's own. The module through
// which the plugin reaches pi hands the tools to pi, so that no tool imports
// pi (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.2#the-tools).
// - A tool's args fit its schema, since pi checks each call's args against
//   it before it runs the tool, and answers a call whose args fail itself.
// - A tool resolves with each failure as its result, marked as an error, so
//   that the model reads why and can call again
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.2#how-failures-reach-the-model).
//   It rejects only where the turn's signal aborts, with the signal's reason,
//   since the loop then writes the result of each call left without one. The
//   edit tool and undo_edit resolve instead where their step applied before
//   the stop, so that the model learns that it did (./edit.ts).

import type { Json, JsonSchema } from "@blockr/core";
import { failureText } from "./failures.ts";

export interface ToolImage {
  // The image's bytes, as base64.
  readonly data: string;
  readonly mimeType: string;
}

export interface ToolResult {
  readonly text: string;
  // Whether the result tells of a failure, which the model reads as an error.
  readonly isError: boolean;
  readonly images: readonly ToolImage[];
}

export interface Tool {
  readonly name: string;
  readonly description: string;
  // The JSON Schema of the tool's args.
  readonly parameters: JsonSchema;
  // How pi runs the calls of one response where one of them calls the tool:
  // one after the other, "sequential", or at once, "parallel", pi's default.
  readonly executionMode: "sequential" | "parallel";
  // Runs one call with its args, given the turn's signal.
  execute(args: Readonly<Record<string, Json>>, signal: AbortSignal): Promise<ToolResult>;
}

// A tool whose args, as its schema has them, are an A.
export interface ToolDefinition<A> {
  readonly name: string;
  readonly description: string;
  readonly parameters: JsonSchema;
  readonly executionMode?: "sequential" | "parallel";
  // Resolves with the result, or with the text of one, and throws what fails,
  // which the tool turns into its result.
  run(args: A, signal: AbortSignal): Promise<ToolResult | string>;
}

// The tool, whose args pi has checked against its schema, so that run()
// reads them as an A, which TypeScript cannot take for a Json where it has
// optional properties.
export function tool<A>(definition: ToolDefinition<A>): Tool {
  return {
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters,
    executionMode: definition.executionMode ?? "parallel",
    async execute(args, signal) {
      try {
        const result = await definition.run(args as unknown as A, signal);
        return typeof result === "string" ? { text: result, isError: false, images: [] } : result;
      } catch (error) {
        if (signal.aborted) throw signal.reason;
        return { text: failureText(error), isError: true, images: [] };
      }
    },
  };
}

// The JSON text of a tool's result.
export function json(value: Json): string {
  return JSON.stringify(value);
}
