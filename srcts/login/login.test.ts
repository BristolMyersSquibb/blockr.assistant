// The login with OpenRouter (./login.ts), on happy-dom, with a window and a
// fetch of the test's own: the window that the login opens and where it sends
// it, the code that it takes from the channel, the exchange of the code for
// the key, what the login says where the exchange fails or the browser blocks
// the window, where the chat offers the login, and the login of each key.
// The page that the login calls back posts on the channel as the test does
// here (./callback.ts). The browser tests run the whole login in Chromium,
// against a mock of OpenRouter's (./login.browser.test.ts).

import { createHash } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import type { Fetch } from "../models/index.ts";
import { createVisitorKey } from "../visitor-key/index.ts";
import type { VisitorKey } from "../visitor-key/index.ts";
import { CHANNEL } from "./channel.ts";
import { createLogin, loginOf, OPENROUTER } from "./login.ts";
import type { LoginOptions } from "./login.ts";

const CALLBACK = "https://app.example/blockr.assistant/js/login.html";

// The channels that the tests post on, which they close after each test.
const posters: BroadcastChannel[] = [];

afterEach(() => {
  for (const channel of posters.splice(0)) channel.close();
});

// A window as the login opens it: whether it has a link back to the page, and
// the URLs to which the login sent it.
interface Opened {
  readonly window: WindowProxy;
  readonly sentTo: string[];
}

function openedWindow(): Opened {
  const sentTo: string[] = [];
  const fake = {
    opener: window as WindowProxy | null,
    location: {
      replace: (url: string) => {
        sentTo.push(url);
      },
    },
  };
  return { window: fake as unknown as WindowProxy, sentTo };
}

// An exchange as the login asked for it, with the JSON of its body.
interface Asked {
  readonly url: string;
  readonly init: RequestInit;
  readonly body: Readonly<Record<string, unknown>>;
}

// A login of the key given on a secure page, whose windows and exchanges the
// test reads, with the answer of the service given to each exchange, which
// gives the key sk-or-login unless given.
function started(options: { readonly key?: VisitorKey; readonly answer?: Fetch; readonly open?: LoginOptions["open"] } = {}) {
  const key = options.key ?? createVisitorKey();
  const windows: { readonly url: string; readonly target: string; readonly features: string; readonly opened: Opened }[] = [];
  const asked: Asked[] = [];
  const answer: Fetch = options.answer ?? (() => Promise.resolve(Response.json({ key: "sk-or-login", user_id: "user_1" })));
  const login = createLogin({
    key,
    callbackUrl: CALLBACK,
    secure: true,
    fetch: (url, init) => {
      asked.push({ url, init, body: JSON.parse(typeof init.body === "string" ? init.body : "{}") as Readonly<Record<string, unknown>> });
      return answer(url, init);
    },
    open:
      options.open ??
      ((url, target, features) => {
        const opened = openedWindow();
        windows.push({ url, target, features, opened });
        return opened.window;
      }),
  });
  return { key, login, windows, asked };
}

// The query of the URL to which the login sent the window of its nth start.
async function sentTo(windows: ReturnType<typeof started>["windows"], nth = 0): Promise<URL> {
  await until(() => (windows[nth]?.opened.sentTo.length ?? 0) > 0, "the login to send its window");
  return new URL(windows[nth]?.opened.sentTo[0] ?? "");
}

// Posts a callback on the channel, as the page that the login calls back
// does.
function callBack(code: string, state: string): void {
  const channel = new BroadcastChannel(CHANNEL);
  posters.push(channel);
  channel.postMessage({ code, state });
}

