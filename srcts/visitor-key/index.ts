// The visitor's own key, which the page keeps in its memory while it lives,
// and which the browser keeps in its local storage where the deployment sets
// the blockr option assistant_key_secret.

export { keyEntry } from "./entry.ts";
export type { KeyEntry, KeyEntryOptions } from "./entry.ts";
export { createVisitorKey, keepKey, keyOf, pageKey, reloadPageKey } from "./visitor-key.ts";
export type { KeyState, VisitorKey } from "./visitor-key.ts";
