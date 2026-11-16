// How the tools that send no request give a block's status and conditions.
// They read the board as it is now and evaluate nothing, so they say of a
// block that reads stale or unevaluated that it does
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.2#the-tools).

import type { BlockStatus, Condition, Json } from "@blockr/core";

const NOTES: Partial<Record<BlockStatus["status"], string>> = {
  unevaluated:
    "The block has not been evaluated yet, so it holds no result, conditions or summary. Core evaluates only what something needs, such as the blocks on screen. The tools get_block_result and inspect_results have the blocks that they read evaluated first.",
  stale:
    "Something that the block depends on has changed after its last evaluation, so its result, conditions and summary are out of date. Core evaluates only what something needs, such as the blocks on screen. The tools get_block_result and inspect_results have the blocks that they read evaluated first.",
};

// What a status of stale or unevaluated means, or undefined for another.
export function statusNote(status: BlockStatus | undefined): string | undefined {
  return status === undefined ? undefined : NOTES[status.status];
}

// The conditions, each with its severity, the phase that raised it where R
// names one, and its message.
export function conditionList(conditions: readonly Condition[]): Json[] {
  return conditions.map(({ severity, phase, message }) => ({ severity, ...(phase === undefined ? {} : { phase }), message }));
}

// The conditions by severity, errors first, each with the phase that raised
// it where R names one, and its message.
export function conditionsBySeverity(conditions: readonly Condition[]): Record<string, Json[]> {
  const grouped: Record<string, Json[]> = {};
  for (const severity of ["error", "warning", "message"] as const) {
    const of = conditions.filter((condition) => condition.severity === severity);
    if (of.length > 0) grouped[severity] = of.map(({ phase, message }) => ({ ...(phase === undefined ? {} : { phase }), message }));
  }
  return grouped;
}
