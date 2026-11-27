// The chat's copy of the status dot's spec (./status.ts), against the table of
// the page (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.1.8#the-blocks-mark-and-the-status-dot).

import { describe, expect, test } from "vitest";
import { DOTS, dotColor, dotOf } from "./status.ts";

// The page's table: each status, its dot, and its tooltip.
const TABLE = [
  ["stale", "Filled with `muted-foreground`", "Inputs changed since this block last ran"],
  ["waiting", "A ring of `warning`", "Waiting for a data input"],
  ["invalid", "Filled with `warning`", "Set this block's inputs"],
  ["failed", "Filled with `destructive`", "Evaluation failed"],
  ["ready", "Filled with `success`", "Up to date"],
  ["unevaluated", "A ring of `muted-foreground`", "Not evaluated yet"],
] as const;

describe("the status dot", () => {
  test("draws each status as the page's table has it", () => {
    const drawn = Object.entries(DOTS).map(([status, dot]) => [status, `${dot.filled ? "Filled with" : "A ring of"} \`${dot.job}\``, dot.tooltip]);
    expect(drawn).toEqual(TABLE.map((row) => [...row]));
  });

  test("takes the theme variable of the job that core maps the status onto", () => {
    const dot = dotOf("failed");
    expect(dot === undefined ? undefined : dotColor(dot)).toBe("var(--bk-color-destructive)");
    expect(dotOf("constructor")).toBeUndefined();
  });
});