async function until(condition: () => boolean, what: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < 5_000) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${what}.`);
}

describe("the login", () => {
  test("opens a window at once, with no link back to the page, and sends it to the service's login with the callback, a challenge of S256, a state, a label and an expiry of a day", async () => {
    const { login, windows } = started();

    login.start();

    expect(windows).toHaveLength(1);
    expect(windows[0]?.url).toBe("");
    expect(windows[0]?.target).toBe("_blank");
    expect(windows[0]?.features).toMatch(/^popup,width=520,height=720,left=-?\d+,top=-?\d+$/);
    expect(windows[0]?.opened.window.opener).toBeNull();
    const url = await sentTo(windows);
    expect(`${url.origin}${url.pathname}`).toBe(OPENROUTER.authUrl);
    expect([...url.searchParams.keys()]).toEqual(["callback_url", "code_challenge", "code_challenge_method", "state", "key_label", "expiration"]);
    expect(url.searchParams.get("callback_url")).toBe(CALLBACK);
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(url.searchParams.get("key_label")).toBe("blockr");
    expect(url.searchParams.get("expiration")).toBe("1-day");
  });

  test("exchanges the code of its own state, with the verifier whose SHA-256 is the challenge, and gives the visitor's key the key", async () => {
    const { key, login, windows, asked } = started();
    login.start();
    const url = await sentTo(windows);

    callBack("code-1", url.searchParams.get("state") ?? "");
    await until(() => key.current().kind === "given", "the key");

    expect(asked).toHaveLength(1);
    expect(asked[0]?.url).toBe(OPENROUTER.keysUrl);
    expect(asked[0]?.init.method).toBe("POST");
    expect(asked[0]?.init.headers).toEqual({ "content-type": "application/json" });
    const verifier = String(asked[0]?.body.code_verifier);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(asked[0]?.body).toEqual({ code: "code-1", code_verifier: verifier, code_challenge_method: "S256" });
    expect(createHash("sha256").update(verifier).digest("base64url")).toBe(url.searchParams.get("code_challenge"));
    expect(key.current()).toEqual({ kind: "given", key: "sk-or-login" });
    expect(login.current()).toEqual({ kind: "idle" });
  });

  test("makes a new verifier and state for each start, and takes the code of an earlier start too, until a key comes", async () => {
    const { key, login, windows, asked } = started();
    login.start();
    login.start();
    const first = await sentTo(windows, 0);
    const second = await sentTo(windows, 1);
    expect(first.searchParams.get("state")).not.toBe(second.searchParams.get("state"));
    expect(first.searchParams.get("code_challenge")).not.toBe(second.searchParams.get("code_challenge"));

    callBack("code-1", first.searchParams.get("state") ?? "");
    await until(() => key.current().kind === "given", "the key");
    callBack("code-2", second.searchParams.get("state") ?? "");
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(asked.map((exchange) => exchange.body.code)).toEqual(["code-1"]);
  });

  test("takes no code of a state that it did not make, and nothing that is no callback", async () => {
    const { key, login, windows, asked } = started();
    login.start();
    await sentTo(windows);

    callBack("code-1", "another-state");
    const channel = new BroadcastChannel(CHANNEL);
    posters.push(channel);
    channel.postMessage({ code: 1, state: null });
    channel.postMessage("code-1");
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(asked).toEqual([]);
    expect(key.current()).toEqual({ kind: "missing" });
    expect(login.current()).toEqual({ kind: "idle" });
  });

  test("says that it exchanges the code until the service answers", async () => {
    let answer: (response: Response) => void = () => undefined;
    const answered = new Promise<Response>((resolve) => {
      answer = resolve;
    });
    const { key, login, windows } = started({ answer: () => answered });
    login.start();
    const url = await sentTo(windows);

    callBack("code-1", url.searchParams.get("state") ?? "");
    await until(() => login.current().kind === "exchanging", "the exchange");
    expect(key.current()).toEqual({ kind: "missing" });

    answer(Response.json({ key: "sk-or-login" }));
    await until(() => key.current().kind === "given", "the key");
    expect(login.current()).toEqual({ kind: "idle" });
  });

  test("fails in the service's words where the service refuses the exchange, and leaves the visitor's key as it was", async () => {
    const key = createVisitorKey();
    key.give("sk-typed");
    key.refused("sk-typed");
    const { login, windows } = started({ key, answer: () => Promise.resolve(Response.json({ error: { message: "Invalid code or code_verifier", code: 403 } }, { status: 403 })) });
    login.start();
    const url = await sentTo(windows);

    callBack("code-1", url.searchParams.get("state") ?? "");
    await until(() => login.current().kind === "failed", "the failure");

    expect(login.current()).toEqual({ kind: "failed", reason: "OpenRouter refused the login: Invalid code or code_verifier." });
    expect(key.current()).toEqual({ kind: "refused" });
  });

  test("fails with the status where the service refuses the exchange without a message, and starts afresh with the next start", async () => {
    const { login, windows } = started({ answer: () => Promise.resolve(new Response("Bad gateway", { status: 502 })) });
    login.start();
    const url = await sentTo(windows);

    callBack("code-1", url.searchParams.get("state") ?? "");
    await until(() => login.current().kind === "failed", "the failure");
    expect(login.current()).toEqual({ kind: "failed", reason: "OpenRouter refused the login: HTTP 502." });

    login.start();
    expect(login.current()).toEqual({ kind: "idle" });
  });

  test("fails where the page cannot reach the service, or the service sends no key", async () => {
    const unreachable = started({ answer: () => Promise.reject(new TypeError("Failed to fetch")) });
    const keyless = started({ answer: () => Promise.resolve(Response.json({ user_id: "user_1" })) });
    for (const { login, windows } of [unreachable, keyless]) {
      login.start();
      const url = await sentTo(windows);
      callBack("code-1", url.searchParams.get("state") ?? "");
    }
    await until(() => unreachable.login.current().kind === "failed" && keyless.login.current().kind === "failed", "the failures");

    expect(unreachable.login.current()).toEqual({ kind: "failed", reason: "The page could not reach openrouter.ai." });
    expect(keyless.login.current()).toEqual({ kind: "failed", reason: "OpenRouter sent no key." });
    expect(unreachable.key.current()).toEqual({ kind: "missing" });
  });

  test("says that the browser blocked its window where the browser opens none, until the next start", () => {
    let blocked = true;
    const { login } = started({ open: () => (blocked ? null : openedWindow().window) });

    login.start();
    expect(login.current()).toEqual({ kind: "blocked" });

    blocked = false;
    login.start();
    expect(login.current()).toEqual({ kind: "idle" });
  });

  test("gives the same object until it changes, and tells its listeners of each change until they unsubscribe", () => {
    const { login } = started({ open: () => null });
    let told = 0;
    const unsubscribe = login.subscribe(() => {
      told += 1;
    });
    const idle = login.current();
    expect(login.current()).toBe(idle);

    login.start();
    login.start();
    expect(told).toBe(1);

    unsubscribe();
    login.start();
    expect(told).toBe(1);
  });
});

describe("where the chat offers the login", () => {
  test("at the service's base URL alone, on a page that the browser deems secure", () => {
    const secure = createLogin({ key: createVisitorKey(), secure: true });
    const insecure = createLogin({ key: createVisitorKey(), secure: false });

    expect(secure.offers("https://openrouter.ai/api/v1")).toBe(true);
    expect(secure.offers("https://api.openai.com/v1")).toBe(false);
    expect(secure.offers("https://openrouter.ai/api/v1/chat")).toBe(false);
    expect(insecure.offers("https://openrouter.ai/api/v1")).toBe(false);
  });
});

describe("the login of a key", () => {
  test("is one login with OpenRouter for each key", () => {
    const key = createVisitorKey();

    expect(loginOf(key)).toBe(loginOf(key));
    expect(loginOf(key).service).toBe(OPENROUTER);
    expect(loginOf(createVisitorKey())).not.toBe(loginOf(key));
  });
});
