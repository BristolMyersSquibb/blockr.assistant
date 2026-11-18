// The login with a service that offers one to a web page, which gives the page
// a key on the visitor's own account, billed to the visitor
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.1#how-a-call-is-authenticated).
// OpenRouter offers one, so the chat offers its login beside the field for the
// visitor's key, where the deployment leaves the blockr option
// assistant_api_key unset and the base URL is OpenRouter's,
// https://openrouter.ai/api/v1 (../chat).
//
// The login is OpenRouter's OAuth flow with PKCE
// (https://openrouter.ai/docs/use-cases/oauth-pkce), in these steps:
// 1. The visitor clicks the chat's button for the login.
// 2. The login opens a window of its own at once, since a browser lets a page
//    open a window only while the page handles a click.
// 3. The login makes a random code verifier and a random state. It keeps both
//    in its memory until the key comes.
// 4. The login sends the window to the service's page for the login. The URL
//    carries the URL of the page that the login calls back, the code
//    challenge that the login made from the verifier, the state, and a label
//    and an expiry of a day for the new key.
// 5. The visitor logs in and authorizes the app.
// 6. The service sends the window to the page that the login calls back, with
//    a code and the state in its query.
// 7. That page posts the code and the state on a BroadcastChannel, and closes
//    its window (./callback.ts).
// 8. The login takes a code whose state it made. It exchanges the code and
//    the verifier for the key at the service.
// 9. The login gives the key to the visitor's key, as the field gives a typed
//    key. So the turns, the models and the compaction read the key as they
//    read a typed one (../visitor-key).
//
// The page that the login calls back is login.html, which the build writes
// beside the plugin's module (../build). Core serves every file beside the
// module, so the login finds the page at the module's own URL. Loading the
// page starts no session of R, since httpuv serves the file itself.
//
// The login opens its window with no link back to the app's page. So the
// service's pages, and the pages of the sign-ins that they pass through,
// cannot send the app's tab elsewhere. That is why the page that the login
// calls back hands the code over the channel rather than to window.opener:
// every page of the app's origin hears the channel, whatever links the
// windows. The state tells the login which code is its own, so another tab
// of the app ignores the code. A code is of no use without the verifier,
// which no other page holds.
//
// Each click opens a window and starts a login of its own, with its own
// verifier and state, and the login takes the code of any login that it
// started. So the visitor can finish the login in the window of an earlier
// click, or of the last. Once a key comes, the login forgets the others, and
// closes the channel.
//
// The key that a login gives is labelled blockr, so that the visitor can tell
// it apart in their list of keys. It expires after a day. The visitor can
// change both as they authorize. A reload drops the key, and a login after
// it makes a new key. So the keys of earlier logins do not pile up on the
// visitor's account. A key that expires while the page is open fails the
// next call, and the chat then asks for a key again (../turns).
//
// The browser makes the code challenge only on a page that it deems secure,
// such as one served over HTTPS or from localhost. So the chat offers the
// login only there, as OpenRouter asks of a hosted app's callback.
//
// The plugin keeps one login for each visitor's key, in its module's scope,
// as it keeps the key (loginOf()). So a login that runs as another board
// opens still gives the page's key, and the next board's chat shows the
// login's state.

import type { Fetch } from "../models/index.ts";
import type { VisitorKey } from "../visitor-key/index.ts";
import { CHANNEL, isCallback } from "./channel.ts";
import type { Callback } from "./channel.ts";

// A service that offers a login to a web page.
export interface LoginService {
  // The service's name, which the chat's button names, as "OpenRouter".
  readonly name: string;
  // The base URL of the calls that the service's key authenticates. The chat
  // offers the login where the deployment's base URL is this one.
  readonly baseUrl: string;
  // The service's page for the login, to which the login sends its window.
  readonly authUrl: string;
  // Where the login exchanges a code for the key.
  readonly keysUrl: string;
}

export const OPENROUTER: LoginService = {
  name: "OpenRouter",
  baseUrl: "https://openrouter.ai/api/v1",
  authUrl: "https://openrouter.ai/auth",
  keysUrl: "https://openrouter.ai/api/v1/auth/keys",
};

// What the login is doing, which the chat shows beside the field for the key.
export type LoginState =
  // No login has failed, or the last one gave the key.
  | { readonly kind: "idle" }
  // The service sent a code, which the login exchanges for the key.
  | { readonly kind: "exchanging" }
  // The browser blocked the window of the login.
  | { readonly kind: "blocked" }
  // The exchange of a code failed, for the reason given, a sentence.
  | { readonly kind: "failed"; readonly reason: string };

export interface Login {
  readonly service: LoginService;
  // Whether the chat offers the login where the deployment's base URL is the
  // one given: where it is the service's, on a page that the browser deems
  // secure.
  offers(baseUrl: string): boolean;
  // What the login is doing. It gives the same object until that changes, as
  // React's useSyncExternalStore() asks of a snapshot.
  current(): LoginState;
  // Calls the listener whenever what current() gives changes, until the
  // function that it returns is called.
  subscribe(listener: () => void): () => void;
  // Opens the service's login in a window of its own. The chat calls it as
  // the visitor clicks, since the browser opens the window only then.
  start(): void;
}

// Opens a window, as window.open() does.
export type OpenWindow = (url: string, target: string, features: string) => WindowProxy | null;

export interface LoginOptions {
  // The visitor's key, which the login gives the key that the service makes.
  readonly key: VisitorKey;
  // The service, OpenRouter unless given.
  readonly service?: LoginService;
  // The URL of the page that the login calls back, login.html beside the
  // module unless given.
  readonly callbackUrl?: string;
  // How the login exchanges a code for the key, through the page's fetch
  // unless given.
  readonly fetch?: Fetch;
  // How the login opens its window, through the page's window.open() unless
  // given.
  readonly open?: OpenWindow;
  // Whether the page is one that the browser deems secure, as
  // isSecureContext says unless given.
  readonly secure?: boolean;
}

