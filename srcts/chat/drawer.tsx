// The drawer of conversations, which the button in the chat's footer opens in
// the browser's top layer, as a modal dialog
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#conversations).
// It carries today's drawer over (shinychat's ChatHistoryDrawer.tsx at
// 6cb1417):
// - It lists the board's conversations, the last updated first, in today's
//   groups, by when each was last updated: Today, Last 7 days and Previous.
//   Each row gives the conversation's title and when it was last updated: the
//   time of day for today, and the date before.
// - Its field searches the titles. A click on a row opens its conversation.
//   Neither runs a command, since neither changes the board.
// - New opens the greeting, so that the first message adds the conversation
//   (./chat.tsx).
// - Each row renames its conversation in place: Enter keeps the title, and
//   Escape or leaving the field keeps the old one. Each row deletes its
//   conversation once the user confirms in the row. The chat changes the
//   conversation through the plugin's conversations, so that where
//   chat_save_turns is 0 it changes the plugin's memory alone.
// - It marks the conversation whose turn runs, which the user can leave and
//   come back to.
// - All of it stays open while a turn runs
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#while-a-turn-runs).
// The dialog closes on Escape, on its close button, and on a click outside
// it, through closedby="any", or through the drawer's own check of where the
// pointer went down and up, where the browser lacks closedby.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, ReactElement } from "react";
import type { Conversation, ConversationId } from "../state/index.ts";
import { normalizeTitle } from "../titles/index.ts";

export interface DrawerProps {
  // Whether the drawer shows.
  readonly shown: boolean;
  readonly onClose: () => void;
  readonly conversations: Readonly<Record<ConversationId, Conversation>>;
  // The conversation that the chat shows, and the one whose turn runs.
  readonly open: ConversationId | undefined;
  readonly running: ConversationId | undefined;
  readonly onSelect: (conversation: ConversationId) => void;
  readonly onNew: () => void;
  readonly onRename: (conversation: ConversationId, title: string) => void;
  // Deletes the conversation, and resolves once it is gone.
  readonly onDelete: (conversation: ConversationId) => Promise<void>;
}

const DAY = 24 * 60 * 60 * 1000;

