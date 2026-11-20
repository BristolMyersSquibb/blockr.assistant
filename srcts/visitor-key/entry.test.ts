// The entry that keeps the visitor's key in the browser's local storage
// (./entry.ts), on happy-dom's Web Crypto and local storage: what the entry
// holds, which app and base URL read it, what a changed secret reads, which
// key a removal removes, and a browser that refuses local storage.

import { afterEach, describe, expect, test } from "vitest";
import { storedIn } from "../testing/index.ts";
import { keyEntry } from "./entry.ts";
import type { KeyEntry, KeyEntryOptions } from "./entry.ts";

const SECRET = "a-long-random-secret";
const OPENROUTER = "https://openrouter.ai/api/v1";
const APP = "/content/0b2c9a41/";
const NAME = `blockr.assistant-visitor_key ["${APP}","${OPENROUTER}"]`;

afterEach(() => {
  localStorage.clear();
});

// The entry of the app's path and the base URL given, encrypted with the
// secret given, in the page's local storage.
function entry(options: Partial<KeyEntryOptions> = {}): KeyEntry {
  return keyEntry({ secret: SECRET, baseUrl: OPENROUTER, path: APP, subtle: crypto.subtle, storage: localStorage, ...options });
}

describe("the entry of the visitor's key", () => {
  test("holds the key encrypted, under a name of the app's path and the base URL, and reads it back", async () => {
    await entry().write("sk-or-visitor");

    expect(localStorage.length).toBe(1);
    expect(localStorage.key(0)).toBe(NAME);
    expect(storedIn(localStorage)).not.toContain("sk-or-visitor");
    expect(storedIn(localStorage)).not.toContain(SECRET);
    await expect(entry().read()).resolves.toBe("sk-or-visitor");
  });

  test("encrypts each write afresh, and holds only the last key written", async () => {
    await entry().write("sk-or-visitor");
    const first = localStorage.getItem(NAME);
    await entry().write("sk-or-visitor");

    expect(localStorage.getItem(NAME)).not.toBe(first);
    await entry().write("sk-or-other");
    expect(localStorage.length).toBe(1);
    await expect(entry().read()).resolves.toBe("sk-or-other");
  });

  test("reads nothing for another app of the origin, or for another base URL", async () => {
    await entry().write("sk-or-visitor");

    await expect(entry({ path: "/content/77d1e3f0/" }).read()).resolves.toBeUndefined();
    await expect(entry({ baseUrl: "https://api.openai.com/v1" }).read()).resolves.toBeUndefined();
    await expect(entry().read()).resolves.toBe("sk-or-visitor");
  });

  test("counts an entry that another secret encrypted as none, and removes it", async () => {
    await entry().write("sk-or-visitor");

    await expect(entry({ secret: "another-secret" }).read()).resolves.toBeUndefined();
    expect(localStorage.length).toBe(0);
  });

  test("counts what is no entry as none, and removes it", async () => {
    localStorage.setItem(NAME, "not base64!");

    await expect(entry().read()).resolves.toBeUndefined();
    expect(localStorage.length).toBe(0);
  });

  test("is removed where it holds the key given, and stays where it holds another", async () => {
    await entry().write("sk-or-newer");

    await entry().remove("sk-or-older");
    await expect(entry().read()).resolves.toBe("sk-or-newer");

    await entry().remove("sk-or-newer");
    expect(localStorage.length).toBe(0);
  });

  test("writes nothing, reads none and fails nothing where the browser refuses local storage while the page runs", async () => {
    const refuse = (): never => {
      throw new DOMException("The page may not use local storage.", "SecurityError");
    };
    const refusing = entry({ storage: { length: 0, key: refuse, getItem: refuse, setItem: refuse, removeItem: refuse, clear: refuse } });

    await expect(refusing.write("sk-or-visitor")).resolves.toBeUndefined();
    await expect(refusing.read()).resolves.toBeUndefined();
    await expect(refusing.remove("sk-or-visitor")).resolves.toBeUndefined();
  });
});
