// What the plugin tells the model with each call (./prompt.ts): the system
// prompt, with the template, the rules, the section on the plugins and board
// options and the Skills section, and the message of the app's, with the
// Board section and the Focus section. The tests write them on a stand-in for
// what of CoreApi they read, which holds the board, the statuses, the
// plugins and the screen that each test gives. Two snapshots hold the system
// prompt and the message of the app's of a board with a block of each status,
// where the dock is the frontend, in place of today's golden copy
// (tests/testthat/_snaps/system-prompt.md at fcbdb27), so that a change that
// nobody meant shows in the diff. Two larger boards check what the Board
// section holds within its cap: one of 20 blocks, which it holds whole, and
// one of 100, which it cuts.

import type { BlockStatus, Board, Condition, Json, Link } from "@blockr/core";
import { describe, expect, test } from "vitest";
import type { Skill } from "../skills/index.ts";
import { ASSISTANT } from "../state/index.ts";
import { skill } from "../testing/index.ts";
import { skillBlurb } from "../tools/index.ts";
import { boardSection } from "./board.ts";
import { DOCK } from "./dock.ts";
import { focusSection } from "./focus.ts";
import { createPrompt } from "./prompt.ts";
import type { Core } from "./prompt.ts";
import { fillTemplate, TEMPLATE } from "./template.ts";
import type { Template } from "./template.ts";

interface Given {
  readonly blocks?: Readonly<Record<string, { readonly registry_id: string; readonly state?: Readonly<Record<string, Json>> }>>;
  readonly links?: Board["links"];
  readonly stacks?: Board["stacks"];
  // The values of the board options that the board holds.
  readonly options?: Readonly<Record<string, Json>>;
  // The category of each board option that a loaded package defines.
  readonly categories?: Readonly<Record<string, string>>;
  readonly statuses?: Readonly<Record<string, Partial<BlockStatus>>>;
  // The app's plugins, each with its name, the description of its state's
  // schema and whether its class is a frontend.
  readonly plugins?: Readonly<Record<string, { readonly name: string; readonly description?: string; readonly frontend?: boolean }>>;
  // The state of each plugin that the board holds.
  readonly states?: Readonly<Record<string, Json>>;
  readonly focus?: string | null;
  readonly onScreen?: { readonly blocks: readonly string[]; readonly plugins: readonly string[] } | null;
  readonly blockrOptions?: Readonly<Record<string, Json>>;
}

// What of CoreApi the prompt reads, holding what the test gives, and where the
// app runs the assistant beside the plugins given.
function standIn(given: Given = {}): Core {
  const board: Board = {
    id: "board",
    name: "Board",
    blocks: Object.fromEntries(Object.entries(given.blocks ?? {}).map(([id, { registry_id, state }]) => [id, { registry_id, state: state ?? {}, name: id, locked: null }])),
    links: given.links ?? {},
    stacks: given.stacks ?? {},
    options: given.options ?? {},
    plugins: given.states ?? {},
  };
  const plugins = { [ASSISTANT]: { name: "Assistant" }, ...given.plugins };
  const status = (id: string): BlockStatus | undefined => {
    const set = given.statuses?.[id];
    if (set === undefined) return undefined;
    return { status: "ready", revision: 1, evaluated: 1, running: false, conditions: [], stdout: "", stderr: "", summary: null, reason: null, unsent: null, ...set };
  };
  return {
    store: { board: () => board },
    scheduler: { status },
    options: { registered: () => Object.fromEntries(Object.entries(given.categories ?? {}).map(([id, category]) => [id, { id, category }])) },
    plugins: {
      appPlugins: () => Object.fromEntries(Object.entries(plugins).map(([id, { name }]) => [id, { name }])),
      pluginClass: (id: string) => {
        const plugin = given.plugins?.[id];
        return {
          id,
          ...(plugin?.description === undefined ? {} : { state: { schema: { type: "object", description: plugin.description }, default: {} } }),
          ...(plugin?.frontend === true ? { frontend: { render: () => undefined } } : {}),
        };
      },
    },
    focus: { get: () => given.focus ?? null },
    onScreen: { get: () => given.onScreen ?? null },
    blockrOption: (name: string) => Promise.resolve(given.blockrOptions?.[name]),
  } as unknown as Core;
}

function condition(severity: Condition["severity"], message: string): Condition {
  return { severity, class: [severity, "condition"], message };
}

