// The visitor's own key, which the chat asks for where the deployment leaves
// the blockr option assistant_api_key unset
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-credential).
// The plugin keeps the key in its module's scope while the page lives, rather
// than in what start keeps, since core starts the plugin again as each board
// opens, on a CoreApi of the board's own. So the key stays when another board
// opens in the same page, since it is the visitor's rather than the board's,
// and a reload asks for it again. Nothing writes the key to the board, to R or
// to browser storage, which every page of the same origin can read
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.1#what-must-hold).
//
// Three parts read the key:
// - The chat shows the field for the key above the message field while it
//   asks for a key, and sends nothing while it holds none (../chat).
// - The turns hand pi the key for each call (../turns).
// - The models ask the base URL for its list of models with the key, and ask
//   again once a new key comes, where the deployment names no models
//   (../models).
// The turns and the models tell the key what the base URL said of it, which
// decides whether the chat asks again.

// What the key is.
export type KeyState =
  // The visitor has given no key yet.
  | { readonly kind: "missing" }
  // The base URL refused the key that the visitor gave, with a 401 or a 403,
  // so the plugin dropped it.
  | { readonly kind: "refused" }
  // The key that the visitor gave, which the calls carry.
  | { readonly kind: "given"; readonly key: string }
  // A call with the key got no answer that the page could read, and neither
  // did the base URL's list of models, so the key may be wrong. The calls
  // still carry it, while the chat asks again, holding it.
  | { readonly kind: "lost"; readonly key: string };

export interface VisitorKey {
  // What the key is. It gives the same object until the key changes, as
  // React's useSyncExternalStore() asks of a snapshot.
  current(): KeyState;
  // Calls the listener whenever what current() gives changes, until the
  // function that it returns is called.
  subscribe(listener: () => void): () => void;
  // The visitor gives a key, which the calls carry from then on.
  give(key: string): void;
  // The base URL refused the key given, which the plugin drops. A key that
  // the visitor has replaced since stays as it is.
  refused(key: string): void;
  // A call with the key given got no answer that the page could read, and
  // neither did the base URL's list of models.
  lost(key: string): void;
  // The base URL took the key given, for a call or for its list of models, so
  // the chat stops asking for it.
  took(key: string): void;
}

const MISSING: KeyState = { kind: "missing" };

// The key that the calls carry, or undefined where the visitor has given none
// or the base URL refused it.
export function keyOf(state: KeyState): string | undefined {
  return state.kind === "given" || state.kind === "lost" ? state.key : undefined;
}

export function createVisitorKey(): VisitorKey {
  let state = MISSING;
  const listeners = new Set<() => void>();

  function set(next: KeyState): void {
    state = next;
    for (const listener of [...listeners]) listener();
  }

  return {
    current() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    give(key) {
      if (state.kind !== "given" || state.key !== key) set({ kind: "given", key });
    },
    refused(key) {
      if (keyOf(state) === key) set({ kind: "refused" });
    },
    lost(key) {
      if (keyOf(state) === key && state.kind !== "lost") set({ kind: "lost", key });
    },
    took(key) {
      if (state.kind === "lost" && state.key === key) set({ kind: "given", key });
    },
  };
}

// The key of the page, which the assistants of every board that opens in the
// page share.
let page = createVisitorKey();

export function pageKey(): VisitorKey {
  return page;
}

// Forgets the key of the page, as a reload does. The tests call it, since they
// open many boards on one page.
export function reloadPageKey(): void {
  page = createVisitorKey();
}
