// The status dot of a block, as core draws a block's status
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.1.8#the-blocks-mark-and-the-status-dot),
// which the edit tool's row draws beside each block that the edit's review
// gives. The dock's client holds the dot's spec as one function and the DAG
// keeps a copy of it, and so does the chat: this table, which a test checks
// against the table of the page.
// The chat draws the status that the review gave, which names no
// notification, so it has no need of the rule that the dock's dot reads
// failed while an error about the block's output concerns the block.
// The colour is the theme variable of the job that core maps the status onto,
// as --bk-color-destructive for failed, so that a theme restyles the dot
// through the jobs, in both modes
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.7.2#the-defaults).

// How the dot of a status looks.
export interface Dot {
  // Whether the dot is filled, or a ring.
  readonly filled: boolean;
  // The job whose colour the dot takes.
  readonly job: Job;
  readonly tooltip: string;
}

// The jobs that the dots take, by the names of their theme variables without
// --bk-color-.
type Job = "muted-foreground" | "warning" | "destructive" | "success";

// The dot of each status that core's scheduler gives a block.
export const DOTS: Readonly<Record<string, Dot>> = {
  stale: { filled: true, job: "muted-foreground", tooltip: "Inputs changed since this block last ran" },
  waiting: { filled: false, job: "warning", tooltip: "Waiting for a data input" },
  invalid: { filled: true, job: "warning", tooltip: "Set this block's inputs" },
  failed: { filled: true, job: "destructive", tooltip: "Evaluation failed" },
  ready: { filled: true, job: "success", tooltip: "Up to date" },
  unevaluated: { filled: false, job: "muted-foreground", tooltip: "Not evaluated yet" },
};

// The dot of a status, or undefined for one that the table lacks.
export function dotOf(status: string): Dot | undefined {
  return Object.hasOwn(DOTS, status) ? DOTS[status] : undefined;
}

// The colour of a dot, as CSS.
export function dotColor(dot: Dot): string {
  return `var(--bk-color-${dot.job})`;
}
