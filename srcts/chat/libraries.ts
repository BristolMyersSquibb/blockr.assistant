// The libraries that the chat draws with (./vendor.ts), which the page imports
// as the chat first mounts.
// Core imports the module of the assistant's class before it opens a board,
// so a static import of the libraries would hold up every board's opening
// until the page had fetched them. A page whose frontend never shows the chat
// never fetches them at all.
// Where the import fails, the next mount of the chat tries again.

import type * as Vendor from "./vendor.ts";

export type Libraries = typeof Vendor;

let loading: Promise<Libraries> | undefined;
let loaded: Libraries | undefined;

// Imports the libraries, once for the page, and resolves with them.
export function loadLibraries(): Promise<Libraries> {
  loading ??= import("./vendor.ts").then(
    (libraries) => {
      loaded = libraries;
      return libraries;
    },
    (error: unknown) => {
      loading = undefined;
      throw error;
    },
  );
  return loading;
}

// Whether the libraries have loaded.
export function librariesLoaded(): boolean {
  return loaded !== undefined;
}

// The libraries, which the chat's components take as they draw. The chat
// draws only once loadLibraries() has resolved.
export function libraries(): Libraries {
  if (loaded === undefined) throw new Error("The chat draws only once its libraries have loaded.");
  return loaded;
}
