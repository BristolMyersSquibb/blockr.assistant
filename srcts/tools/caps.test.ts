// The caps on what the tools return, read through CoreApi.blockrOption().

import type { Json } from "@blockr/core";
import { describe, expect, test } from "vitest";
import { readToolCap } from "./caps.ts";

// What of CoreApi the caps read, where R sends the value given, or none.
function sending(value?: Json) {
  return { blockrOption: () => Promise.resolve(value) };
}

describe("readToolCap", () => {
  test("is today's default where nothing sets the cap", async () => {
    await expect(readToolCap(sending(), "assistant_summary_max_chars")).resolves.toBe(2000);
    await expect(readToolCap(sending(), "assistant_state_max_chars")).resolves.toBe(20000);
    await expect(readToolCap(sending(), "assistant_state_value_max_chars")).resolves.toBe(128);
    await expect(readToolCap(sending(), "assistant_description_max_chars")).resolves.toBe(1000);
    await expect(readToolCap(sending(), "assistant_skill_description_max_chars")).resolves.toBe(1024);
  });

  test("takes a whole number of 0 or more, or a string that holds one, as an environment variable gives", async () => {
    await expect(readToolCap(sending(500), "assistant_summary_max_chars")).resolves.toBe(500);
    await expect(readToolCap(sending(0), "assistant_summary_max_chars")).resolves.toBe(0);
    await expect(readToolCap(sending(" 300 "), "assistant_summary_max_chars")).resolves.toBe(300);
  });

  test("fails for any other value, naming it as R sent it", async () => {
    for (const value of [-1, 1.5, "", "many", null, true]) {
      await expect(readToolCap(sending(value), "assistant_summary_max_chars")).rejects.toThrow(
        `The blockr option assistant_summary_max_chars is ${JSON.stringify(value)}, where it takes a whole number of 0 or more.`,
      );
    }
  });
});