// The label and the expiry of the key that a login makes, which the service's
// page for the login fills in, and which the visitor can change there.
const LABEL = "blockr";
const EXPIRATION = "1-day";

const IDLE: LoginState = { kind: "idle" };
const EXCHANGING: LoginState = { kind: "exchanging" };
const BLOCKED: LoginState = { kind: "blocked" };

export function createLogin(options: LoginOptions): Login {
  const service = options.service ?? OPENROUTER;
  const callbackUrl = options.callbackUrl ?? new URL("login.html", import.meta.url).href;
  const fetch: Fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const open: OpenWindow = options.open ?? ((url, target, features) => window.open(url, target, features));
  const secure = options.secure ?? globalThis.isSecureContext;
  const listeners = new Set<() => void>();
  // The verifier of each login that the login started and that has given no
  // key yet, by its state.
  const pending = new Map<string, string>();
  let state = IDLE;
  // The channel on which the login hears the codes, open while a login is
  // pending.
  let channel: BroadcastChannel | undefined;

  function set(next: LoginState): void {
    if (next === state) return;
    state = next;
    for (const listener of [...listeners]) listener();
  }

  // Forgets the login of the state given, or every login, and closes the
  // channel once no login is pending.
  function forget(loginState?: string): void {
    if (loginState === undefined) pending.clear();
    else pending.delete(loginState);
    if (pending.size > 0) return;
    channel?.close();
    channel = undefined;
  }

  async function received(callback: Callback): Promise<void> {
    const verifier = pending.get(callback.state);
    if (verifier === undefined) return;
    forget(callback.state);
    set(EXCHANGING);
    const exchanged = await exchange(service, fetch, callback.code, verifier);
    if (exchanged.kind === "failed") {
      set({ kind: "failed", reason: exchanged.reason });
      return;
    }
    forget();
    options.key.give(exchanged.key);
    set(IDLE);
  }

  return {
    service,
    offers(baseUrl) {
      return secure && baseUrl === service.baseUrl;
    },
    current() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      const login = open("", "_blank", windowFeatures());
      if (login === null) {
        set(BLOCKED);
        return;
      }
      login.opener = null;
      const verifier = randomToken(32);
      const loginState = randomToken(16);
      pending.set(loginState, verifier);
      if (channel === undefined) {
        channel = new BroadcastChannel(CHANNEL);
        channel.addEventListener("message", (event: MessageEvent<unknown>) => {
          if (isCallback(event.data)) void received(event.data);
        });
      }
      set(IDLE);
      void challengeOf(verifier).then((challenge) => {
        login.location.replace(authUrlOf(service, callbackUrl, challenge, loginState));
      });
    },
  };
}

// The login of each visitor's key, which the page keeps as it keeps the key,
// so that the assistants of every board that opens in the page share it.
const logins = new WeakMap<VisitorKey, Login>();

// The login with OpenRouter that gives its key to the visitor's key given.
// Each key has one login.
export function loginOf(key: VisitorKey): Login {
  const kept = logins.get(key);
  if (kept !== undefined) return kept;
  const login = createLogin({ key });
  logins.set(key, login);
  return login;
}

// The URL of the service's page for the login, as OpenRouter's takes it.
export function authUrlOf(service: LoginService, callbackUrl: string, challenge: string, state: string): string {
  const url = new URL(service.authUrl);
  url.search = new URLSearchParams({
    callback_url: callbackUrl,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    key_label: LABEL,
    expiration: EXPIRATION,
  }).toString();
  return url.href;
}

// The code challenge of PKCE's method S256: the SHA-256 of the verifier, in
// base64url.
export async function challengeOf(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

// What the exchange of a code gave: the key, or why it failed.
type Exchanged = { readonly kind: "key"; readonly key: string } | { readonly kind: "failed"; readonly reason: string };

// Exchanges the code and the verifier for the key at the service, as
// OpenRouter's /auth/keys takes them.
async function exchange(service: LoginService, fetch: Fetch, code: string, verifier: string): Promise<Exchanged> {
  let response: Response;
  try {
    response = await fetch(service.keysUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
    });
  } catch {
    return { kind: "failed", reason: `The page could not reach ${new URL(service.keysUrl).host}.` };
  }
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    return { kind: "failed", reason: `${service.name} refused the login: ${messageOf(body) ?? `HTTP ${String(response.status)}.`}` };
  }
  const key = typeof body === "object" && body !== null && "key" in body && typeof body.key === "string" ? body.key.trim() : "";
  if (key === "") return { kind: "failed", reason: `${service.name} sent no key.` };
  return { kind: "key", key };
}

// The message of an error that the service sent, as OpenRouter's
// { "error": { "message": "Invalid code" } }, with a full stop at its end.
function messageOf(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("error" in body)) return undefined;
  const { error } = body;
  if (typeof error !== "object" || error === null || !("message" in error) || typeof error.message !== "string") return undefined;
  const message = error.message.trim();
  if (message === "") return undefined;
  return /[.!?]$/.test(message) ? message : `${message}.`;
}

// Where the window of the login opens: in the middle of the app's window.
function windowFeatures(): string {
  const width = 520;
  const height = 720;
  const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - height) / 2);
  return `popup,width=${String(width)},height=${String(height)},left=${String(left)},top=${String(top)}`;
}

// A random token of the bytes given, in base64url, as PKCE's verifier takes.
function randomToken(bytes: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
