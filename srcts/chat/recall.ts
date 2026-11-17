// Up and Down in the message field, which bring back the user's earlier
// messages, as in today's chat
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-message-field-and-a-turn):
// 1. In an empty field, Up brings back the user's last message of the open
//    conversation.
// 2. While the field holds a message that it brought back, unchanged, Up
//    brings back the one before it, and Down the one after it.
// 3. Down from the last message empties the field again.
// Once the user changes the text that the field brought back, Up and Down
// move the caret again, as in any text.

// Where the field stands in the user's earlier messages: the index of the one
// that it shows, or undefined where it shows none of them.
export type Recalled = number | undefined;

// What Up or Down brings back, given the user's earlier messages, oldest
// first, where the field stands and the text that the field holds, or
// undefined where the key moves the caret instead.
export function recall(
  history: readonly string[],
  at: Recalled,
  text: string,
  key: "up" | "down",
): { readonly at: Recalled; readonly text: string } | undefined {
  const showing = at !== undefined && history[at] === text;
  if (!showing && text !== "") return undefined;
  if (key === "up") {
    if (history.length === 0) return undefined;
    const next = showing ? Math.max(0, at - 1) : history.length - 1;
    return { at: next, text: history[next] ?? "" };
  }
  if (!showing) return undefined;
  if (at >= history.length - 1) return { at: undefined, text: "" };
  return { at: at + 1, text: history[at + 1] ?? "" };
}
