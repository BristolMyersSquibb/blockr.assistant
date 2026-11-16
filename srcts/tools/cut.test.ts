// How a tool bounds what it returns.

import { describe, expect, test } from "vitest";
import { bounded, cutText, leaveOutLong, skillBlurb } from "./cut.ts";

describe("cutText", () => {
  test("leaves a text within the cap as it is", () => {
    expect(cutText("Twelve chars", 12, "a hint")).toBe("Twelve chars");
  });

  test("cuts a text so that it and its marker take no more than the cap, with the hint after the marker", () => {
    const cut = cutText("x".repeat(100), 60, "call get_block_state");

    // The marker of the cut names 91 characters, while the room kept for it
    // fits the 100 that the cut could lose at most.
    expect(cut).toBe(`${"x".repeat(9)}\n... [+91 chars truncated -- call get_block_state]`);
    expect(Array.from(cut)).toHaveLength(59);
  });

  test("keeps none of a text whose marker alone takes more than the cap", () => {
    expect(cutText("x".repeat(30), 10)).toBe("\n... [+30 chars truncated]");
  });

  test("counts characters rather than the units of a JS string", () => {
    expect(cutText("ü".repeat(5) + "😀".repeat(5), 10)).toBe("ü".repeat(5) + "😀".repeat(5));
    expect(cutText("😀".repeat(40), 30)).toBe(`${"😀".repeat(4)}\n... [+36 chars truncated]`);
  });
});

describe("leaveOutLong", () => {
  test("leaves out each string whose JSON takes more than the cap, in arrays and objects too, and marks it with the hint", () => {
    expect(leaveOutLong({ short: "ok", long: "x".repeat(20), nested: [{ n: 3, text: "y".repeat(30) }] }, 12, "call get_block_state")).toEqual({
      short: "ok",
      long: "[20 chars omitted -- call get_block_state]",
      nested: [{ n: 3, text: "[30 chars omitted -- call get_block_state]" }],
    });
  });

  test("counts the quotes and escapes of a string's JSON", () => {
    expect(leaveOutLong(["abcdefghij", 'say "hi"'], 10, "h")).toEqual(["[10 chars omitted -- h]", "[8 chars omitted -- h]"]);
  });
});

describe("bounded", () => {
  test("leaves a value within its budget as it is", () => {
    const value = { script: "x <- 1", n: 3, flags: [true, null], nested: { label: "A" } };

    expect(bounded(value, 100)).toEqual(value);
  });

  test("cuts each string to what is left of the budget, in order, so that later strings keep less", () => {
    expect(bounded({ first: "a".repeat(30), second: "b".repeat(60), third: "c" }, 70)).toEqual({
      first: "a".repeat(30),
      second: `${"b".repeat(14)}\n... [+46 chars truncated]`,
      third: "\n... [+1 chars truncated]",
    });
  });

  test("keeps a number that the budget affords, and cuts the JSON of one that it does not", () => {
    expect(bounded([12345, 67890], 7)).toEqual([12345, "\n... [+5 chars truncated]"]);
  });
});

describe("skillBlurb", () => {
  test("puts a description on one line, and cuts it at the cap with the hint to read the skill", () => {
    expect(skillBlurb("tables", "Exposure\n   tables  ", 100)).toBe("Exposure tables");
    expect(skillBlurb("tables", "x".repeat(100), 80)).toBe(`${"x".repeat(11)}\n... [+89 chars truncated -- call read_skill("tables") for the rest]`);
  });
});
