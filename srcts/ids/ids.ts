// What the assistant does with the ids of what packages define: block
// classes, plugin classes, commands and the modules that packages offer each
// other, each named by its package and its id within the package.
// - Core makes one object for each pair, an Id, which every function of
//   core's takes and gives. The assistant makes each Id that it hands core
//   with CoreApi's id(). It copies none of core's helpers for ids, since a
//   copy in its bundle would keep a table of its own, whose objects are never
//   === to core's (https://github.com/BristolMyersSquibb/blockr.core/issues/722).
// - JSON holds an id as a plain record of the two, as
//   { "package": "blockr.core", "id": "add_block" }. The model reads and
//   writes an id in that form in the args and the results of the tools, as
//   core's commands take ids in their args.
// - The model reads an id in text as its package and its id joined by `::`,
//   as "blockr.core::add_block": in the system prompt, in the app's message,
//   and in the messages of the tools' failures. A rule of the system prompt
//   says that a call writes such an id as its record.
// - The user reads an id as core's messages name one, as
//   "add_block of blockr.core".
// The assistant never reads an id back from either text, so nothing here
// splits one.

import type { CoreApi, Id, JsonSchema } from "@blockr/core";

// An id as JSON holds it, whose package is null for what an app script
// defines. It is a `type` rather than an `interface`, so that it is a Json.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- an interface would not be assignable to Json
export type IdRecord<P extends string | null = string> = { readonly package: P; readonly id: string };

// The id as JSON holds it, a record of its package and its id, as a tool's
// result gives it. TypeScript takes no Id for a Json, since Id is an
// interface without an index signature.
export function idRecord<P extends string | null>(id: Id<P>): IdRecord<P> {
  return { package: id.package, id: id.id };
}

// How a text that the model reads names an id: "blockr.core::add_block", or
// the id alone for what an app script defines, as the system prompt, the
// app's message and the messages of the tools' failures write it.
export function idForModel(id: IdRecord<string | null>): string {
  return id.package === null ? id.id : `${id.package}::${id.id}`;
}

// How a message that the user reads names an id, as core's messages do:
// "add_block of blockr.core", or the id alone for what an app script defines.
export function idText(id: IdRecord<string | null>): string {
  return id.package === null ? id.id : `${id.id} of ${id.package}`;
}

// The Id that core gives for the record, or undefined where core refuses the
// record. Core refuses a package that is not named as R names one, and an id
// that is empty, which the args of a tool may hold.
export function idOf<P extends string | null>(core: Pick<CoreApi, "id">, record: IdRecord<P>): Id<P> | undefined {
  try {
    return core.id(record.package, record.id);
  } catch (error) {
    if (error instanceof TypeError) return undefined;
    throw error;
  }
}

// The JSON Schema of an id as JSON holds it, which a tool's args take, with
// the description given: an object of the package and the id within it, both
// required. The package may be null where `nullable` is true, for a block
// class that an app script defines.
export function idSchema(description: string, nullable = false): JsonSchema {
  return {
    type: "object",
    properties: {
      package: {
        type: nullable ? ["string", "null"] : "string",
        description: nullable ? 'The package, as "blockr.core", or null for what the app\'s script defines.' : 'The package, as "blockr.core".',
      },
      id: { type: "string", description: 'The id within the package, as "add_block".' },
    },
    required: ["package", "id"],
    additionalProperties: false,
    description,
  };
}