export function Drawer(props: DrawerProps): ReactElement {
  const { shown, onClose, conversations, open, running } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const heading = useId();
  const [query, setQuery] = useState("");
  const dismiss = useLightDismiss();

  // The dialog focuses the search as it opens. React focuses an element with
  // autoFocus as it mounts, while the dialog is closed, so the drawer focuses
  // the field itself.
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (shown && !dialog.open) {
      dialog.showModal();
      search.current?.focus();
    }
    if (!shown && dialog.open) dialog.close();
  }, [shown]);

  const groups = useMemo(() => groupConversations(conversations, query), [conversations, query]);
  const empty = Object.keys(conversations).length === 0;

  return (
    <dialog
      ref={ref}
      className="blockr-assistant-dialog blockr-assistant-drawer"
      aria-labelledby={heading}
      closedby="any"
      onClose={() => {
        setQuery("");
        onClose();
      }}
      {...dismiss}
    >
      <div className="blockr-assistant-drawer-top">
        <h2 id={heading}>Conversations</h2>
        <button type="button" className="blockr-assistant-drawer-close" title="Close" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <div className="blockr-assistant-drawer-tools">
        <button type="button" className="blockr-assistant-drawer-new" onClick={props.onNew}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 3.5v9M3.5 8h9" />
          </svg>
          New
        </button>
        <input
          ref={search}
          type="search"
          className="blockr-assistant-drawer-search"
          placeholder="Search…"
          aria-label="Search conversations"
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
          }}
        />
      </div>
      <div className="blockr-assistant-drawer-list">
        {groups.length === 0 ? <p className="blockr-assistant-drawer-empty">{empty ? "No conversations yet" : "No conversations found"}</p> : null}
        {groups.map(({ label, items }) => (
          <div key={label} className="blockr-assistant-drawer-group">
            <h3>{label}</h3>
            <ul>
              {items.map(([id, conversation]) => (
                <Row
                  key={id}
                  id={id}
                  conversation={conversation}
                  open={id === open}
                  running={id === running}
                  onSelect={props.onSelect}
                  onRename={props.onRename}
                  onDelete={props.onDelete}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </dialog>
  );
}

interface RowProps {
  readonly id: ConversationId;
  readonly conversation: Conversation;
  readonly open: boolean;
  readonly running: boolean;
  readonly onSelect: (conversation: ConversationId) => void;
  readonly onRename: (conversation: ConversationId, title: string) => void;
  readonly onDelete: (conversation: ConversationId) => Promise<void>;
}

// A conversation's row: its title, which opens it, and its buttons, or the
// field that renames it, or the question whether to delete it.
function Row({ id, conversation, open, running, onSelect, onRename, onDelete }: RowProps): ReactElement {
  const [mode, setMode] = useState<"shown" | "renaming" | "confirming" | "deleting">("shown");
  const keep = useRef<HTMLButtonElement>(null);

  // The question whether to delete focuses its safe answer, which keeps the
  // conversation.
  useEffect(() => {
    if (mode === "confirming") keep.current?.focus();
  }, [mode]);

  if (mode === "renaming") {
    return (
      <li className="blockr-assistant-drawer-row" data-open={open ? "" : undefined}>
        <Rename
          title={conversation.title}
          onDone={(title) => {
            if (title !== undefined && title !== conversation.title) onRename(id, title);
            setMode("shown");
          }}
        />
      </li>
    );
  }

  return (
    <li className="blockr-assistant-drawer-row" data-open={open ? "" : undefined}>
      <button
        type="button"
        className="blockr-assistant-drawer-select"
        aria-current={open ? "true" : undefined}
        disabled={mode === "deleting"}
        onClick={() => {
          onSelect(id);
        }}
      >
        <span className="blockr-assistant-drawer-title">{conversation.title}</span>
        {running ? <span className="blockr-assistant-drawer-running" role="img" aria-label="A turn runs" title="A turn runs in this conversation" /> : null}
        <span className="blockr-assistant-drawer-time">{formatUpdated(conversation.updated)}</span>
      </button>
      {mode === "shown" ? (
        <span className="blockr-assistant-drawer-actions">
          <button
            type="button"
            title="Rename"
            aria-label={`Rename “${conversation.title}”`}
            onClick={() => {
              setMode("renaming");
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M10.5 3.5l2 2L6 12H4v-2z" />
            </svg>
          </button>
          <button
            type="button"
            title="Delete"
            aria-label={`Delete “${conversation.title}”`}
            onClick={() => {
              setMode("confirming");
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8" />
            </svg>
          </button>
        </span>
      ) : mode === "confirming" ? (
        <span className="blockr-assistant-drawer-confirm">
          Delete?
          <button
            type="button"
            className="blockr-assistant-drawer-confirm-yes"
            title="Delete"
            aria-label={`Delete “${conversation.title}”`}
            onClick={() => {
              setMode("deleting");
              onDelete(id).catch(() => {
                setMode("shown");
              });
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.5 8.5l3 3 6-7" />
            </svg>
          </button>
          <button
            ref={keep}
            type="button"
            className="blockr-assistant-drawer-confirm-no"
            title="Keep"
            aria-label={`Keep “${conversation.title}”`}
            onClick={() => {
              setMode("shown");
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </span>
      ) : (
        <span className="blockr-assistant-drawer-confirm">Deleting…</span>
      )}
    </li>
  );
}

// The field that renames a conversation, which gives onDone() the new title
// on Enter, and nothing on Escape or once it loses the focus.
function Rename({ title, onDone }: { readonly title: string; readonly onDone: (title: string | undefined) => void }): ReactElement {
  const [draft, setDraft] = useState(title);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    field.current?.select();
  }, []);

  const keys = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      const renamed = normalizeTitle(draft);
      if (renamed !== undefined) onDone(renamed);
    } else if (event.key === "Escape") {
      // Escape leaves the field, and the drawer stays open.
      event.preventDefault();
      onDone(undefined);
    }
  };

  return (
    <input
      ref={field}
      className="blockr-assistant-drawer-rename"
      aria-label="Title of the conversation"
      value={draft}
      onChange={(event) => {
        setDraft(event.currentTarget.value);
      }}
      onKeyDown={keys}
      onBlur={() => {
        onDone(undefined);
      }}
    />
  );
}

interface Group {
  readonly label: string;
  readonly items: readonly (readonly [ConversationId, Conversation])[];
}

// The conversations whose titles hold the query, the last updated first, in
// today's groups.
export function groupConversations(conversations: Readonly<Record<ConversationId, Conversation>>, query: string, now = new Date()): Group[] {
  const sought = query.trim().toLowerCase();
  const sorted = Object.entries(conversations)
    .filter(([, conversation]) => sought === "" || conversation.title.toLowerCase().includes(sought))
    .sort(([, a], [, b]) => Date.parse(b.updated) - Date.parse(a.updated));
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const week = today.getTime() - 7 * DAY;
  const labels = ["Today", "Last 7 days", "Previous"] as const;
  const findLabel = (updated: string): (typeof labels)[number] => {
    const time = Date.parse(updated);
    return time >= today.getTime() ? "Today" : time >= week ? "Last 7 days" : "Previous";
  };
  return labels.flatMap((label) => {
    const items = sorted.filter(([, conversation]) => findLabel(conversation.updated) === label);
    return items.length === 0 ? [] : [{ label, items }];
  });
}

// When a conversation was last updated: the time of day for today, and the
// date before, as today's drawer gives it.
function formatUpdated(updated: string, now = new Date()): string {
  const then = new Date(updated);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return then >= today ? then.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Whether the browser closes a dialog on a click outside it, as closedby="any"
// asks.
const CLOSED_BY = typeof HTMLDialogElement !== "undefined" && "closedBy" in HTMLDialogElement.prototype;

// Where the browser lacks closedby, the handlers that close the drawer on a
// click outside it: the pointer went down and up outside the dialog's box, so
// that a selection that ends outside closes nothing. The dialog is the target
// of a click on its backdrop too, so the handlers test where the pointer is,
// rather than the target.
function useLightDismiss(): {
  readonly onPointerDown?: (event: PointerEvent<HTMLDialogElement>) => void;
  readonly onPointerUp?: (event: PointerEvent<HTMLDialogElement>) => void;
} {
  const downOutside = useRef(false);
  if (CLOSED_BY) return {};
  return {
    onPointerDown: (event) => {
      downOutside.current = outside(event);
    },
    onPointerUp: (event) => {
      if (downOutside.current && outside(event)) event.currentTarget.close();
      downOutside.current = false;
    },
  };
}

// Whether the pointer is outside the dialog's box.
function outside(event: PointerEvent<HTMLDialogElement>): boolean {
  const box = event.currentTarget.getBoundingClientRect();
  return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
}
