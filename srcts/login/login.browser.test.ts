// The login with OpenRouter (./login.ts) in headless Chromium, against the
// mock of OpenRouter's page for the login and of its exchange of a code for
// a key, which another origin serves (../testing/mock-apis.ts). A login runs in
// these steps, as on the page of an app:
// 1. The login opens its window and sends it to the mock's page for the login.
// 2. The mock sends the window to the page that the login calls back, which
//    Vite serves from srcts/login/login.html, as core serves login.html beside
//    the plugin's module.
// 3. That page posts the code on the channel and closes its window.
// 4. The login exchanges the code at the mock, across origins, as a page
//    exchanges it at OpenRouter.

import { beforeEach, expect, inject, test } from "vitest";
import type { RecordedRequest } from "../testing/index.ts";
import { createVisitorKey } from "../visitor-key/index.ts";
import { CHANNEL, createLogin } from "./index.ts";
import type { LoginService, OpenWindow } from "./index.ts";

const mock = inject("mockApis");

const SERVICE: LoginService = {
  name: "OpenRouter",
  baseUrl: `${mock.origin}/openrouter/api/v1`,
  authUrl: `${mock.origin}/openrouter/auth`,
  keysUrl: `${mock.origin}/openrouter/api/v1/auth/keys`,
};

beforeEach(async () => {
  await fetch(`${mock.origin}/__reset`, { method: "POST" });
});

async function reached(path: string): Promise<RecordedRequest[]> {
  const response = await fetch(`${mock.origin}/__requests`);
  return ((await response.json()) as RecordedRequest[]).filter((request) => request.path === path && request.method !== "OPTIONS");
}

async function until(condition: () => boolean, what: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < 10_000) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${what}.`);
}

// Opens windows as the page does, and keeps each, so that a test sees whether
// the page that the login calls back closed it.
function windowsOpened(): { readonly open: OpenWindow; readonly opened: WindowProxy[] } {
  const opened: WindowProxy[] = [];
  return {
    opened,
    open: (url, target, features) => {
      const login = window.open(url, target, features);
      if (login !== null) opened.push(login);
      return login;
    },
  };
}

test("gives the key that the service makes, through a window of its own whose page hands the code back and closes", async () => {
  const key = createVisitorKey();
  const { open, opened } = windowsOpened();
  const login = createLogin({ key, service: SERVICE, open });

  login.start();
  await until(() => key.current().kind === "given", "the key");

  expect(key.current()).toEqual({ kind: "given", key: mock.loginKey });
  expect(login.current()).toEqual({ kind: "idle" });
  const [auth] = await reached("/openrouter/auth");
  expect(auth?.query).toEqual({
    callback_url: `${location.origin}/srcts/login/login.html`,
    code_challenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) as unknown,
    code_challenge_method: "S256",
    state: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/) as unknown,
    expiration: "1-day",
  });
  const [exchange] = await reached("/openrouter/api/v1/auth/keys");
  expect(exchange?.body).toEqual({ code: expect.stringMatching(/^code-/) as unknown, code_verifier: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) as unknown, code_challenge_method: "S256" });
  await until(() => opened[0]?.closed === true, "the window to close");
});

test("fails in the service's words where the service refuses the code, whose refusal the page reads", async () => {
  const key = createVisitorKey();
  let sentTo: string | undefined;
  // A window that the login sends to the service's page, which this test
  // reads and leaves alone, so that the test calls the login back itself.
  const open: OpenWindow = () => ({ opener: window, location: { replace: (url: string) => (sentTo = url) } }) as unknown as WindowProxy;
  const login = createLogin({ key, service: SERVICE, open });

  login.start();
  await until(() => sentTo !== undefined, "the login to send its window");
  const state = new URL(sentTo ?? "").searchParams.get("state") ?? "";
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage({ code: "code-forged", state });
  channel.close();
  await until(() => login.current().kind === "failed", "the failure");

  expect(login.current()).toEqual({ kind: "failed", reason: "OpenRouter refused the login: Invalid code or code_verifier." });
  expect(key.current()).toEqual({ kind: "missing" });
});
