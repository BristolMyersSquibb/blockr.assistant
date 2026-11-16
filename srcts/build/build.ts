// Builds the assistant's client into inst/js, which the R package ships and
// git keeps, since R CMD check and CRAN run no Node. Run: npm run build
//
// - The module of the assistant's plugin class,
//   srcts/modules/assistant_plugin/index.tsx, is bundled into
//   assistant_plugin.js, which blockr.assistant lists in R as the class's
//   module.
// - It takes the build preset that blockr.core ships as `@blockr/core/build`,
//   which leaves its imports of React and of core's React SDK, its binding and
//   its controls to the page that R serves, which resolves them through its
//   import map. So the bundle holds none of them.
// - The bundle is not minified, since it holds the assistant's own code alone.
// - The build generates the JSON Schema of the assistant's state from the
//   type AssistantState in srcts/state/types.ts, as blockr.dock's build
//   generates the schema of the dock's state. It writes it beside the
//   module, as assistant_plugin.schema.json, where R finds it. The module
//   imports the file as the schema of its class's state, so the build writes
//   it before it bundles.
//
// The build owns inst/js and empties it first, so that nothing is left of a
// file that it no longer writes.

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { preset } from "@blockr/core/build";
import * as esbuild from "esbuild";
import { createGenerator } from "ts-json-schema-generator";

// Builds the client of the package at `root` and gives the files it wrote,
// relative to `root`.
export async function build(root: string): Promise<string[]> {
  const out = join(root, "inst", "js");

  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const schema = await stateSchema(root, out);

  const result = await esbuild.build({
    ...preset,
    absWorkingDir: root,
    entryPoints: [{ in: join(root, "srcts", "modules", "assistant_plugin", "index.tsx"), out: "assistant_plugin" }],
    outdir: out,
    logLevel: "warning",
    metafile: true,
  });

  if (result.warnings.length > 0) {
    throw new Error("esbuild warned, as printed above");
  }

  return [...Object.keys(result.metafile.outputs), schema].sort();
}

// Writes the JSON Schema of the assistant's state, from the type
// AssistantState that srcts/state/types.ts exports, into `out` as
// assistant_plugin.schema.json, beside the module of the assistant's plugin
// class, and gives the file it wrote, relative to `root`.
// The schema allows no property that the types do not declare, and each type
// that the file exports is a definition of its own, as in the dock's schema.
async function stateSchema(root: string, out: string): Promise<string> {
  const schema = createGenerator({
    path: join(root, "srcts", "state", "types.ts"),
    tsconfig: join(root, "tsconfig.client.json"),
    expose: "export",
    topRef: false,
    additionalProperties: false,
    skipTypeCheck: true,
  }).createSchema("AssistantState");

  const file = join(out, "assistant_plugin.schema.json");
  await writeFile(file, `${JSON.stringify(schema, null, 2)}\n`);
  return relative(root, file);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const file of await build(resolve(dirname(fileURLToPath(import.meta.url)), "../.."))) {
    console.log(file);
  }
}
