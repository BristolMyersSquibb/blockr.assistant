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
//   It is a Button of core's React SDK. While the turn stops, the button is
//   pending, so that it keeps the focus and takes no press.
// - The button beside the text opens the system's file picker, and the field
//   shows the files that it stages above the text (./files.tsx). A paste of
//   files, or of a text longer than 1,000 characters, adds files too
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#attachments).
//   Under the field, the chat says which files it left out, and why.
// - The field takes the slash commands (./slash.ts), as today's chat takes
//   them (SlashCommandPalette.tsx, TiptapInput.tsx#L150-L195 of shinychat at
//   6cb1417):
//   1. Typing / at the start of the field opens a list above it, of the
//      commands whose names start with what follows the /, or a line that
//      says that none does. The list stays open until the text holds a space
//      or a line break.
//   2. Up and Down move in the list, which takes them from the field, and the
//      list scrolls to the highlighted command. Tab or a click puts the
//      highlighted command in the field, followed by a space, and Escape
//      closes the list until the text changes.
//   3. Enter puts the highlighted command in the field, as today's list does,
//      but runs it where the field holds its name already, so that /undo
//      takes one Enter rather than two.
//   4. Enter and the send button run the command that the line names, unless
//      it waits for the turn that runs or for the visitor's key, as a message
//      does. The field then drops the line, but for a skill whose message
//      did not enter the conversation.
//   5. The files that the field stages stay there, as today's commands leave
//      them, for a message that the user sends next.
//   Under the field, the chat says why /undo or /redo did nothing, where it
//   did nothing, until the user runs another command or sends a message.
//   While the field shows a message that Up brought back, the list stays
//   closed, so that Up and Down keep bringing back the user's messages.
// The field is assistant-ui's, drawn on a textarea of the chat's own, since
// assistant-ui's own grows by measuring a copy of it that it puts in the
// page's body, outside the chat's element. For the same reason, the file
// input that the button opens sits in the field, where assistant-ui's own
// button puts one in the page's body.
// The send button is assistant-ui's, which sends what the field holds. For a
// slash command, a Button of the SDK takes its place and runs the command.

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent, ReactElement } from "react";
import { Button } from "@blockr/core/react";
import { ACCEPT, PASTE_AS_FILE, pastedFile } from "../attachments/index.ts";
import { useChat, useChatActions } from "./context.ts";
import { StagedFiles } from "./files.tsx";
import { libraries } from "./libraries.ts";
import { recall } from "./recall.ts";
import type { Recalled } from "./recall.ts";
import { listedFor, slashCommandOf, slashCommands, waits } from "./slash.ts";
import type { Listed, SlashCommand } from "./slash.ts";

export const PLACEHOLDER = "Ask about your board";

// The command that the list highlights, by its index, for the text given.
interface Highlighted {
  readonly text: string;
  readonly index: number;
}

// The list's first command, which the list highlights until the user moves.
const FIRST: Highlighted = { text: "", index: 0 };

