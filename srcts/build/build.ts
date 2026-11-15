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
//
// The build owns inst/js and empties it first, so that nothing is left of a
// file that it no longer writes.

import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { preset } from "@blockr/core/build";
import * as esbuild from "esbuild";

// Builds the client of the package at `root` and gives the files it wrote,
// relative to `root`.
export async function build(root: string): Promise<string[]> {
  const out = join(root, "inst", "js");

  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

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

  return Object.keys(result.metafile.outputs).sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const file of await build(resolve(dirname(fileURLToPath(import.meta.url)), "../.."))) {
    console.log(file);
  }
}
