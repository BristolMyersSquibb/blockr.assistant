// The chat's copy of the status dot's spec (./status.ts), against the table of
// the page (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.2.7#the-status-dot).

import { describe, expect, test } from "vitest";
import { DOTS, dotColor, dotOf } from "./status.ts";

// The page's table: each status, its dot, and its tooltip.
const TABLE = [
  ["stale", "Filled with `text-muted`", "Inputs changed since this block last ran"],
  ["waiting", "A ring of `border-warning`", "Waiting for a data input"],
  ["invalid", "Filled with `border-warning`", "Set this block's inputs"],
  ["failed", "Filled with `border-danger`", "Evaluation failed"],
  ["ready", "Filled with `border-success`", "Up to date"],
  ["unevaluated", "A ring of `text-muted`", "Not evaluated yet"],
] as const;

describe("the status dot", () => {
  test("draws each status as the page's table has it", () => {
    const drawn = Object.entries(DOTS).map(([status, dot]) => [status, `${dot.filled ? "Filled with" : "A ring of"} \`${dot.token}\``, dot.tooltip]);
    expect(drawn).toEqual(TABLE.map((row) => [...row]));
  });

  test("takes core's status token, then blockr.ui's token, then the token's light value", () => {
    const dot = dotOf("failed");
    expect(dot === undefined ? undefined : dotColor("failed", dot)).toBe("var(--bc-color-status-failed, var(--blockr-color-border-danger, #dc2626))");
    expect(dotOf("constructor")).toBeUndefined();
  });
});
