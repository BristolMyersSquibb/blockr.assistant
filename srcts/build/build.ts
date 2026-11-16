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
// - The build of the module takes the vendor check that blockr.core ships
//   beside the preset. It fails the build where the module's bundle would
//   hold code from node_modules, as where a file of the assistant imports pi
//   other than through srcts/loop/vendor.ts.
// - The packages that the assistant bundles from other projects are those
//   that package.json lists in `dependencies`, pi's two, as blockr.dock's
//   build takes the dock's. Of them, srcts/loop/vendor.ts names the parts
//   that the loop uses, since pi's root entry point breaks a bundle. The
//   build fails where vendor.ts imports any other package.
// - Those parts are bundled, minified, into a file of their own,
//   pi-<hash>.js, which the loop loads as the first turn starts, as core
//   bundles the parts of OpenTelemetry's SDK that it loads on demand into
//   opentelemetry-<hash>.js. The name holds a hash of the content, so that no
//   browser runs an old copy from its cache. The bundle takes the build
//   preset too, so that an import of React or of OpenTelemetry's API that pi
//   makes stays an import of the one copy on the page. The loop's dynamic
//   import of srcts/loop/vendor.ts becomes an import of that file, beside the
//   module, where R serves it too.
// - The license texts of the packages in that bundle go beside it, into
//   pi-licenses.txt, since none of the bundled files holds its license. Each
//   text comes from the package's LICENSE file, or from srcts/build/licenses
//   for the packages whose npm package ships none.
// - The build generates the JSON Schema of the assistant's state from the
//   type AssistantState in srcts/state/types.ts, as blockr.dock's build
//   generates the schema of the dock's state. It writes it beside the
//   module, as assistant_plugin.schema.json, where R finds it. The module
//   imports the file as the schema of its class's state, so the build writes
//   it before it bundles.
//
// The build owns inst/js and empties it first, so that nothing is left of a
// file that it no longer writes.

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { preset, vendorCheck } from "@blockr/core/build";
import * as esbuild from "esbuild";
import { createGenerator } from "ts-json-schema-generator";

// Builds the client of the package at `root` and gives the files it wrote,
// relative to `root`.
export async function build(root: string): Promise<string[]> {
  const out = join(root, "inst", "js");

  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const schema = await stateSchema(root, out);
  const pi = await piBundle(root, out);

  const result = await esbuild.build({
    ...preset,
    absWorkingDir: root,
    entryPoints: [{ in: join(root, "srcts", "modules", "assistant_plugin", "index.tsx"), out: "assistant_plugin" }],
    outdir: out,
    logLevel: "warning",
    metafile: true,
    plugins: [vendoredPi(root, pi.file), ...preset.plugins, vendorCheck],
  });

  if (result.warnings.length > 0) {
    throw new Error("esbuild warned, as printed above");
  }

  return [...Object.keys(result.metafile.outputs), schema, ...pi.written].sort();
}

// The packages whose npm package ships no license text, each with the file in
// srcts/build/licenses that holds the text from the package's repository.
// The four packages of pi share the LICENSE of its repository, at 071c1e0,
// and standardwebhooks takes that of its repository's libraries, at c7cd8a9.
const LICENSES: Readonly<Record<string, string>> = {
  "@earendil-works/pi-agent-core": "pi.txt",
  "@earendil-works/pi-ai": "pi.txt",
  "@earendil-works/pi-schema": "pi.txt",
  "@earendil-works/pi-telemetry": "pi.txt",
  standardwebhooks: "standardwebhooks.txt",
};

