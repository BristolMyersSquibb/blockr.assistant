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
// - The button beside the text opens the system's file picker, and the field
//   shows the files that it stages above the text (./files.tsx). A paste of
//   files, or of a text longer than 1,000 characters, adds files too
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#attachments).
//   Under the field, the chat says which files it left out, and why.
// The field is assistant-ui's, drawn on a textarea of the chat's own, since
// assistant-ui's own grows by measuring a copy of it that it puts in the
// page's body, outside the chat's element. For the same reason, the file
// input that the button opens sits in the field, where assistant-ui's own
// button puts one in the page's body.

import { useLayoutEffect, useRef } from "react";
import type { ClipboardEvent, KeyboardEvent, ReactElement } from "react";
import { ACCEPT, PASTE_AS_FILE, pastedFile } from "../attachments/index.ts";
import { useChat, useChatActions } from "./context.ts";
import { StagedFiles } from "./files.tsx";
import { libraries } from "./libraries.ts";
import { recall } from "./recall.ts";
import type { Recalled } from "./recall.ts";

export const PLACEHOLDER = "Ask about your board";

export function Composer(): ReactElement {
  const { ComposerPrimitive, useAui, useAuiState } = libraries();
  const { addFiles, stop } = useChatActions();
  const { filesNote, history, noKey, running, runsHere, titleOf } = useChat();
  const aui = useAui();
  const text = useAuiState(({ composer }) => composer.text);
  const field = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
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

  // A paste of files adds them, and so does a paste of a long text, which
  // becomes a file. Any other paste goes into the text.
  const paste = (event: ClipboardEvent<HTMLTextAreaElement>): void => {
    const files = [...event.clipboardData.files];
    if (files.length > 0) {
      event.preventDefault();
      addFiles(files);
      return;
    }
    const pasted = event.clipboardData.getData("text/plain");
    if (pasted.length <= PASTE_AS_FILE) return;
    event.preventDefault();
    addFiles([pastedFile(pasted)]);
  };

  const waitsFor = running === undefined || runsHere ? undefined : (titleOf(running.conversation) ?? "another conversation");
  const sendLabel = noKey ? "Sends once you enter your key" : waitsFor === undefined ? "Send" : `Sends once the turn in “${waitsFor}” ends`;

  return (
    <ComposerPrimitive.Root className="blockr-assistant-composer">
      {waitsFor === undefined ? null : <p className="blockr-assistant-composer-note">A turn runs in “{waitsFor}”.</p>}
      <div className="blockr-assistant-field">
        <StagedFiles />
        <div className="blockr-assistant-field-row">
          <input
            ref={picker}
            type="file"
            className="blockr-assistant-picker"
            multiple
            accept={ACCEPT}
            hidden
            tabIndex={-1}
            onChange={(event) => {
              const files = [...(event.currentTarget.files ?? [])];
              event.currentTarget.value = "";
              if (files.length > 0) addFiles(files);
            }}
          />
          <button
            type="button"
            className="blockr-assistant-attach"
            title="Attach files"
            aria-label="Attach files"
            onClick={() => {
              picker.current?.click();
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M13.5 7.5 8.2 12.8a3.25 3.25 0 0 1-4.6-4.6l5.7-5.7a2.1 2.1 0 0 1 3 3l-5.6 5.6a1 1 0 0 1-1.4-1.4l5.1-5.1" />
            </svg>
          </button>
          <ComposerPrimitive.Input asChild placeholder={PLACEHOLDER} aria-label="Message" onKeyDown={keys} onPaste={paste} addAttachmentOnPaste={false} submitMode="enter">
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
      </div>
      {filesNote === undefined ? null : (
        <p className="blockr-assistant-files-note" role="status">
          {filesNote}
        </p>
      )}
    </ComposerPrimitive.Root>
  );
}
