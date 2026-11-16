// The schemas of the args of the assistant's commands, which describe them to
// menus and to the assistant's tools
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.1.2#commands).
// A message takes the definitions of the schema of the assistant's state,
// which the build generates from the state's types.

import type { Json, JsonSchema } from "@blockr/core";
// The schema of the assistant's state is the file that the build writes for
// R, beside the bundle.
// eslint-disable-next-line no-restricted-imports
import schema from "../../inst/js/assistant_plugin.schema.json" with { type: "json" };

// The definitions of the state's schema, with each reference pointing under
// $defs, where object() puts them.
// The build writes the schema in the draft 7 of JSON Schema, whose keywords
// these definitions share with the draft 2020-12, which core reads a
// command's args by.
const DEFINITIONS = JSON.parse(
  JSON.stringify(schema.definitions).replaceAll('"#/definitions/', '"#/$defs/'),
) as Readonly<Record<string, Json>>;

// The schema of an object with the properties given, which takes no other.
// It holds, under $defs, each definition of the state's schema that the
// properties refer to, and those that these refer to in turn.
export function object(properties: Readonly<Record<string, JsonSchema>>, required: readonly string[]): JsonSchema {
  const defs = definitionsFor(properties);
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
    ...(Object.keys(defs).length === 0 ? {} : { $defs: defs }),
  };
}

export const conversation: JsonSchema = { type: "string", description: "The id of a conversation." };

export const title: JsonSchema = { type: "string", description: "The title of the conversation." };

export const model: JsonSchema = {
  type: ["string", "null"],
  description: 'The conversation\'s pick of the model, such as "gpt-5.4", or null for the default.',
};

export const message: JsonSchema = {
  $ref: "#/$defs/Message",
  description: "The message, which no message of the conversation has the id of.",
};

export const summary: JsonSchema = {
  allOf: [{ $ref: "#/$defs/Message" }, { type: "object", properties: { role: { const: "summary" } } }],
  description:
    "The summary, a message of the role summary, which takes the place of the messages that it summarizes. No message that the conversation keeps has its id.",
};

export function keep(description: string): JsonSchema {
  return { type: "integer", minimum: 1, description };
}

export function tokens(description: string): JsonSchema {
  return { type: "integer", minimum: 0, description };
}

function definitionsFor(value: Json): Record<string, Json> {
  const picked = new Map<string, Json>();
  const queue = referenced(value);
  for (let name = queue.pop(); name !== undefined; name = queue.pop()) {
    if (picked.has(name)) continue;
    const definition = DEFINITIONS[name];
    if (definition === undefined) throw new Error(`The schema of the assistant's state defines no "${name}".`);
    picked.set(name, definition);
    queue.push(...referenced(definition));
  }
  return Object.fromEntries([...picked].sort(([a], [b]) => (a < b ? -1 : 1)));
}

function referenced(value: Json): string[] {
  return [...JSON.stringify(value).matchAll(/"#\/\$defs\/([^"]+)"/g)].flatMap((match) => match.slice(1, 2));
}
