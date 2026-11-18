// The channel on which the page that OpenRouter's login calls back hands the
// code to the page that started the login (./login.ts, ./callback.ts). A
// BroadcastChannel reaches every page of the app's origin, and no page of
// another origin.

export const CHANNEL = "blockr.assistant-openrouter";

// What the page that the login calls back posts on the channel: the code and
// the state that OpenRouter put in its query.
export interface Callback {
  readonly code: string;
  readonly state: string;
}

// Whether a message on the channel is a callback.
export function isCallback(data: unknown): data is Callback {
  if (typeof data !== "object" || data === null) return false;
  const { code, state } = data as Readonly<Record<string, unknown>>;
  return typeof code === "string" && code !== "" && typeof state === "string" && state !== "";
}
