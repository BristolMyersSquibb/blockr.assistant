// The entry that keeps the visitor's key in the browser's local storage
// (./entry.ts), on happy-dom's Web Crypto and local storage: what the entry
// holds, which app and base URL read it, what a changed secret reads, which
// key a removal removes, and a browser that refuses local storage. Then the
// entry that the apps of the origin share: which apps read it, and which
// entries it keeps apart.

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

// The entry of the app's path and the base URL given, for the app alone
// unless told otherwise, encrypted with the secret given, in the page's local
// storage.
function entry(options: Partial<KeyEntryOptions> = {}): KeyEntry {
  return keyEntry({ secret: SECRET, scope: "app", baseUrl: OPENROUTER, path: APP, subtle: crypto.subtle, storage: localStorage, ...options });
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

describe("the entry of the visitor's key, for the apps of the origin", () => {
  const OTHER_APP = "/content/77d1e3f0/";
  const shared = (options: Partial<KeyEntryOptions> = {}): KeyEntry => entry({ scope: "origin", ...options });

  test("holds the key under a name of an id of the secret and the base URL, which every app of the origin with the secret reads", async () => {
    await shared().write("sk-or-visitor");

    expect(localStorage.length).toBe(1);
    expect(localStorage.key(0)).toMatch(/^blockr\.assistant-visitor_key \["[0-9a-f]{32}","https:\/\/openrouter\.ai\/api\/v1"\]$/);
    expect(storedIn(localStorage)).not.toContain(SECRET);
    expect(storedIn(localStorage)).not.toContain("sk-or-visitor");
    await expect(shared({ path: OTHER_APP }).read()).resolves.toBe("sk-or-visitor");
    await expect(shared({ baseUrl: "https://api.openai.com/v1" }).read()).resolves.toBeUndefined();
  });

  test("keeps the entry of another secret apart, so that neither app removes the key of the other", async () => {
    await shared().write("sk-or-visitor");
    await shared({ secret: "another-secret", path: OTHER_APP }).write("sk-or-other");

    await expect(shared({ secret: "another-secret" }).read()).resolves.toBe("sk-or-other");
    await expect(shared({ path: OTHER_APP }).read()).resolves.toBe("sk-or-visitor");
    expect(localStorage.length).toBe(2);
  });

  test("never meets the entry of an app alone, even of the same secret, path and base URL", async () => {
    await entry().write("sk-or-app");
    await shared().write("sk-or-origin");

    expect(localStorage.length).toBe(2);
    await expect(entry().read()).resolves.toBe("sk-or-app");
    await expect(shared().read()).resolves.toBe("sk-or-origin");
  });

  test("is removed from the page of any app with the secret, where it holds the key given", async () => {
    await shared().write("sk-or-visitor");

    await shared({ path: OTHER_APP }).remove("sk-or-older");
    expect(localStorage.length).toBe(1);
    await shared({ path: OTHER_APP }).remove("sk-or-visitor");
    expect(localStorage.length).toBe(0);
  });
});
