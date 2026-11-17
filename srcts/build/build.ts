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
//   pi-<hash>.js, which the loop loads as the page prepares its first call,
//   as core bundles the parts of OpenTelemetry's SDK that it loads on demand
//   into opentelemetry-<hash>.js. The name holds a hash of the content, so
//   that no browser runs an old copy from its cache. The bundle takes the
//   build preset too, so that an import of React or of OpenTelemetry's API
//   that pi makes stays an import of the one copy on the page. The loop's
//   dynamic import of srcts/loop/vendor.ts becomes an import of that file,
//   beside the module, where R serves it too.
// - The chat's libraries, assistant-ui, its Markdown and remark-gfm, are
//   vendored the same way: srcts/chat/vendor.ts names the parts that the chat
//   draws with, which are bundled, minified, into chat-<hash>.js. The chat
//   imports that file as it first mounts, so that no board waits for it to
//   open.
// - The stylesheet of the module, srcts/modules/assistant_plugin/index.css,
//   is bundled, unminified, into assistant_plugin.css, beside the module,
//   where core finds it and puts it on the page with the module.
// - The licenses of what the files in inst/js hold from other projects go
//   into LICENSES beside them, as blockr.core's build writes its own
//   (BristolMyersSquibb/blockr.core#650), since none of the bundled files
//   keeps its license.
//   It has a line for each package from node_modules, with its version, its
//   author where its package.json names one, and the files that hold its
//   code. The text of a license follows the lines that share it.
//   A package that npm installs without a license file takes the one in
//   srcts/build/licenses under its name, as the four packages of pi,
//   standardwebhooks, react-remove-scroll-bar and use-composed-ref do. That
//   of react-remove-scroll-bar comes from its repository, which added it
//   after the version that npm installs. That of use-composed-ref, whose
//   package.json names the MIT license and whose repository holds no license
//   file, is the MIT license with the package's maintainer on npm as its
//   holder. The build fails for a package with neither, so that
//   no code ships without its license.
// - The build generates the JSON Schema of the assistant's state from the
//   type AssistantState in srcts/state/types.ts, as blockr.dock's build
//   generates the schema of the dock's state. It writes it beside the
//   module, as assistant_plugin.schema.json, where R finds it. The module
//   imports the file as the schema of its class's state, so the build writes
//   it before it bundles.
// - What each file that the build writes imports up front goes into
//   preload.json beside them, by `staticImports()` from `@blockr/core/build`,
//   as core's build writes its own (BristolMyersSquibb/blockr.core#652).
//   R names those files in the head of the page that it serves, so that the
//   browser fetches them at once, rather than each once the file that
//   imports it has loaded.
//   The module imports the bundles of vendored parts only as it runs, so its
//   list leaves them out, and a bundle that imports others up front, as the
//   chat's imports React, has a list of its own.
//
// The build owns inst/js and empties it first, so that nothing is left of a
// file that it no longer writes.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { preset, staticImports, vendorCheck } from "@blockr/core/build";
import * as esbuild from "esbuild";
import { createGenerator } from "ts-json-schema-generator";

// Builds the client of the package at `root` and gives the files it wrote,
// relative to `root`.
export async function build(root: string): Promise<string[]> {
  const out = join(root, "inst", "js");

  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const schema = await stateSchema(root, out);
  const vendored = new Map<string, Vendored>();
  for (const [name, vendor] of VENDORED) vendored.set(join(root, vendor), await vendorBundle(root, out, name, join(root, vendor)));
  const licensed = await licenses(root, out, new Map([...vendored.values()].map(({ file, metafile }) => [file, metafile])));
  const module = join(root, "srcts", "modules", "assistant_plugin");

  const results = [
    await esbuild.build({
      ...preset,
      absWorkingDir: root,
      entryPoints: [{ in: join(module, "index.tsx"), out: "assistant_plugin" }],
      outdir: out,
      logLevel: "warning",
      metafile: true,
      plugins: [vendoredImports(vendored), ...preset.plugins, vendorCheck],
    }),
    await esbuild.build({
      absWorkingDir: root,
      bundle: true,
      entryPoints: [{ in: join(module, "index.css"), out: "assistant_plugin" }],
      outdir: out,
      logLevel: "warning",
      metafile: true,
      plugins: [vendorCheck],
    }),
  ];

  if (results.some((result) => result.warnings.length > 0)) {
    throw new Error("esbuild warned, as printed above");
  }

  return [
    ...results.flatMap((result) => Object.keys(result.metafile.outputs)),
    schema,
    ...[...vendored.values()].map(({ file }) => relative(root, join(out, file))),
    licensed,
    await preloadList(root, out, results.map((result) => result.metafile), vendored.values()),
  ].sort();
}

// Writes what the files in `out` import up front into `out`, as preload.json,
// and gives its path from `root`: the static imports of the files that the
// builds of `metafiles` wrote, and those of each bundle of `vendored`, under
// the name of its file, since its build wrote none and names its output
// vendor.js.
async function preloadList(root: string, out: string, metafiles: readonly esbuild.Metafile[], vendored: Iterable<Vendored>): Promise<string> {
  const lists = Object.entries(staticImports(metafiles));
  for (const { file, metafile } of vendored) {
    const imports = Object.values(staticImports([metafile])).flat();
    if (imports.length > 0) lists.push([file, imports]);
  }
  const file = join(out, "preload.json");
  await writeFile(file, `${JSON.stringify(Object.fromEntries(lists.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))), null, 2)}\n`);
  return relative(root, file);
}