// A board with a block of each status, a link into a positional input, a
// stack and two board options, where the dock is the frontend with two views.
const POPULATED: Given = {
  blocks: {
    iris: { registry_id: "blockr.core-dataset_block", state: { dataset: "iris", package: "datasets" } },
    head: { registry_id: "blockr.core-head_block", state: { n: 6, direction: "head" } },
    wide: { registry_id: "blockr.core-subset_block", state: { subset: "Sepal.Width > 3", select: "" } },
    bind: { registry_id: "blockr.core-rbind_block" },
    plot: { registry_id: "blockr.core-scatter_block", state: { x: "Sepal.Length", y: null } },
    joined: { registry_id: "blockr.core-merge_block", state: { by: [], all_x: false, all_y: false } },
  },
  links: {
    l1: { from: "iris", to: "head", input: "data" },
    l2: { from: "iris", to: "wide", input: "data" },
    l3: { from: "head", to: "bind", input: "" },
    l4: { from: "wide", to: "bind", input: "" },
    l5: { from: "iris", to: "plot", input: "data" },
  },
  stacks: { s1: { name: "Input", blocks: ["iris", "head"], color: null } },
  options: { n_rows: 50, dark_mode: false },
  categories: { n_rows: "Table options", dark_mode: "Theme options" },
  statuses: {
    iris: { status: "ready", conditions: [condition("message", "Loaded iris.")] },
    head: { status: "stale" },
    wide: { status: "failed", conditions: [condition("error", "object 'Sepal.Width' not found"), condition("warning", "NAs introduced"), condition("warning", "NAs again")] },
    bind: { status: "unevaluated" },
    plot: { status: "invalid", reason: "The arg y is not set." },
    joined: { status: "waiting", reason: "The data input x has no link." },
  },
  plugins: {
    [DOCK]: { name: "Dock", description: "The dock's views, the folders that group them, the active view and the sections that each block's card shows.", frontend: true },
    "blockr.dag-dag_plugin": { name: "DAG" },
  },
  states: {
    [DOCK]: {
      views: {
        v1: {
          name: "Analysis",
          folder: null,
          index: "a",
          grid: {
            orientation: "horizontal",
            children: [{ panels: [{ block: "iris" }, { block: "head" }], active: { block: "iris" } }, { children: [{ panels: [{ block: "plot" }], active: { block: "plot" } }], sizes: [1] }],
            sizes: [0.5, 0.5],
            rails: { left: { panels: [{ plugin: ASSISTANT }, { plugin: "blockr.dag-dag_plugin" }], active: { plugin: ASSISTANT }, collapsed: false, size: 500 } },
          },
        },
        v2: { name: "Overview", folder: null, index: "b", grid: { orientation: "horizontal", children: [], sizes: [] } },
      },
      folders: {},
      active: "v1",
      visible: {},
    },
  },
  focus: "head",
  onScreen: { blocks: ["iris", "plot"], plugins: [ASSISTANT, "blockr.dag-dag_plugin"] },
};

// The registry id and the state args of each block class that the larger
// boards below use, as blockr.core, blockr.dplyr and blockr.ggplot give them.
const CLASSES = {
  dataset: ["blockr.core-dataset_block", "dataset", "package"],
  rbind: ["blockr.core-rbind_block"],
  join: ["blockr.dplyr-join_block", "type", "keys", "exprs", "suffix_x", "suffix_y"],
  filter: ["blockr.dplyr-filter_block", "conditions", "operator", "preserve_order"],
  mutate: ["blockr.dplyr-mutate_block", "mutations", "by"],
  select: ["blockr.dplyr-select_block", "columns", "exclude", "distinct"],
  arrange: ["blockr.dplyr-arrange_block", "columns"],
  summarize: ["blockr.dplyr-summarize_block", "summaries", "by"],
  slice: ["blockr.dplyr-slice_block", "type", "n", "prop", "order_by", "with_ties", "weight_by", "replace", "rows", "by"],
  pivot: ["blockr.dplyr-pivot_wider_block", "names_from", "values_from", "id_cols", "values_fill"],
  plot: ["blockr.ggplot-ggplot_block", "type", "x", "y", "color", "fill", "size", "shape", "linetype", "group", "alpha", "density_alpha", "position", "bins", "donut"],
} as const;

function classed(kind: keyof typeof CLASSES): { readonly registry_id: string; readonly state: Readonly<Record<string, Json>> } {
  const [registryId, ...args] = CLASSES[kind];
  return { registry_id: registryId, state: Object.fromEntries(args.map((arg) => [arg, null])) };
}

// The dock's state with the views given, each by its id with its name and
// the panels of its one tab group, and the active view.
function dockState(views: readonly (readonly [string, string, readonly string[]])[], active: string): Json {
  const panel = (id: string): Json => (id.includes("-") ? { plugin: id } : { block: id });
  return {
    views: Object.fromEntries(
      views.map(([id, name, panels], index) => [
        id,
        { name, folder: null, index: String.fromCharCode(97 + index), grid: { orientation: "horizontal", children: [{ panels: panels.map(panel) }], sizes: [1] } },
      ]),
    ),
    folders: {},
    active,
    visible: {},
  };
}

