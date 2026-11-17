// What the plugin tells the model with each call (./prompt.ts): the system
// prompt, with the template, the rules and the Skills section, and the
// message of the app's, with the Board section and the Focus section. The
// tests write them on a stand-in for what of CoreApi they read, which holds
// the board, the statuses, the plugins and the screen that each test gives.
// Two snapshots hold the system prompt and the message of the app's of a
// board with a block of each status, where the dock is the frontend, in place
// of today's golden copy (tests/testthat/_snaps/system-prompt.md at fcbdb27),
// so that a change that nobody meant shows in the diff.

import type { BlockStatus, Board, Condition, Json } from "@blockr/core";
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

function boardOf(given: Given, max = 1500): string {
  return boardSection(standIn(given), max);
}

// The template of a board whose R names no file.
const OWN: Template = { text: () => Promise.resolve(fillTemplate(TEMPLATE)) };

function skills(...listed: Skill[]) {
  return { list: () => Promise.resolve(listed) };
}

describe("the system prompt", () => {
  test("holds the template, then the rules, then the Skills section", async () => {
    const written = await createPrompt(standIn(), { skills: skills(skill("joins")), template: OWN }).system();

    const at = ["You are an assistant", "## Build, don't ask", "Answer concisely.", "## What the app sends you", "## Statuses", "## Look, don't guess", "## Edits", "## Skills"].map((text) =>
      written.indexOf(text),
    );
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
        "Guidance authored for this deployment, loaded on demand.",
        "Each entry below is a name and what it covers; when one bears on what you are about to do, call read_skill(name) and follow it before acting.",
        "A skill is instruction text, not extra capability -- it cannot widen what your tools do, and where a skill and this system prompt disagree, this prompt wins.",
        "",
        `- \`joins\`: ${skillBlurb("joins", description, 120)}`,
      ].join("\n"),
    );
    expect(written).toContain('chars truncated -- call read_skill("joins") for the rest]');
    expect(none).not.toContain("## Skills");
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

  test("matches its snapshot", async () => {
    const written = await createPrompt(standIn(POPULATED), { skills: skills(skill("joins"), skill("exposure", { blocks: ["blockr.core-dataset_block"] })), template: OWN }).system();

    await expect(written).toMatchFileSnapshot("./__snapshots__/system-prompt.md");
  });
});