// The files that name the parts of other projects that the client uses, each
// with the start of the name of the file that bundles them: pi's parts, which
// the loop uses, and the libraries that the chat draws with.
const VENDORED: ReadonlyMap<string, string> = new Map([
  ["pi", join("srcts", "loop", "vendor.ts")],
  ["chat", join("srcts", "chat", "vendor.ts")],
]);

// A bundle of vendored parts: its file's name, and the metafile of the build,
// which says what the file holds.
interface Vendored {
  readonly file: string;
  readonly metafile: esbuild.Metafile;
}

// Bundles the parts that the file `vendor` names, minified, into one file in
// `out`, named by `name` and a hash of its content, as pi-3f2a9c1d.js. The
// build fails where the file imports a package that package.json does not
// list in `dependencies`.
async function vendorBundle(root: string, out: string, name: string, vendor: string): Promise<Vendored> {
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
  const strays = [...new Set(imported.flatMap((entry) => packageOf(entry.path) ?? []))].filter((stray) => !packages.includes(stray));
  if (strays.length > 0) {
    throw new Error(`The file ${relative(root, vendor)} imports ${strays.join(", ")}, which package.json does not list in dependencies.`);
  }

  const text = result.outputFiles[0]?.text ?? "";
  const file = `${name}-${createHash("sha256").update(text).digest("hex").slice(0, 8)}.js`;
  await writeFile(join(out, file), text);
  return { file, metafile: result.metafile };
}

// The packages that the build bundles from other projects, by their names:
// those that package.json lists in `dependencies`, which the files of
// VENDORED import between them.
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

// The parts of a package's package.json that LICENSES names.
interface Manifest {
  readonly name: string;
  readonly version: string;
  readonly author?: string | { readonly name?: string };
}

// Writes the licenses of what the files in `out` hold from other projects
// into `out`, as LICENSES, and gives its path from `root`.
// For each file, `held` gives the metafile of the build that wrote it, which
// names the packages from node_modules whose code the file holds.
async function licenses(root: string, out: string, held: ReadonlyMap<string, esbuild.Metafile>): Promise<string> {
  const holders = new Map<string, string[]>();
  for (const [file, metafile] of held) {
    for (const dir of packageDirs(metafile)) holders.set(dir, [...(holders.get(dir) ?? []), file]);
  }

  const kept = join(root, "srcts", "build", "licenses");
  const entries = await Promise.all(
    [...holders].map(async ([dir, files]) => {
      const where = listing(files.sort());
      const manifest = JSON.parse(await readFile(join(root, dir, "package.json"), "utf8")) as Manifest;
      const own = await licenseTexts(join(root, dir));
      const texts = own.length > 0 ? own : await licenseTexts(join(kept, manifest.name));
      if (texts.length === 0) {
        throw new Error(
          `The code of ${manifest.name} in ${where} comes with no license: neither its directory in node_modules nor srcts/build/licenses/${manifest.name} holds a license file.`,
        );
      }
      const author = authorName(manifest);
      return { line: `${manifest.name} ${manifest.version}${author === undefined ? "" : `, by ${author}`}, in ${where}`, text: texts.join("\n\n") };
    }),
  );

  // Each license once, after the lines of the packages that share it, in the
  // order of the packages' names.
  const byLicense = new Map<string, string[]>();
  for (const { line, text } of entries.sort((a, b) => (a.line < b.line ? -1 : 1))) {
    byLicense.set(text, [...(byLicense.get(text) ?? []), line]);
  }
  const file = join(out, "LICENSES");
  await writeFile(file, [...byLicense].map(([text, lines]) => `${lines.join("\n")}\n\n${text}\n`).join(`\n${"-".repeat(78)}\n\n`));
  return relative(root, file);
}

// The directory of each package from node_modules whose code the build that
// gave the metafile bundled, from the root of the package.
function packageDirs(metafile: esbuild.Metafile): Set<string> {
  return new Set(
    Object.keys(metafile.inputs).flatMap((input) => {
      const dir = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(input)?.[1];
      return dir === undefined ? [] : [dir];
    }),
  );
}

// The text of each license file in a package's directory, such as LICENSE or
// LICENSE.md, or none where the directory holds none or does not exist.
async function licenseTexts(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((file) => /^(licen[cs]e|copying)/i.test(file)).sort();
  return Promise.all(files.map(async (file) => (await readFile(join(dir, file), "utf8")).replace(/\r\n/g, "\n").trimEnd()));
}

// The author that a package's package.json names, without an email or a URL.
function authorName(manifest: Manifest): string | undefined {
  const name = typeof manifest.author === "string" ? manifest.author.replace(/\s*[<(].*$/, "") : manifest.author?.name;
  return name === undefined || name === "" ? undefined : name;
}

// The items as a list in prose, as "a, b and c".
function listing(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1) ?? ""}`;
}

// Leaves each import of a file of VENDORED, as the loop's of
// srcts/loop/vendor.ts, an import of the bundle that vendorBundle() wrote of
// it, by its name beside the module.
function vendoredImports(vendored: ReadonlyMap<string, Vendored>): esbuild.Plugin {
  return {
    name: "blockr.assistant-vendored",
    setup(build) {
      build.onResolve({ filter: /^\.\.?\// }, (args) => {
        const bundle = vendored.get(resolve(args.resolveDir, args.path));
        return bundle === undefined ? undefined : { path: `./${bundle.file}`, external: true };
      });
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
