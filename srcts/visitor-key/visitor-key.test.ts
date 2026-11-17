// The visitor's own key (./visitor-key.ts): what it is after each thing that
// the visitor, the turns and the models tell it, which key a report concerns,
// the snapshot that the chat follows, and the key of the page.

import { describe, expect, test } from "vitest";
import { createVisitorKey, keyOf, pageKey, reloadPageKey } from "./visitor-key.ts";

describe("the visitor's key", () => {
  test("is missing until the visitor gives one, which the calls then carry", () => {
    const key = createVisitorKey();
    expect(key.current()).toEqual({ kind: "missing" });
    expect(keyOf(key.current())).toBeUndefined();

    key.give("sk-visitor");

    expect(key.current()).toEqual({ kind: "given", key: "sk-visitor" });
    expect(keyOf(key.current())).toBe("sk-visitor");
  });

  test("is dropped once the base URL refuses it, so that the calls carry none", () => {
    const key = createVisitorKey();
    key.give("sk-wrong");

    key.refused("sk-wrong");

    expect(key.current()).toEqual({ kind: "refused" });
    expect(keyOf(key.current())).toBeUndefined();
  });

  test("stays, in doubt, where a call and the list lost their connection, until the base URL takes it", () => {
    const key = createVisitorKey();
    key.give("sk-visitor");

    key.lost("sk-visitor");
    expect(key.current()).toEqual({ kind: "lost", key: "sk-visitor" });
    expect(keyOf(key.current())).toBe("sk-visitor");

    key.took("sk-visitor");
    expect(key.current()).toEqual({ kind: "given", key: "sk-visitor" });
  });

  test("stays as it is where a report concerns a key that the visitor has replaced", () => {
    const key = createVisitorKey();
    key.give("sk-first");
    key.give("sk-second");

    key.refused("sk-first");
    key.lost("sk-first");

    expect(key.current()).toEqual({ kind: "given", key: "sk-second" });
  });

  test("gives the same object until it changes, and tells its listeners of each change until they unsubscribe", () => {
    const key = createVisitorKey();
    let told = 0;
    const unsubscribe = key.subscribe(() => {
      told += 1;
    });
    key.give("sk-visitor");
    const given = key.current();

    key.give("sk-visitor");
    key.took("sk-visitor");
    expect(key.current()).toBe(given);
    expect(told).toBe(1);

    unsubscribe();
    key.refused("sk-visitor");
    expect(told).toBe(1);
  });

  test("of the page is one for every board of the page, until the page reloads", () => {
    const page = pageKey();
    page.give("sk-visitor");
    expect(pageKey()).toBe(page);

    reloadPageKey();

    expect(pageKey()).not.toBe(page);
    expect(pageKey().current()).toEqual({ kind: "missing" });
  });
});
