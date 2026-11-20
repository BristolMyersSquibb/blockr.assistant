// The visitor's own key (./visitor-key.ts): what it is after each thing that
// the visitor, the turns and the models tell it, which key a report concerns,
// the snapshot that the chat follows, and the key of the page. Then the entry
// that keeps the key in the browser's local storage: which key the key takes
// from it, which keys it writes and removes, until the board's signal aborts,
// and what keepKey() hands the key for each deployment.

import type { CoreApi } from "@blockr/core";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Deployment } from "../deployment/index.ts";
import { keyEntry } from "./entry.ts";
import type { KeyEntry } from "./entry.ts";
import { createVisitorKey, keepKey, keyOf, pageKey, reloadPageKey } from "./visitor-key.ts";

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

// An entry in memory, which holds the key given, and records what the key
// writes to it and removes from it.
function memoryEntry(held?: string) {
  const told: string[] = [];
  const entry: KeyEntry = {
    read: () => Promise.resolve(held),
    write(key) {
      held = key;
      told.push(`write ${key}`);
      return Promise.resolve();
    },
    remove(key) {
      if (held === key) held = undefined;
      told.push(`remove ${key}`);
      return Promise.resolve();
    },
  };
  return { entry, told, held: () => held };
}

describe("the visitor's key, where an entry keeps it", () => {
  test("is not kept until an entry keeps it", () => {
    expect(createVisitorKey().kept()).toBe(false);
  });

  test("takes the key that the entry holds where the visitor has given none", async () => {
    const key = createVisitorKey();

    await key.keepIn(memoryEntry("sk-kept").entry);

    expect(key.current()).toEqual({ kind: "given", key: "sk-kept" });
    expect(key.kept()).toBe(true);
  });

  test("keeps the key that the visitor gave rather than the entry's, and stays missing where the entry holds none", async () => {
    const given = createVisitorKey();
    given.give("sk-typed");
    await given.keepIn(memoryEntry("sk-kept").entry);
    expect(given.current()).toEqual({ kind: "given", key: "sk-typed" });

    const none = createVisitorKey();
    await none.keepIn(memoryEntry().entry);
    expect(none.current()).toEqual({ kind: "missing" });
  });

  test("keeps the key that the visitor gives while the key reads the entry", async () => {
    const key = createVisitorKey();
    let release: (held: string) => void = () => undefined;
    const slow: KeyEntry = {
      read: () => new Promise((resolve) => (release = resolve)),
      write: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    };

    const reading = key.keepIn(slow);
    key.give("sk-typed");
    release("sk-kept");
    await reading;

    expect(key.current()).toEqual({ kind: "given", key: "sk-typed" });
  });

  test("writes a key to the entry once the base URL takes it, and never a key that the visitor has replaced", async () => {
    const key = createVisitorKey();
    const { entry, told, held } = memoryEntry();
    await key.keepIn(entry);

    key.give("sk-first");
    expect(told).toEqual([]);
    key.took("sk-first");
    key.give("sk-second");
    key.took("sk-first");

    expect(told).toEqual(["write sk-first"]);
    expect(held()).toBe("sk-first");
  });

  test("writes a key that may have been wrong once the base URL takes it", async () => {
    const key = createVisitorKey();
    const { entry, told } = memoryEntry();
    await key.keepIn(entry);
    key.give("sk-visitor");
    key.lost("sk-visitor");

    key.took("sk-visitor");

    expect(key.current()).toEqual({ kind: "given", key: "sk-visitor" });
    expect(told).toEqual(["write sk-visitor"]);
  });

  test("has the entry remove a key once the base URL refuses it, and write the key again once it is given and taken", async () => {
    const key = createVisitorKey();
    const { entry, told, held } = memoryEntry("sk-kept");
    await key.keepIn(entry);

    key.refused("sk-kept");
    expect(key.current()).toEqual({ kind: "refused" });
    expect(held()).toBeUndefined();

    key.give("sk-kept");
    key.took("sk-kept");
    expect(told).toEqual(["remove sk-kept", "write sk-kept"]);
  });

  test("has the entry remove a key that the base URL refuses after the visitor replaced it", async () => {
    const key = createVisitorKey();
    const { entry, told } = memoryEntry("sk-kept");
    await key.keepIn(entry);
    key.give("sk-typed");

    key.refused("sk-kept");

    expect(key.current()).toEqual({ kind: "given", key: "sk-typed" });
    expect(told).toEqual(["remove sk-kept"]);
  });
});

describe("keepKey()", () => {
  const SECRET = "a-long-random-secret";
  const OPENROUTER = "https://openrouter.ai/api/v1";
  const visitor = (keySecret?: string): Deployment => ({
    baseUrl: OPENROUTER,
    api: "openai-completions",
    credential: keySecret === undefined ? { kind: "visitor" } : { kind: "visitor", keySecret },
    models: undefined,
  });

  // A CoreApi whose log records what the assistant warns of.
  function logging() {
    const warned: string[] = [];
    const log = () => ({ warn: (message: string) => warned.push(message) });
    return { core: { log } as unknown as Pick<CoreApi, "log">, warned };
  }

  // Has the browser keep the key given for the page's path and OpenRouter's
  // base URL, as an earlier visit did.
  function keptBefore(kept: string): Promise<void> {
    return keyEntry({ secret: SECRET, baseUrl: OPENROUTER, path: location.pathname, subtle: crypto.subtle, storage: localStorage }).write(kept);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  test("has the entry of the page's path and the base URL keep the key, which takes the key that the browser kept", async () => {
    await keptBefore("sk-or-kept");
    const key = createVisitorKey();

    await keepKey(logging().core, key, visitor(SECRET));

    expect(key.current()).toEqual({ kind: "given", key: "sk-or-kept" });
    expect(key.kept()).toBe(true);
  });

  test("leaves the key in the page's memory where the deployment sets no secret, or a key of its own", async () => {
    await keptBefore("sk-or-kept");
    const keyed: Deployment = { ...visitor(SECRET), credential: { kind: "deployment", key: "sk-deployment" } };

    for (const deployment of [visitor(), keyed]) {
      const key = createVisitorKey();
      await keepKey(logging().core, key, deployment);
      expect(key.current()).toEqual({ kind: "missing" });
      expect(key.kept()).toBe(false);
    }
  });

  test("leaves the key in the page's memory where the page has no Web Crypto, and logs why", async () => {
    vi.stubGlobal("crypto", {});
    const { core, warned } = logging();
    const key = createVisitorKey();

    await keepKey(core, key, visitor(SECRET));

    expect(key.kept()).toBe(false);
    expect(warned).toEqual([
      "The blockr option assistant_key_secret is set, but the browser offers this page no Web Crypto to encrypt the visitor's key, as on a page that it does not deem secure. So the page keeps the key in its memory alone.",
    ]);
  });

  test("leaves the key in the page's memory, with nothing logged, where the browser refuses local storage", async () => {
    vi.spyOn(globalThis, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("The page may not use local storage.", "SecurityError");
    });
    const { core, warned } = logging();
    const key = createVisitorKey();

    await keepKey(core, key, visitor(SECRET));

    expect(key.kept()).toBe(false);
    expect(warned).toEqual([]);
  });
});
