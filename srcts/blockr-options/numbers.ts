// The number that a blockr option holds, as R sends it to the client.
// A deployment sets a blockr option as an R option or as an environment
// variable, and an environment variable gives a string, so a string reads as
// the number that it holds.

import type { Json } from "@blockr/core";

// The number that R sent, or the number that a string holds, so that "20" is
// 20. Anything else is NaN, as are "" and "a", while Number() reads "" as 0.
export function sentNumber(sent: Json): number {
  if (typeof sent === "number") return sent;
  if (typeof sent !== "string" || sent.trim() === "") return Number.NaN;
  return Number(sent);
}