const PLUGINS: Given["plugins"] = {
  [DOCK]: { name: "Dock", description: "The dock's views, the folders that group them, the active view and the sections that each block's card shows.", frontend: true },
  "blockr.dag-dag_plugin": { name: "DAG" },
};

// A board of 20 blocks on the flights of nycflights13, in four stacks, where
// the dock is the frontend with three views, as a board that the Board
// section holds whole.
const TWENTY: Given = (() => {
  const blocks: [string, keyof typeof CLASSES][] = [
    ["flights", "dataset"],
    ["airlines", "dataset"],
    ["airports", "dataset"],
    ["weather", "dataset"],
    ["with_names", "join"],
    ["with_weather", "join"],
    ["with_airports", "join"],
    ["delayed", "filter"],
    ["with_speed", "mutate"],
    ["kept", "select"],
    ["sorted", "arrange"],
    ["by_carrier", "summarize"],
    ["by_month", "summarize"],
    ["by_origin", "summarize"],
    ["worst", "slice"],
    ["wide", "pivot"],
    ["delay_plot", "plot"],
    ["month_plot", "plot"],
    ["origin_plot", "plot"],
    ["speed_plot", "plot"],
  ];
  const links: [string, string, string, string][] = [
    ["keen_finch", "flights", "with_names", "x"],
    ["brave_otter", "airlines", "with_names", "y"],
    ["calm_heron", "with_names", "with_weather", "x"],
    ["eager_lynx", "weather", "with_weather", "y"],
    ["fond_raven", "with_weather", "with_airports", "x"],
    ["glad_moose", "airports", "with_airports", "y"],
    ["happy_crane", "with_airports", "delayed", "data"],
    ["jolly_bison", "delayed", "with_speed", "data"],
    ["kind_gecko", "with_speed", "kept", "data"],
    ["lively_newt", "kept", "sorted", "data"],
    ["merry_quail", "sorted", "by_carrier", "data"],
    ["noble_shrew", "sorted", "by_month", "data"],
    ["proud_tapir", "sorted", "by_origin", "data"],
    ["quick_viper", "by_carrier", "worst", "data"],
    ["rapid_whale", "by_month", "wide", "data"],
    ["shy_yak", "by_carrier", "delay_plot", "data"],
    ["tidy_zebra", "by_month", "month_plot", "data"],
    ["vast_ibis", "by_origin", "origin_plot", "data"],
    ["warm_koala", "with_speed", "speed_plot", "data"],
  ];
  return {
    blocks: Object.fromEntries(blocks.map(([id, kind]) => [id, classed(kind)])),
    links: Object.fromEntries(links.map(([id, from, to, input]) => [id, { from, to, input }])),
    stacks: {
      data: { name: "Data", blocks: ["flights", "airlines", "airports", "weather"], color: null },
      prep: { name: "Prep", blocks: ["with_names", "with_weather", "with_airports", "delayed", "with_speed", "kept", "sorted"], color: null },
      summaries: { name: "Summaries", blocks: ["by_carrier", "by_month", "by_origin", "worst", "wide"], color: null },
      plots: { name: "Plots", blocks: ["delay_plot", "month_plot", "origin_plot", "speed_plot"], color: null },
    },
    statuses: {
      ...Object.fromEntries(blocks.map(([id]) => [id, { status: "ready" }])),
      worst: { status: "failed", conditions: [condition("error", "object 'dep_delay' not found")] },
      wide: { status: "invalid" },
      speed_plot: { status: "stale" },
    },
    plugins: PLUGINS,
    states: {
      [DOCK]: dockState(
        [
          ["v1", "Data", ["flights", "airlines", "airports", "weather"]],
          ["v2", "Analysis", ["sorted", "by_carrier", "by_month", "by_origin", "worst", ASSISTANT, "blockr.dag-dag_plugin"]],
          ["v3", "Plots", ["delay_plot", "month_plot", "origin_plot", "speed_plot"]],
        ],
        "v2",
      ),
    },
    focus: "by_carrier",
    onScreen: { blocks: ["sorted", "by_carrier", "by_month", "by_origin", "worst"], plugins: [ASSISTANT, "blockr.dag-dag_plugin"] },
  };
})();

