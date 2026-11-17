// Up and Down in the message field (./recall.ts), and where a link leads
// (./links.tsx).

import { describe, expect, test } from "vitest";
import { leavesSite } from "./links.tsx";
import { recall } from "./recall.ts";

const history = ["first", "second"];

describe("Up and Down in the message field", () => {
  test("bring back the last message from an empty field, then the ones before and after it", () => {
    expect(recall(history, undefined, "", "up")).toEqual({ at: 1, text: "second" });
    expect(recall(history, 1, "second", "up")).toEqual({ at: 0, text: "first" });
    expect(recall(history, 0, "first", "up")).toEqual({ at: 0, text: "first" });
    expect(recall(history, 0, "first", "down")).toEqual({ at: 1, text: "second" });
    expect(recall(history, 1, "second", "down")).toEqual({ at: undefined, text: "" });
  });

  test("move the caret instead in a field that holds text that they did not bring back, or as Down in an empty field", () => {
    expect(recall(history, undefined, "typed", "up")).toBeUndefined();
    expect(recall(history, 1, "second, edited", "up")).toBeUndefined();
    expect(recall(history, undefined, "", "down")).toBeUndefined();
    expect(recall([], undefined, "", "up")).toBeUndefined();
  });
});

describe("a link in the chat's text", () => {
  test("leaves the site where it leads over the web to another origin", () => {
    const page = "https://connect.example.com/app/";
    expect(leavesSite("https://cran.r-project.org/", page)).toBe(true);
    expect(leavesSite("http://connect.example.com/app/", page)).toBe(true);
    expect(leavesSite("/docs", page)).toBe(false);
    expect(leavesSite("https://connect.example.com/other", page)).toBe(false);
    expect(leavesSite("mailto:someone@example.org", page)).toBe(false);
  });
});
