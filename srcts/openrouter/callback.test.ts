// The script of the page that OpenRouter's login calls back (./callback.ts),
// on happy-dom: what it posts on the channel, what the page says and whether
// it closes its window, with a code and a state in the page's query and
// without, and on a page that holds no note.
// The browser tests run the script in the login's own window
// (./login.browser.test.ts).
// Istanbul collects its counts from the test's own page only,
// so the coverage of the script comes from these tests.

import { afterEach, expect, test, vi } from "vitest";
import { CHANNEL } from "./channel.ts";

// The messages that the script posts, each with the name of its channel.
const posted: { readonly channel: string; readonly message: unknown }[] = [];

// A channel that keeps what the script posts on it, in place of the page's.
class Channel {
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  postMessage(message: unknown): void {
    posted.push({ channel: this.name, message });
  }
}

afterEach(() => {
  posted.splice(0);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Loads the page at the query that OpenRouter's login gives it, and runs the
// script, as the page does as it loads.
// The page holds the note of openrouter.html, unless the body says otherwise.
// Gives what the page then says, and the spy on its window's close().
async function load(query: string, body = '<p id="note">You can close this window.</p>') {
  history.replaceState(null, "", `/blockr.assistant/js/openrouter.html${query}`);
  document.body.innerHTML = body;
  vi.stubGlobal("BroadcastChannel", Channel);
  const close = vi.spyOn(window, "close").mockImplementation(() => undefined);
  vi.resetModules();
  await import("./callback.ts");
  return { note: document.getElementById("note")?.textContent, close };
}

test("hands the code and the state of its query to the login on the channel, says that the assistant finishes the login and closes its window", async () => {
  const { note, close } = await load("?code=code-1&state=state-1");

  expect(posted).toEqual([{ channel: CHANNEL, message: { code: "code-1", state: "state-1" } }]);
  expect(note).toBe("The assistant finishes the login. You can close this window.");
  expect(close).toHaveBeenCalledOnce();
});

test.each(["", "?state=state-1", "?code=&state=state-1", "?code=code-1", "?code=code-1&state="])(
  "posts nothing where the query %j lacks a code or a state, as after the visitor denied the app, says that the login did not finish and leaves its window open",
  async (query) => {
    const { note, close } = await load(query);

    expect(posted).toEqual([]);
    expect(note).toBe("The login did not finish. You can close this window, and log in again from the app.");
    expect(close).not.toHaveBeenCalled();
  },
);

test("hands the code to the login and closes its window on a page that holds no note", async () => {
  const { note, close } = await load("?code=code-1&state=state-1", "");

  expect(posted).toEqual([{ channel: CHANNEL, message: { code: "code-1", state: "state-1" } }]);
  expect(note).toBeUndefined();
  expect(close).toHaveBeenCalledOnce();
});

test("posts nothing and leaves its window open on a page that holds no note, where the query holds no code", async () => {
  const { note, close } = await load("?state=state-1", "");

  expect(posted).toEqual([]);
  expect(note).toBeUndefined();
  expect(close).not.toHaveBeenCalled();
});