// Bundles the parts of pi that srcts/loop/vendor.ts names, minified, into one
// file in `out`, named by a hash of its content, as pi-3f2a9c1d.js, and
// writes the license texts of what it holds beside it, into
// pi-licenses.txt. It gives the bundle's name, and the files that it wrote,
// relative to `root`.
async function piBundle(root: string, out: string): Promise<{ file: string; written: string[] }> {
  const vendor = join(root, "srcts", "loop", "vendor.ts");
  const result = await esbuild.build({
    ...preset,
    absWorkingDir: root,
    entryPoints: [vendor],
    write: false,
    metafile: true,
    minify: true,
    logLevel: "warning",
  });

  if (result.warnings.length > 0) {
    throw new Error("esbuild warned, as printed above");
  }
  const packages = await vendorPackages(root);
  const imported = result.metafile.inputs[relative(root, vendor)]?.imports ?? [];
  const strays = [...new Set(imported.flatMap((entry) => packageOf(entry.path) ?? []))].filter((name) => !packages.includes(name));
  if (strays.length > 0) {
    throw new Error(`The file srcts/loop/vendor.ts imports ${strays.join(", ")}, which package.json does not list in dependencies.`);
  }

  const text = result.outputFiles[0]?.text ?? "";
  const file = `pi-${createHash("sha256").update(text).digest("hex").slice(0, 8)}.js`;
  const licenses = join(out, "pi-licenses.txt");
  await writeFile(join(out, file), text);
  await writeFile(licenses, await licenseTexts(root, file, result.metafile));
  return { file, written: [relative(root, join(out, file)), relative(root, licenses)] };
}

// The packages that the build bundles from other projects, by their names:
// those that package.json lists in `dependencies`.
async function vendorPackages(root: string): Promise<string[]> {
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    readonly dependencies?: Readonly<Record<string, string>>;
  };
  return Object.keys(manifest.dependencies ?? {});
}

// The npm package of a file in node_modules, as @earendil-works/pi-ai for
// node_modules/@earendil-works/pi-ai/dist/models.js, or undefined for a file
// from elsewhere.
function packageOf(path: string): string | undefined {
  const at = path.lastIndexOf("node_modules/");
  if (at === -1) return undefined;
  const [first = "", second = ""] = path.slice(at + "node_modules/".length).split("/");
  return first.startsWith("@") ? `${first}/${second}` : first;
}

// The license texts of the packages that the bundle `file` holds, by their
// names, each under its name, its version and its license.
async function licenseTexts(root: string, file: string, metafile: esbuild.Metafile): Promise<string> {
  const dirs = new Set(
    Object.keys(metafile.inputs).flatMap((input) => {
      const dir = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(input)?.[1];
      return dir === undefined ? [] : [dir];
    }),
  );
  const sections = await Promise.all(
    [...dirs].map(async (dir) => {
      const { name, version, license } = JSON.parse(await readFile(join(root, dir, "package.json"), "utf8")) as Record<string, string>;
      if (name === undefined) throw new Error(`The package.json in ${dir} names no package.`);
      return { name, heading: `${name} ${version ?? ""}, ${license ?? "no license named"}`, text: await licenseText(root, dir, name) };
    }),
  );
  const rule = "=".repeat(80);
  return [
    `The bundle beside this file, ${file}, holds these packages, minified.`,
    "The bundle keeps none of their license texts, so each follows here, under the package's name, its version and its license.",
    ...sections
      .sort((a, b) => (a.name < b.name ? -1 : 1))
      .map((section) => `\n${rule}\n${section.heading}\n${rule}\n\n${section.text.trimEnd()}\n`),
  ].join("\n");
}

// The license text of the package `name` in `dir`, from its LICENSE file or
// from srcts/build/licenses.
async function licenseText(root: string, dir: string, name: string): Promise<string> {
  const own = (await readdir(join(root, dir))).find((entry) => /^licen[cs]e(\.(md|txt))?$/i.test(entry));
  if (own !== undefined) return readFile(join(root, dir, own), "utf8");
  const kept = LICENSES[name];
  if (kept !== undefined) return readFile(join(root, "srcts", "build", "licenses", kept), "utf8");
  throw new Error(`The bundle of pi holds ${name}, whose npm package ships no license text, and srcts/build/licenses holds none for it.`);
}

// Leaves the loop's import of srcts/loop/vendor.ts an import of the bundle of
// pi that piBundle() wrote, by its name beside the module.
function vendoredPi(root: string, file: string): esbuild.Plugin {
  const vendor = join(root, "srcts", "loop", "vendor.ts");
  return {
    name: "blockr.assistant-pi",
    setup(build) {
      build.onResolve({ filter: /^\.\.?\// }, (args) => (resolve(args.resolveDir, args.path) === vendor ? { path: `./${file}`, external: true } : undefined));
    },
  };
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