// A board past the cap, as the page measured one: 100 blocks in ten stacks of
// ten, each a chain from a dataset block, with 108 links, six board options,
// five plugins besides the assistant's and six views of the dock. Three
// blocks failed and two are invalid, all past the first stack, while the
// focus and the four blocks on screen are in the first stack.
const KINDS: readonly (keyof typeof CLASSES)[] = ["dataset", "filter", "mutate", "join", "select", "arrange", "summarize", "slice", "pivot", "rbind"];
const HUNDRED: Given = (() => {
  const id = (n: number): string => `${KINDS[(n - 1) % 10] ?? "block"}_${String(n)}`;
  const ids = Array.from({ length: 100 }, (_, i) => id(i + 1));
  const links: [string, Link][] = [];
  for (let n = 1; n <= 100; n++) {
    // Each block but a stack's first takes the block before it, a join as its
    // x, while a join takes the dataset of the stack before its own as its y,
    // and the rbind of each stack but the first two the summary of the stack
    // before it.
    const place = (n - 1) % 10;
    const kind = KINDS[place];
    if (place > 0) links.push([`l${String(links.length + 1)}`, { from: id(n - 1), to: id(n), input: kind === "join" ? "x" : kind === "rbind" ? "" : "data" }]);
    if (kind === "join") links.push([`l${String(links.length + 1)}`, { from: id(n <= 10 ? 91 : n - 13), to: id(n), input: "y" }]);
    if (kind === "rbind" && n > 20) links.push([`l${String(links.length + 1)}`, { from: id(n - 13), to: id(n), input: "" }]);
  }
  const wrong: Readonly<Record<string, Partial<BlockStatus>>> = {
    [id(37)]: { status: "failed", conditions: [condition("error", "object 'x' not found")] },
    [id(52)]: { status: "failed", conditions: [condition("error", "object 'y' not found")] },
    [id(88)]: { status: "failed", conditions: [condition("error", "object 'z' not found")] },
    [id(64)]: { status: "invalid" },
    [id(95)]: { status: "invalid" },
  };
  const views = Array.from({ length: 6 }, (_, v): readonly [string, string, readonly string[]] => [`v${String(v + 1)}`, `View ${String(v + 1)}`, ids.slice(v * 10, v * 10 + 5)]);
  return {
    blocks: Object.fromEntries(ids.map((block, i) => [block, classed(KINDS[i % 10] ?? "dataset")])),
    links: Object.fromEntries(links),
    stacks: Object.fromEntries(Array.from({ length: 10 }, (_, s) => [`s${String(s + 1)}`, { name: `Stack ${String(s + 1)}`, blocks: ids.slice(s * 10, s * 10 + 10), color: null }])),
    options: {},
    categories: { n_rows: "Table options", page_size: "Table options", filter_rows: "Table options", thematic: "Theme options", dark_mode: "Theme options", show_conditions: "Board options" },
    statuses: { ...Object.fromEntries(ids.map((block, i) => [block, { status: i < 10 ? "ready" : i % 3 === 0 ? "stale" : "unevaluated" }])), ...wrong },
    plugins: {
      ...PLUGINS,
      "blockr.core-edit_board_plugin": { name: "Edit board" },
      "blockr.md-md_plugin": { name: "Document", description: "The document's sections, each with its text and the blocks that it shows." },
      "blockr.session-session_plugin": { name: "Session" },
      "blockr.io-export_plugin": { name: "Export" },
    },
    states: { [DOCK]: dockState(views, "v1") },
    focus: id(3),
    onScreen: { blocks: [id(1), id(2), id(4), id(5)], plugins: [] },
  };
})();

function boardOf(given: Given, max = 3000, changed: readonly string[] = []): string {
  return boardSection(standIn(given), max, changed);
}

// The ids of the blocks that the Board section lists, in its order.
function listedBlocks(written: string): string[] {
  const lines = written.split("\n");
  const from = lines.indexOf("### Blocks") + 1;
  const to = lines.findIndex((line, index) => index >= from && line.startsWith("### "));
  return lines
    .slice(from, to === -1 ? undefined : to)
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2, line.indexOf(" <")));
}

// The template of a board whose R names no file.
const OWN: Template = { text: () => Promise.resolve(fillTemplate(TEMPLATE)) };

function skills(...listed: Skill[]) {
  return { list: () => Promise.resolve(listed) };
}

