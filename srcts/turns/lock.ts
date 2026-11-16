// The Web Lock that the tab holds while a turn runs
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4#proposal).
// Chrome freezes a background tab unless it holds a Web Lock, and a frozen tab
// stops its tasks and fails its WebSockets
// (https://github.com/workadventure/workadventure/pull/6740).
// The lock is named for the tab, since a tab that waits for another tab's lock
// is not protected, so each page draws a name of its own as the module loads.
// A page outside a secure context, as one served over plain HTTP to a host
// other than localhost, has no Web Locks, so its turns run without one.

import { newId } from "../state/index.ts";

// The lock's name, which no other tab draws.
const NAME = `blockr.assistant-turn-${newId()}`;

// What of the browser's LockManager the lock takes.
export type Locks = Pick<LockManager, "request">;

// The LockManager of the page, or undefined outside a secure context, where
// the browser leaves navigator.locks out, though the DOM's types declare it.
// A page that gives null in its place, as happy-dom does, has none either.
export function pageLocks(): Locks | undefined {
  return (globalThis.navigator as { locks?: Locks | null } | undefined)?.locks ?? undefined;
}

// Takes the tab's lock, and resolves with the function that releases it, once
// the browser grants the lock. Where the page has no Web Locks, or the browser
// refuses the lock, it resolves with a function that does nothing.
export function holdLock(locks: Locks | undefined): Promise<() => void> {
  if (locks === undefined) return Promise.resolve(nothing);
  return new Promise((resolve) => {
    let release = nothing;
    const held = new Promise<void>((done) => {
      release = done;
    });
    locks
      .request(NAME, () => {
        resolve(release);
        return held;
      })
      .catch(() => {
        resolve(nothing);
      });
  });
}

function nothing(): void {
  // Nothing to release.
}
