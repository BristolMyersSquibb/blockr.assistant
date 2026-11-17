// Which conversation is open, which the browser's local storage keeps, as
// today's chat keeps it (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#conversations).
// The page keeps one id under one key. A board opens on that conversation
// where it holds it, and on no conversation otherwise, which shows the
// greeting. The id of a conversation is random, so no two boards share one.
// Once the chat shows the greeting, as after the drawer's New, local storage
// keeps no id, so that a reload opens the greeting too.
// A page without local storage, as where the browser refuses it, opens every
// board on no conversation.

const KEY = "blockr.assistant-open_conversation";

// The id that local storage keeps, or undefined.
export function storedConversation(): string | undefined {
  try {
    return globalThis.localStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

// Keeps the id of the conversation that opens, or none where the chat opens
// no conversation.
export function storeConversation(id: string | undefined): void {
  try {
    if (id === undefined) globalThis.localStorage.removeItem(KEY);
    else globalThis.localStorage.setItem(KEY, id);
  } catch {
    // The page has no local storage, so the next board opens on none.
  }
}