export function Composer(): ReactElement {
  const { ComposerPrimitive, useAui, useAuiState } = libraries();
  const { addFiles, runCommand, stop } = useChatActions();
  const { commandNote, filesNote, history, noKey, running, runsHere, skills, titleOf } = useChat();
  const aui = useAui();
  const text = useAuiState(({ composer }) => composer.text);
  const field = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [recalled, setRecalled] = useState<Recalled>(undefined);
  const listId = useId();
  // The command that the user highlighted in the list, by its index, with the
  // text that the field held then, so that a change of the text highlights
  // the first command again.
  const [highlighted, setHighlighted] = useState<Highlighted>(FIRST);
  // The text for which the user closed the list with Escape.
  const [closedFor, setClosedFor] = useState<string | undefined>(undefined);
  // Whether a command runs, as while R reads a skill, so that Enter does not
  // run it again meanwhile.
  const commandRuns = useRef(false);

  const commands = useMemo(() => slashCommands(skills), [skills]);
  const command = slashCommandOf(text, skills);
  const showsRecalled = recalled !== undefined && history[recalled] === text;
  const listed = closedFor === text || showsRecalled ? undefined : listedFor(text, commands);
  const index = highlighted.text === text && listed !== undefined && highlighted.index < listed.length ? highlighted.index : 0;
  const picked = listed?.[index];
  const optionId = (name: string): string => `${listId}-${name}`;

  // The field grows with its text.
  useLayoutEffect(() => {
    const el = field.current;
    if (el === null) return;
    el.style.height = "auto";
    el.style.height = `${String(el.scrollHeight)}px`;
  }, [text]);

  // The list scrolls to the highlighted command as Up and Down move past the
  // rows that show, as today's list does, while nothing around it scrolls.
  useLayoutEffect(() => {
    const shown = list.current;
    const option = shown?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (shown == null || option == null) return;
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < shown.scrollTop) shown.scrollTop = top;
    else if (bottom > shown.scrollTop + shown.clientHeight) shown.scrollTop = bottom - shown.clientHeight;
  }, [picked]);

  // Puts the command in the field, followed by a space, which closes the list.
  const complete = (chosen: Listed): void => {
    aui.composer.setText(`/${chosen.name} `);
    field.current?.focus();
  };

  // Runs the command that the line names, unless it waits, and drops the line
  // once the command ran, where the field still holds it.
  const run = (named: SlashCommand, line: string): void => {
    if (commandRuns.current || waits(named, { running: running !== undefined, noKey })) return;
    commandRuns.current = true;
    runCommand(named, line)
      .then((ran) => {
        if (ran && aui.composer.getState().text === line) aui.composer.setText("");
      })
      .catch(() => undefined)
      .finally(() => {
        commandRuns.current = false;
      });
  };

  // The keys that the list takes from the field while it shows, which it
  // says whether it took.
  const listKeys = (event: KeyboardEvent<HTMLTextAreaElement>, shown: readonly Listed[]): boolean => {
    const value = event.currentTarget.value;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return false;
        event.preventDefault();
        if (shown.length > 0) {
          const step = event.key === "ArrowDown" ? 1 : shown.length - 1;
          setHighlighted({ text: value, index: (index + step) % shown.length });
        }
        return true;
      }
      case "Tab":
      case "Enter": {
        const chosen = shown[index];
        if (event.shiftKey || chosen === undefined) return false;
        if (event.key === "Enter" && value === `/${chosen.name}`) return false;
        event.preventDefault();
        complete(chosen);
        return true;
      }
      case "Escape":
        event.preventDefault();
        setClosedFor(value);
        return true;
      default:
        return false;
    }
  };

  const keys = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.nativeEvent.isComposing) return;
    if (listed !== undefined && listKeys(event, listed)) return;
    const el = event.currentTarget;
    if (event.key === "Enter" && !event.shiftKey) {
      const named = slashCommandOf(el.value, skills);
      if (named === undefined) return;
      event.preventDefault();
      run(named, el.value);
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return;
    const key = event.key === "ArrowUp" ? "up" : "down";
    // Up and Down bring back a message only from the end of the field, so
    // that they move the caret through a message that runs over lines.
    if (el.value !== "" && el.selectionStart !== el.value.length) return;
    const back = recall(history, recalled, el.value, key);
    if (back === undefined) return;
    event.preventDefault();
    setRecalled(back.at);
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
  const turnLabel = waitsFor === undefined ? "Send" : `Sends once the turn in “${waitsFor}” ends`;
  const sendLabel = noKey ? "Sends once you enter your key" : turnLabel;
  const commandWaits = command !== undefined && waits(command, { running: running !== undefined, noKey });
  const commandLabel = !commandWaits ? "Send" : running === undefined ? "Sends once you enter your key" : turnLabel;

  return (
    <ComposerPrimitive.Root className="blockr-assistant-composer">
      {waitsFor === undefined ? null : <p className="blockr-assistant-composer-note">A turn runs in “{waitsFor}”.</p>}
      {listed === undefined ? null : (
        <ul
          ref={list}
          id={listId}
          className="blockr-assistant-commands"
          role="listbox"
          aria-label="Slash commands"
          onMouseDown={(event) => {
            // The field keeps the focus, as a click picks a command.
            event.preventDefault();
          }}
        >
          {listed.length === 0 ? (
            <li className="blockr-assistant-commands-none" role="presentation">
              No matching commands
            </li>
          ) : (
            listed.map((each, i) => (
              <li
                key={each.name}
                id={optionId(each.name)}
                className="blockr-assistant-command"
                role="option"
                aria-selected={i === index}
                onClick={() => {
                  complete(each);
                }}
                onMouseEnter={() => {
                  setHighlighted({ text, index: i });
                }}
              >
                <span className="blockr-assistant-command-name">/{each.name}</span>
                <span className="blockr-assistant-command-description">{each.description}</span>
              </li>
            ))
          )}
        </ul>
      )}
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
          <ComposerPrimitive.Input
            asChild
            placeholder={PLACEHOLDER}
            aria-label="Message"
            aria-haspopup="listbox"
            aria-autocomplete="list"
            aria-controls={listed === undefined ? undefined : listId}
            aria-activedescendant={picked === undefined ? undefined : optionId(picked.name)}
            onChange={() => {
              // A change of the text opens the list that Escape closed, and
              // highlights its first command.
              setClosedFor(undefined);
              setHighlighted(FIRST);
            }}
            onKeyDown={keys}
            onPaste={paste}
            addAttachmentOnPaste={false}
            submitMode="enter"
            cancelOnEscape={false}
          >
            <textarea ref={field} rows={1} />
          </ComposerPrimitive.Input>
          {runsHere && running !== undefined ? (
            <Button
              variant="primary"
              className="blockr-assistant-stop"
              isPending={running.stopping}
              aria-label={running.stopping ? "Stopping" : "Stop"}
              onPress={stop}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <rect x="4" y="4" width="8" height="8" rx="1.5" />
              </svg>
            </Button>
          ) : command !== undefined ? (
            <Button
              variant="primary"
              className="blockr-assistant-send"
              isDisabled={commandWaits}
              aria-label={commandLabel}
              onPress={() => {
                run(command, text);
              }}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
              </svg>
            </Button>
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
      {commandNote === undefined ? null : (
        <p className="blockr-assistant-command-note" role="status">
          {commandNote}
        </p>
      )}
    </ComposerPrimitive.Root>
  );
}