describe("the system prompt", () => {
  test("holds the template, then the rules, then the section on the plugins and board options, then the Skills section", async () => {
    const written = await createPrompt(standIn(POPULATED), { skills: skills(skill("joins")), template: OWN }).system();

    const at = [
      "You are an assistant",
      "## Build, don't ask",
      "Answer concisely.",
      "## What the app sends you",
      "## Statuses",
      "## Look, don't guess",
      "## Edits",
      "## Plugins and board options",
      "## Skills",
    ].map((text) => written.indexOf(text));
    expect(at[0]).toBe(0);
    expect(at).not.toContain(-1);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  test("holds the rules and the Skills section under a deployment's template that names no section", async () => {
    const template: Template = { text: () => Promise.resolve("You help with study boards.") };

    const written = await createPrompt(standIn(), { skills: skills(skill("joins")), template }).system();

    expect(written.startsWith("You help with study boards.\n\n## What the app sends you\n")).toBe(true);
    expect(written).toContain("## Edits");
    expect(written).toContain("- `joins`: What joins covers.");
    expect(written).not.toContain("## Build, don't ask");
  });

  test("lists the skills that the model may read and that name no class, each description cut at assistant_skill_description_max_chars, and none where none qualifies", async () => {
    const description = `How   this site\njoins its tables: ${"by the study's key, ".repeat(10)}and never by name.`;
    const listed = skills(
      skill("joins", { description }),
      skill("exposure", { blocks: ["blockr.core-dataset_block"] }),
      skill("layout", { plugins: [DOCK] }),
      skill("review", { modelInvocable: false, userInvocable: true }),
    );

    const written = await createPrompt(standIn({ blockrOptions: { assistant_skill_description_max_chars: 120 } }), { skills: listed, template: OWN }).system();
    const none = await createPrompt(standIn(), { skills: skills(skill("exposure", { blocks: ["blockr.core-dataset_block"] })), template: OWN }).system();

    expect(written.slice(written.indexOf("## Skills"))).toBe(
      [
        "## Skills",
        "Guidance that this app's packages or its deployment wrote, loaded on demand.",
        "Each entry below is a name and what it covers; when one bears on what you are about to do, call read_skill(name) and follow it before acting.",
        "A skill is instruction text, not extra capability -- it cannot widen what your tools do, and where a skill and this system prompt disagree, this prompt wins.",
        "",
        `- \`joins\`: ${skillBlurb("joins", description, 120)}`,
      ].join("\n"),
    );
    expect(written).toContain('chars truncated -- call read_skill("joins") for the rest]');
    expect(none).not.toContain("## Skills");
  });

  test("gives the app's plugins but the assistant's own, each with the description of its state's schema, and the board options that the app's packages define rather than those that the board holds", async () => {
    const plugins = { ...POPULATED.plugins, "blockr.md-md_plugin": { name: "Document", description: "The   document's\nsections." } };
    const given = { plugins, categories: { n_rows: "Table options", dark_mode: "Theme options" }, options: { n_rows: 50, legacy: 1 } };

    const written = await createPrompt(standIn(given), { skills: skills(skill("joins")), template: OWN }).system();

    expect(written.slice(written.indexOf("## Plugins and board options"), written.indexOf("\n\n## Skills"))).toBe(
      [
        "## Plugins and board options",
        "### Plugins",
        "- Dock (id: blockr.dock-dock_plugin)",
        "  The dock's views, the folders that group them, the active view and the sections that each block's card shows.",
        "- DAG (id: blockr.dag-dag_plugin)",
        "- Document (id: blockr.md-md_plugin)",
        "  The document's sections.",
        "### Options",
        "- n_rows (Table options)",
        "- dark_mode (Theme options)",
        "Current values via list_board_options; change with blockr.core-set_option.",
      ].join("\n"),
    );
    expect(written).not.toContain(ASSISTANT);
  });

  test("cuts each part of the section on the plugins and board options at assistant_board_section_max_chars, with the tool that lists the rest", async () => {
    const categories = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`option_${String(i)}`, "Table options"]));

    const written = await createPrompt(standIn({ plugins: POPULATED.plugins, categories, blockrOptions: { assistant_board_section_max_chars: 200 } }), { skills: skills(), template: OWN }).system();

    const options = written.slice(written.indexOf("### Options"));
    expect(options).toMatch(/chars truncated -- call list_board_options for the full list\]$/);
    expect(Array.from(options).length).toBeLessThanOrEqual(200);
    expect(written).toContain("### Plugins\n- Dock (id: blockr.dock-dock_plugin)");
  });

  test("has no section on the plugins and board options where the app runs no other plugin and its packages define no board option", async () => {
    const written = await createPrompt(standIn({ blocks: POPULATED.blocks, options: { legacy: 1 } }), { skills: skills(skill("joins")), template: OWN }).system();

    expect(written).not.toContain("## Plugins and board options");
    expect(written).toContain("## Edits");
  });

  test("is written once for the board, however many calls send it", async () => {
    let read = 0;
    const template: Template = {
      text: () => {
        read += 1;
        return Promise.resolve("<<role>>");
      },
    };
    const prompt = createPrompt(standIn(), { skills: skills(), template });

    expect(await prompt.system()).toBe(await prompt.system());
    expect(read).toBe(1);
  });

  test("fails where assistant_skill_description_max_chars holds a value that it does not take", async () => {
    const prompt = createPrompt(standIn({ blockrOptions: { assistant_skill_description_max_chars: "many" } }), { skills: skills(), template: OWN });

    await expect(prompt.system()).rejects.toThrow('The blockr option assistant_skill_description_max_chars is "many", where it takes a whole number of 0 or more.');
  });

  test("fails where assistant_board_section_max_chars holds a value that it does not take", async () => {
    const prompt = createPrompt(standIn({ blockrOptions: { assistant_board_section_max_chars: 1.5 } }), { skills: skills(), template: OWN });

    await expect(prompt.system()).rejects.toThrow("The blockr option assistant_board_section_max_chars is 1.5, where it takes a whole number of 0 or more.");
  });

  test("matches its snapshot", async () => {
    const written = await createPrompt(standIn(POPULATED), { skills: skills(skill("joins"), skill("exposure", { blocks: ["blockr.core-dataset_block"] })), template: OWN }).system();

    await expect(written).toMatchFileSnapshot("./__snapshots__/system-prompt.md");
  });
});

