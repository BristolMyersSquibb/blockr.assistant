// How a tool bounds what it returns, as today's tools do
// (R/utils-bounds.R and R/describe-block.R at fcbdb27)
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.2#how-failures-reach-the-model):
// - A text past its cap is cut and marked with how many characters it lost,
//   and with the tool that reads the rest where one does.
// - A value that a summary cannot show is left out and marked, with the tool
//   that reads it in full.
// - A state is bounded by one budget that its strings spend in order, so that
//   a state with five long values costs no more than one with one.
// Each counts characters, rather than the UTF-16 units of a JS string, as R
// counts them.

import type { Json } from "@blockr/core";

// The text cut so that it and its marker take no more than `max` characters,
// with the hint after the marker where one is given. A text within `max`
// stays as it is.
export function cutText(text: string, max: number, hint?: string): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  const marker = (lost: number): string => `\n... [+${String(lost)} chars truncated${hint === undefined ? "" : ` -- ${hint}`}]`;
  // The marker for the most characters that the cut can lose, so that the
  // room it takes covers the marker that the cut gets.
  const keep = Math.max(0, max - Array.from(marker(chars.length)).length);
  return chars.slice(0, keep).join("") + marker(chars.length - keep);
}

// The value with each string whose JSON takes more than `max` characters
// left out and marked, with the hint, in arrays and objects too. Its JSON
// counts the quotes and escapes, which a string with quotes or line breaks
// takes beyond its own characters.
export function leaveOutLong(value: Json, max: number, hint: string): Json {
  if (typeof value === "string") {
    return Array.from(JSON.stringify(value)).length > max ? `[${String(Array.from(value).length)} chars omitted -- ${hint}]` : value;
  }
  if (Array.isArray(value)) return (value as readonly Json[]).map((item) => leaveOutLong(item, max, hint));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, leaveOutLong(item, max, hint)]));
  }
  return value;
}

// The value bounded by a budget of `max` characters, which its values spend
// in order, those inside arrays and objects included:
// - A string is cut to what is left of the budget, and spends what it keeps,
//   its marker included.
// - Any other value that the budget affords stays as it is, and spends what
//   its JSON takes. One that it does not afford becomes its JSON, cut so.
export function bounded(value: Json, max: number): Json {
  let budget = max;
  const spend = (text: string): string => {
    const kept = cutText(text, Math.max(0, budget));
    budget -= Array.from(kept).length;
    return kept;
  };
  const walk = (item: Json): Json => {
    if (typeof item === "string") return spend(item);
    if (Array.isArray(item)) return (item as readonly Json[]).map(walk);
    if (item !== null && typeof item === "object") {
      return Object.fromEntries(Object.entries(item).map(([key, inner]) => [key, walk(inner)]));
    }
    const text = JSON.stringify(item);
    if (text.length <= budget) {
      budget -= text.length;
      return item;
    }
    return spend(text);
  };
  return walk(value);
}

// The description of a skill as a list shows it: on one line, and cut at
// `max` characters, with the hint to read the skill for the rest.
export function skillBlurb(name: string, description: string, max: number): string {
  return cutText(description.replace(/\s+/g, " ").trim(), max, `call read_skill("${name}") for the rest`);
}