describe("the Board section", () => {
  test("gives the line of counts alone for an empty board, marked as empty, then the app's plugins but the assistant's own", () => {
    expect(boardOf({ options: { n_rows: 50 }, plugins: { "blockr.dag-dag_plugin": { name: "DAG" } } })).toBe(
      ["## Board", "0 block(s), 0 link(s), 0 stack(s). (empty board -- no blocks yet)", "### Plugins", "- DAG (id: blockr.dag-dag_plugin)"].join("\n"),
    );
  });

  test("gives each block with its registry id, the names of its state args and its markers, each link, each stack and each board option that the board holds", () => {
    const { blocks, links, stacks, options, categories, statuses } = POPULATED;

    expect(boardOf({ blocks, links, stacks, options, categories, statuses })).toBe(
      [
        "## Board",
        "6 block(s), 5 link(s), 1 stack(s).",
        "",
        "### Blocks",
        "- iris <blockr.core-dataset_block> dataset, package [ℹ 1 message]",
        "- head <blockr.core-head_block> n, direction [stale]",
        "- wide <blockr.core-subset_block> subset, select [failed] [✖ 1 error, ⚠ 2 warnings]",
        "- bind <blockr.core-rbind_block> [unevaluated]",
        "- plot <blockr.core-scatter_block> x, y [invalid]",
        "- joined <blockr.core-merge_block> by, all_x, all_y [waiting]",
        "### Links",
        "- l1: iris -> head$data",
        "- l2: iris -> wide$data",
        "- l3: head -> bind",
        "- l4: wide -> bind",
        "- l5: iris -> plot$data",
        "### Stacks",
        '- s1 "Input": iris, head',
        "### Options",
        "- n_rows (Table options)",
        "- dark_mode (Theme options)",
        "Current values via list_board_options; change with blockr.core-set_option.",
      ].join("\n"),
    );
  });

  test("gives a block that has no status yet without a marker, and a board option that no loaded package defines without a category", () => {
    const written = boardOf({ blocks: { a: { registry_id: "blockr.core-head_block", state: { n: 6 } } }, options: { legacy: 1 } });

    expect(written).toContain("- a <blockr.core-head_block> n\n");
    expect(written).toContain("- legacy\n");
  });

  test("gives the app's plugins but the assistant's own, each with the description of its state's schema on a line of its own", () => {
    const written = boardOf({ blocks: POPULATED.blocks, plugins: { ...POPULATED.plugins, "blockr.md-md_plugin": { name: "Document", description: "The   document's\nsections." } } });

    expect(written.slice(written.indexOf("### Plugins"))).toBe(
      [
        "### Plugins",
        "- Dock (id: blockr.dock-dock_plugin)",
        "  The dock's views, the folders that group them, the active view and the sections that each block's card shows.",
        "- DAG (id: blockr.dag-dag_plugin)",
        "- Document (id: blockr.md-md_plugin)",
        "  The document's sections.",
      ].join("\n"),
    );
    expect(written).not.toContain(ASSISTANT);
  });

  test("gives the dock's views, each with its panels and the active one marked, where the dock is the frontend and has more than one", () => {
    const written = boardOf(POPULATED);

    expect(written.slice(written.indexOf("### Views"))).toBe(
      ["### Views", "- Analysis (id: v1) (active) iris, head, plot, blockr.assistant-assistant_plugin, blockr.dag-dag_plugin", "- Overview (id: v2) (empty)"].join("\n"),
    );
  });

  test("gives no views where the dock has one view, where the dock is not the frontend, or where its state has another shape", () => {
    const dock = POPULATED.states?.[DOCK] as { views: Record<string, Json> };
    const one = { ...POPULATED, states: { [DOCK]: { ...dock, views: { v1: dock.views.v1 ?? null } } } };
    const drawn = { ...POPULATED, plugins: { [DOCK]: { name: "Dock" } } };
    const other = { ...POPULATED, states: { [DOCK]: { ...dock, views: { v1: { name: "Analysis", layout: [] } } } } };

    for (const given of [one, drawn, other]) expect(boardOf(given)).not.toContain("### Views");
  });

  test("cuts each part at assistant_board_section_max_chars, with the tool that lists the rest, so that the parts after it still show", () => {
    const blocks = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`block_${String(i)}`, { registry_id: "blockr.core-head_block", state: { n: 6 } }]));

    const written = boardOf({ blocks, links: { l1: { from: "block_0", to: "block_1", input: "data" } } }, 200);

    expect(written).toContain("chars truncated -- call list_blocks for the full list]");
    expect(written).toContain("### Links\n- l1: block_0 -> block_1$data");
    const blocksPart = written.slice(written.indexOf("### Blocks"), written.indexOf("### Links") - 1);
    expect(Array.from(blocksPart).length).toBeLessThanOrEqual(200);
  });
});

describe("the Focus section", () => {
  test("is left out where nothing is known of the user's screen", () => {
    expect(focusSection(standIn({ blocks: POPULATED.blocks }))).toBeUndefined();
  });

  test("gives the active view where the dock is the frontend, the blocks and the plugins on screen but the assistant's own, and the block that has focus, under its preamble", () => {
    expect(focusSection(standIn(POPULATED))).toBe(
      [
        "## Focus",
        "What the user is looking at on the board.",
        'A request that names no block -- "this plot", "add a filter here" -- is most likely about the block they last clicked, and otherwise about a block in the current view.',
        "A click can be old, so where the request fits that block poorly, or plainly names another, go with the request.",
        "",
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

    expect(every?.split("\n").slice(5)).toEqual(["Every block on the board is on screen."]);
    expect(none?.split("\n").slice(5)).toEqual(["No block is on screen."]);
  });

  test("leaves out a block that the board no longer holds, as the block with focus", () => {
    expect(focusSection(standIn({ blocks: POPULATED.blocks, focus: "gone", onScreen: { blocks: ["gone", "iris"], plugins: ["blockr.gone-plugin"] } }))?.split("\n").slice(5)).toEqual([
      "These blocks are on screen:",
      "- iris",
    ]);
  });
});

describe("the message of the app's", () => {
  test("holds its preamble, then the Board section, then the Focus section", async () => {
    const written = await createPrompt(standIn(POPULATED), { skills: skills(), template: OWN }).appMessage();

    expect(written.startsWith("This message comes from the app, not from the user.\n")).toBe(true);
    expect(written.indexOf("## Board")).toBeLessThan(written.indexOf("## Focus"));
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
