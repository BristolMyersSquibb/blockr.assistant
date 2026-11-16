// The status dot of a block, as the design system draws a block's status
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.2.7#the-status-dot),
// which the edit tool's row draws beside each block that the edit's review
// gives. The dock's client holds the dot's spec as one function and the DAG
// keeps a copy of it, and so does the chat: this table, which a test checks
// against the table of the page.
// The chat draws the status that the review gave, which names no
// notification, so it has no need of the rule that the dock's dot reads
// failed while an error about the block's output concerns the block.
// The colour reads core's status token, as --bc-color-status-stale, which
// core is to define with the colours of the table as defaults, then
// blockr.ui's token of the table, with its light value as the fallback.

// How the dot of a status looks.
export interface Dot {
  // Whether the dot is filled, or a ring.
  readonly filled: boolean;
  // The token of blockr.ui whose colour the dot takes.
  readonly token: Token;
  readonly tooltip: string;
}

// The tokens of blockr.ui that the dots take, each with its light value.
const LIGHT = {
  "text-muted": "#6b7280",
  "border-warning": "#d97706",
  "border-danger": "#dc2626",
  "border-success": "#16a34a",
} as const;

type Token = keyof typeof LIGHT;

// The dot of each status that core's scheduler gives a block.
export const DOTS: Readonly<Record<string, Dot>> = {
  stale: { filled: true, token: "text-muted", tooltip: "Inputs changed since this block last ran" },
  waiting: { filled: false, token: "border-warning", tooltip: "Waiting for a data input" },
  invalid: { filled: true, token: "border-warning", tooltip: "Set this block's inputs" },
  failed: { filled: true, token: "border-danger", tooltip: "Evaluation failed" },
  ready: { filled: true, token: "border-success", tooltip: "Up to date" },
  unevaluated: { filled: false, token: "text-muted", tooltip: "Not evaluated yet" },
};

// The dot of a status, or undefined for one that the table lacks.
export function dotOf(status: string): Dot | undefined {
  return Object.hasOwn(DOTS, status) ? DOTS[status] : undefined;
}

// The colour of a status's dot, as CSS.
export function dotColor(status: string, dot: Dot): string {
  return `var(--bc-color-status-${status}, var(--blockr-color-${dot.token}, ${LIGHT[dot.token]}))`;
}
