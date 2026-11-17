// The message field and its button
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-message-field-and-a-turn):
// - The field reads "Ask about your board". Enter sends, Shift+Enter starts a
//   new line, and Up and Down bring back the user's earlier messages into an
//   empty field (./recall.ts). The field grows with its text, up to a height
//   that the stylesheet sets, and then scrolls.
// - While a turn runs on the board, the user can type in any conversation but
//   sends nothing until the turn ends, and the send button says which
//   conversation's turn it waits for
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#while-a-turn-runs).
// - While the chat lacks the visitor's key, the user can type but sends
//   nothing until the visitor gives a key, and the send button says so
//   (./key.tsx).
// - The stop button shows in place of the send button in the turn's
//   conversation. It stops the turn, as Escape in the chat does, and says
//   that the turn is stopping until the turn ends, as where an edit waits in a
//   command's prepare()
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#stopping-a-turn).
// The field is assistant-ui's, drawn on a textarea of the chat's own, since
// assistant-ui's own grows by measuring a copy of it that it puts in the
// page's body, outside the chat's element.

import { useLayoutEffect, useRef } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { useChat, useChatActions } from "./context.ts";
import { libraries } from "./libraries.ts";
import { recall } from "./recall.ts";
import type { Recalled } from "./recall.ts";

export const PLACEHOLDER = "Ask about your board";

export function Composer(): ReactElement {
  const { ComposerPrimitive, useAui, useAuiState } = libraries();
  const { stop } = useChatActions();
  const { history, noKey, running, runsHere, titleOf } = useChat();
  const aui = useAui();
  const text = useAuiState(({ composer }) => composer.text);
  const field = useRef<HTMLTextAreaElement>(null);
  const recalled = useRef<Recalled>(undefined);

  // The field grows with its text.
  useLayoutEffect(() => {
    const el = field.current;
    if (el === null) return;
    el.style.height = "auto";
    el.style.height = `${String(el.scrollHeight)}px`;
  }, [text]);

  const keys = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (event.nativeEvent.isComposing || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return;
    const el = event.currentTarget;
    const key = event.key === "ArrowUp" ? "up" : "down";
    // Up and Down bring back a message only from the end of the field, so
    // that they move the caret through a message that runs over lines.
    if (el.value !== "" && el.selectionStart !== el.value.length) return;
    const back = recall(history, recalled.current, el.value, key);
    if (back === undefined) return;
    event.preventDefault();
    recalled.current = back.at;
    aui.composer.setText(back.text);
  };

  const waitsFor = running === undefined || runsHere ? undefined : (titleOf(running.conversation) ?? "another conversation");
  const sendLabel = noKey ? "Sends once you enter your key" : waitsFor === undefined ? "Send" : `Sends once the turn in “${waitsFor}” ends`;

  return (
    <ComposerPrimitive.Root className="blockr-assistant-composer">
      {waitsFor === undefined ? null : <p className="blockr-assistant-composer-note">A turn runs in “{waitsFor}”.</p>}
      <div className="blockr-assistant-field">
        <ComposerPrimitive.Input asChild placeholder={PLACEHOLDER} aria-label="Message" onKeyDown={keys} submitMode="enter">
          <textarea ref={field} rows={1} />
        </ComposerPrimitive.Input>
        {runsHere && running !== undefined ? (
          <button
            type="button"
            className="blockr-assistant-stop"
            data-stopping={running.stopping ? "" : undefined}
            disabled={running.stopping}
            title={running.stopping ? "Stopping" : "Stop"}
            aria-label={running.stopping ? "Stopping" : "Stop"}
            onClick={stop}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <rect x="4" y="4" width="8" height="8" rx="1.5" />
            </svg>
          </button>
        ) : (
          <ComposerPrimitive.Send className="blockr-assistant-send" title={sendLabel} aria-label={sendLabel}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
            </svg>
          </ComposerPrimitive.Send>
        )}
      </div>
    </ComposerPrimitive.Root>
  );
}
