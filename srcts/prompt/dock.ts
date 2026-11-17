// The dock's views, which the Board section and the Focus section give where
// the dock is the frontend
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.5#the-sections).
// The plugin reads them from the dock's state, which the board holds and every
// plugin may read, in the shape that the dock's schema gives it
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.2.1#grids):
// - Each view has a name and a grid. The grid shows the panels of each of its
//   tab groups, in its splits, and of each of its rails.
// - A panel is the card of a block, by the block's id, or the UI of a plugin,
//   by the id of the plugin's class.
// - The state names the active view, or none.
// Where the state has another shape, as under a release of the dock that
// changes it, the sections give no views rather than wrong ones.

import type { CoreApi, Json } from "@blockr/core";

// The id of the dock's plugin class.
export const DOCK = "blockr.dock-dock_plugin";

export interface View {
  readonly id: string;
  readonly name: string;
  // The panels that the view shows: block ids, and the ids of plugin classes.
  readonly panels: readonly string[];
}

export interface Views {
  readonly views: readonly View[];
  // The active view, or null for none.
  readonly active: View | null;
}

// The dock's views, where the dock is the frontend, or undefined where it is
// not or where its state has another shape.
export function dockViews(core: Pick<CoreApi, "store" | "plugins">): Views | undefined {
  if (!Object.hasOwn(core.plugins.appPlugins(), DOCK) || core.plugins.pluginClass(DOCK).frontend === undefined) return undefined;
  const plugins = core.store.board().plugins;
  return Object.hasOwn(plugins, DOCK) ? viewsOf(plugins[DOCK]) : undefined;
}

function viewsOf(state: Json | undefined): Views | undefined {
  if (!isRecord(state) || !isRecord(state.views)) return undefined;
  const views: View[] = [];
  for (const [id, view] of Object.entries(state.views)) {
    if (!isRecord(view) || typeof view.name !== "string") return undefined;
    const panels = panelsOf(view.grid);
    if (panels === undefined) return undefined;
    views.push({ id, name: view.name, panels });
  }
  return { views, active: views.find((view) => view.id === state.active) ?? null };
}

// The panels of a grid, those of its splits first, in order, then those of
// its rails, the left one first.
function panelsOf(grid: Json | undefined): string[] | undefined {
  if (!isRecord(grid)) return undefined;
  const panels: string[] = [];
  const take = (panel: Json): boolean => {
    if (!isRecord(panel)) return false;
    const id = typeof panel.block === "string" ? panel.block : panel.plugin;
    if (typeof id !== "string") return false;
    panels.push(id);
    return true;
  };
  // A tab group or a rail holds panels, and a split holds children.
  const walk = (node: Json | undefined): boolean => {
    if (!isRecord(node)) return false;
    if (Array.isArray(node.panels)) return node.panels.every(take);
    if (Array.isArray(node.children)) return node.children.every(walk);
    return false;
  };
  if (!walk(grid)) return undefined;
  const { rails } = grid;
  if (rails === undefined) return panels;
  if (!isRecord(rails)) return undefined;
  for (const side of ["left", "right"]) {
    const rail = rails[side];
    if (rail !== undefined && !walk(rail)) return undefined;
  }
  return panels;
}

function isRecord(value: Json | undefined): value is Readonly<Record<string, Json>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