describe("the Board section", () => {
  test("gives the line of counts alone for an empty board, marked as empty", () => {
    expect(boardOf({ options: { n_rows: 50 }, plugins: { "blockr.dag-dag_plugin": { name: "DAG" } } })).toBe(
      ["## Board", "0 block(s), 0 link(s), 0 stack(s). (empty board -- no blocks yet)"].join("\n"),
    );
  });

  test("gives the blocks by each status that marks one in the line of counts, then each block with its registry id, the names of its state args, its markers and the links into it, then each stack", () => {
    const { blocks, links, stacks, options, categories, statuses } = POPULATED;

    expect(boardOf({ blocks, links, stacks, options, categories, statuses })).toBe(
      [
        "## Board",
        "6 block(s) (1 waiting, 1 invalid, 1 failed, 1 unevaluated, 1 stale), 5 link(s), 1 stack(s).",
        "",
        "### Blocks",
        "- wide <blockr.core-subset_block> subset, select [failed] [✖ 1 error, ⚠ 2 warnings] <- data: iris (l2)",
        "- plot <blockr.core-scatter_block> x, y [invalid] <- data: iris (l5)",
        "- iris <blockr.core-dataset_block> dataset, package [ℹ 1 message]",
        "- head <blockr.core-head_block> n, direction [stale] <- data: iris (l1)",
        "- bind <blockr.core-rbind_block> [unevaluated] <- head (l3), wide (l4)",
        "- joined <blockr.core-merge_block> by, all_x, all_y [waiting]",
        "### Stacks",
        '- s1 "Input": iris, head',
      ].join("\n"),
    );
  });

  test("gives a block that has no status yet without a marker, and no board option, which the system prompt gives", () => {
    const written = boardOf({ blocks: { a: { registry_id: "blockr.core-head_block", state: { n: 6 } } }, options: { n_rows: 50 }, categories: { n_rows: "Table options" } });

    expect(written.split("\n")).toContain("- a <blockr.core-head_block> n");
    expect(written).not.toContain("n_rows");
  });

  test("gives the dock's views, the active one first, each with its panels, where the dock is the frontend and has more than one", () => {
    const dock = POPULATED.states?.[DOCK] as Readonly<Record<string, Json>>;

    const written = boardOf(POPULATED);
    const second = boardOf({ ...POPULATED, states: { [DOCK]: { ...dock, active: "v2" } } });

    expect(written.slice(written.indexOf("### Views"))).toBe(
      ["### Views", "- Analysis (id: v1) (active) iris, head, plot, blockr.assistant-assistant_plugin, blockr.dag-dag_plugin", "- Overview (id: v2) (empty)"].join("\n"),
    );
    expect(second.slice(second.indexOf("### Views"))).toBe(
      ["### Views", "- Overview (id: v2) (active) (empty)", "- Analysis (id: v1) iris, head, plot, blockr.assistant-assistant_plugin, blockr.dag-dag_plugin"].join("\n"),
    );
  });

  test("gives no views where the dock has one view, where the dock is not the frontend, or where its state has another shape", () => {
    const dock = POPULATED.states?.[DOCK] as { views: Record<string, Json> };
    const one = { ...POPULATED, states: { [DOCK]: { ...dock, views: { v1: dock.views.v1 ?? null } } } };
    const drawn = { ...POPULATED, plugins: { [DOCK]: { name: "Dock" } } };
    const other = { ...POPULATED, states: { [DOCK]: { ...dock, views: { v1: { name: "Analysis", layout: [] } } } } };

    for (const given of [one, drawn, other]) expect(boardOf(given)).not.toContain("### Views");
  });

  test("holds the board of the snapshot and a board of 20 blocks whole within the default cap", () => {
    for (const given of [POPULATED, TWENTY]) {
      const written = boardOf(given);

      expect(Array.from(written).length).toBeLessThanOrEqual(3000);
      expect(written).not.toContain("…");
      expect(listedBlocks(written)).toEqual(expect.arrayContaining(Object.keys(given.blocks ?? {})));
      expect(written.split("\n").filter((line) => line.includes(" <- ")).flatMap((line) => line.slice(line.indexOf(" <- ") + 4).split(", "))).toHaveLength(Object.keys(given.links ?? {}).length);
    }
  });

  test("on a board past its cap, lists first the blocks that failed or are invalid, the block that has focus, the blocks that changed since the conversation's previous call and those on screen, then the rest in the board's order", () => {
    const written = boardOf(HUNDRED, 3000, ["join_74", "filter_12", "mutate_43", "gone"]);

    const listed = listedBlocks(written);
    const first = ["summarize_37", "filter_52", "join_64", "slice_88", "select_95", "mutate_3", "filter_12", "mutate_43", "join_74", "dataset_1", "filter_2", "join_4", "select_5"];
    expect(listed.slice(0, first.length)).toEqual(first);
    expect(listed.slice(first.length)).toEqual(Object.keys(HUNDRED.blocks ?? {}).filter((id) => !first.includes(id)).slice(0, listed.length - first.length));
    expect(listed.length).toBeGreaterThan(first.length);
  });

  test("on a board past its cap, ends each part that the cap cuts with a line that counts what it leaves out and names the tool that gives it", () => {
    const written = boardOf(HUNDRED, 3000, ["join_74", "filter_12", "mutate_43"]);

    const listed = new Set(listedBlocks(written));
    const left = Object.keys(HUNDRED.blocks ?? {}).length - listed.size;
    const linked = Object.values(HUNDRED.links ?? {}).filter(({ to }) => !listed.has(to)).length;
    const lines = written.split("\n");
    expect(lines[1]).toBe("100 block(s) (2 invalid, 3 failed, 59 unevaluated, 26 stale), 108 link(s), 10 stack(s).");
    expect(lines).toContain(`… and ${String(left)} more blocks, with the ${String(linked)} links into them: list_blocks gives every block, list_links every link`);
    expect(written).toContain("### Stacks\n… 10 stacks: list_stacks gives every stack");
    expect(written).toMatch(/### Views\n- View 1 \(id: v1\) \(active\) dataset_1, filter_2, mutate_3, join_4, select_5\n… and 5 more views: get_plugin_state\("blockr\.dock-dock_plugin"\) gives every view$/);
  });

  test("stays within its cap, whatever the cap, while the cap holds the line of counts and the lines that count what it leaves out", () => {
    for (const max of [400, 800, 1200, 1600, 2400, 3000, 4000, 8000, 16000]) {
      expect(Array.from(boardOf(HUNDRED, max)).length).toBeLessThanOrEqual(max);
    }
    expect(boardOf(HUNDRED, 100_000)).not.toContain("…");
  });

  test("gives the line of counts and the lines that count what it leaves out where the cap is too small even for those", () => {
    expect(boardOf(HUNDRED, 0).split("\n")).toEqual([
      "## Board",
      "100 block(s) (2 invalid, 3 failed, 59 unevaluated, 26 stale), 108 link(s), 10 stack(s).",
      "",
      "### Blocks",
      "… 100 blocks, with the 108 links into them: list_blocks gives every block, list_links every link",
      "### Stacks",
      "… 10 stacks: list_stacks gives every stack",
      "### Views",
      '… 6 views: get_plugin_state("blockr.dock-dock_plugin") gives every view',
    ]);
  });

  test("lists the stacks that hold a block listed, each with the blocks listed and a count of its others, and a stack that holds no block", () => {
    const blocks = Object.fromEntries(["a1", "a2", "a3", "a4", "b1", "b2", "b3", "b4", "c1"].map((id) => [id, classed("plot")]));
    const given: Given = {
      blocks,
      stacks: {
        first: { name: "First", blocks: ["a1", "a2", "a3", "a4"], color: null },
        second: { name: "Second", blocks: ["b1", "b2", "b3", "b4"], color: null },
        third: { name: "Third", blocks: ["c1"], color: null },
        empty: { name: "Empty", blocks: [], color: null },
      },
      statuses: { b3: { status: "failed" } },
      focus: "a2",
    };
    const args = "type, x, y, color, fill, size, shape, linetype, group, alpha, density_alpha, position, bins, donut";
    const expected = [
      "## Board",
      "9 block(s) (1 failed), 0 link(s), 4 stack(s).",
      "",
      "### Blocks",
      `- b3 <blockr.ggplot-ggplot_block> ${args} [failed]`,
      `- a2 <blockr.ggplot-ggplot_block> ${args}`,
      `- a1 <blockr.ggplot-ggplot_block> ${args}`,
      "… and 6 more blocks: list_blocks gives every block",
      "### Stacks",
      '- first "First": a1, a2 and 2 more blocks',
      '- second "Second": b3 and 3 more blocks',
      '- empty "Empty"',
      "… and 1 more stack: list_stacks gives every stack",
    ].join("\n");

    expect(boardOf(given, Array.from(expected).length)).toBe(expected);
  });
});

describe("the Focus section", () => {
  test("is left out where nothing is known of the user's screen", () => {
    expect(focusSection(standIn({ blocks: POPULATED.blocks }))).toBeUndefined();
  });

  test("gives the active view where the dock is the frontend, the blocks and the plugins on screen but the assistant's own, and the block that has focus, without a preamble, which is a rule", () => {
    expect(focusSection(standIn(POPULATED))).toBe(
      [
        "## Focus",
        "The active view is Analysis (id: v1).",
        "These blocks are on screen:",
        "- iris",
        "- plot",
        "These plugins are on screen:",
        "- DAG (id: blockr.dag-dag_plugin)",
        "Block head has focus.",
      ].join("\n"),
    );
  });

  test("says where every block, or no block, is on screen", () => {
    const { blocks } = POPULATED;
    const every = focusSection(standIn({ blocks, onScreen: { blocks: [...Object.keys(blocks ?? {}), "gone"], plugins: [] } }));
    const none = focusSection(standIn({ blocks, onScreen: { blocks: [], plugins: [ASSISTANT] } }));

    expect(every?.split("\n").slice(1)).toEqual(["Every block on the board is on screen."]);
    expect(none?.split("\n").slice(1)).toEqual(["No block is on screen."]);
  });

  test("leaves out a block that the board no longer holds, as the block with focus", () => {
    expect(focusSection(standIn({ blocks: POPULATED.blocks, focus: "gone", onScreen: { blocks: ["gone", "iris"], plugins: ["blockr.gone-plugin"] } }))?.split("\n").slice(1)).toEqual([
      "These blocks are on screen:",
      "- iris",
    ]);
  });
});

describe("the message of the app's", () => {
  test("holds its preamble, one sentence that says that the app writes it, then the Board section, then the Focus section", async () => {
    const written = await createPrompt(standIn(POPULATED), { skills: skills(), template: OWN }).appMessage();

    expect(written.startsWith("This message comes from the app, not from the user.\n\n## Board\n")).toBe(true);
    expect(written.indexOf("## Board")).toBeLessThan(written.indexOf("## Focus"));
  });

  test("lists the blocks that changed since the conversation's previous call after the block that has focus", async () => {
    const written = await createPrompt(standIn(POPULATED), { skills: skills(), template: OWN }).appMessage(["joined", "gone"]);

    expect(listedBlocks(written)).toEqual(["wide", "plot", "head", "joined", "iris", "bind"]);
  });

  test("is written anew for each call, from the board as it is then", async () => {
    let held = standIn({ blocks: { a: { registry_id: "blockr.core-head_block" } } });
    const prompt = createPrompt({ ...held, store: { board: () => held.store.board() } } as Core, { skills: skills(), template: OWN });

    const first = await prompt.appMessage();
    held = standIn({ blocks: { a: { registry_id: "blockr.core-head_block" }, b: { registry_id: "blockr.core-head_block" } } });
    const second = await prompt.appMessage();

    expect(first).toContain("1 block(s)");
    expect(second).toContain("2 block(s)");
  });

  test("fails where assistant_board_section_max_chars holds a value that it does not take", async () => {
    const prompt = createPrompt(standIn({ blockrOptions: { assistant_board_section_max_chars: -1 } }), { skills: skills(), template: OWN });

    await expect(prompt.appMessage()).rejects.toThrow("The blockr option assistant_board_section_max_chars is -1, where it takes a whole number of 0 or more.");
  });

  test("matches its snapshot", async () => {
    const written = await createPrompt(standIn(POPULATED), { skills: skills(), template: OWN }).appMessage();

    await expect(written).toMatchFileSnapshot("./__snapshots__/app-message.md");
  });
});
