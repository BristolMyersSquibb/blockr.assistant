// The drawer of conversations, which the button in the chat's footer opens
// over the chat, in the chat's own element, as today's drawer opens over its
// chat (shinychat's _history.scss at 6cb1417). So it shows wherever a
// frontend puts the chat, at the chat's size, and needs nothing of the
// frontend
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
// Its buttons are those of blockr.ui, but for the title of each row, which
// opens the conversation. The field that renames a conversation is blockr.ui's
// too.
// While it shows, the chat makes the rest of the chat inert, so that the focus
// stays in the drawer, while the board around the chat stays as it was. The
// drawer takes the focus to its search as it opens. It closes on Escape, on
// its close button and on a click on the chat beside it, and gives the focus
// back to the footer's button once it closes.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement, RefObject } from "react";
import { Button, TextField } from "@blockr/ui";
import type { Conversation, ConversationId } from "../state/index.ts";
import { normalizeTitle } from "../titles/index.ts";

export interface DrawerProps {
  readonly onClose: () => void;
  // The button that opened the drawer, which takes the focus back once the
  // drawer closes.
  readonly opener: RefObject<HTMLButtonElement | null>;
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
  const { onClose, opener, conversations, open, running } = props;
  const search = useRef<HTMLInputElement>(null);
  const heading = useId();
  const [query, setQuery] = useState("");

  // The chat mounts the drawer as it opens and drops it as it closes, and the
  // focus goes back once the rest of the chat is no longer inert. The footer,
  // and so its button, stays while the drawer shows.
  useEffect(() => {
    const button = opener.current;
    search.current?.focus();
    return () => {
      button?.focus();
    };
  }, [opener]);

  const groups = useMemo(() => groupConversations(conversations, query), [conversations, query]);
  const empty = Object.keys(conversations).length === 0;

  // Escape closes the drawer, but where the rename field took it.
  const keys = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    onClose();
  };

  return (
    <div className="blockr-assistant-drawer" onKeyDown={keys}>
      <div className="blockr-assistant-drawer-scrim" onClick={onClose} />
      <section className="blockr-assistant-drawer-sheet" role="dialog" aria-labelledby={heading}>
        <div className="blockr-assistant-drawer-top">
          <h2 id={heading}>Conversations</h2>
          <Button variant="quiet" className="blockr-assistant-drawer-close" aria-label="Close" onPress={onClose}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </Button>
        </div>
        <div className="blockr-assistant-drawer-tools">
          <Button variant="secondary" className="blockr-assistant-drawer-new" onPress={props.onNew}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 3.5v9M3.5 8h9" />
            </svg>
            New
          </Button>
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
      </section>
    </div>
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
// The question focuses its safe answer, which keeps the conversation.
function Row({ id, conversation, open, running, onSelect, onRename, onDelete }: RowProps): ReactElement {
  const [mode, setMode] = useState<"shown" | "renaming" | "confirming" | "deleting">("shown");

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
          <Button
            variant="quiet"
            aria-label={`Rename “${conversation.title}”`}
            onPress={() => {
              setMode("renaming");
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M10.5 3.5l2 2L6 12H4v-2z" />
            </svg>
          </Button>
          <Button
            variant="quiet"
            aria-label={`Delete “${conversation.title}”`}
            onPress={() => {
              setMode("confirming");
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8" />
            </svg>
          </Button>
        </span>
      ) : mode === "confirming" ? (
        <span className="blockr-assistant-drawer-confirm">
          Delete?
          <Button
            variant="quiet"
            className="blockr-assistant-drawer-confirm-yes"
            aria-label={`Delete “${conversation.title}”`}
            onPress={() => {
              setMode("deleting");
              onDelete(id).catch(() => {
                setMode("shown");
              });
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.5 8.5l3 3 6-7" />
            </svg>
          </Button>
          <Button
            variant="quiet"
            className="blockr-assistant-drawer-confirm-no"
            aria-label={`Keep “${conversation.title}”`}
            autoFocus
            onPress={() => {
              setMode("shown");
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </Button>
        </span>
      ) : (
        <span className="blockr-assistant-drawer-confirm">Deleting…</span>
      )}
    </li>
  );
}

// The field that renames a conversation, which gives onDone() the new title
// on Enter, and nothing on Escape or once it loses the focus.
// It takes the focus as it shows, with the title selected, so that typing
// replaces the title.
// Every key goes on to the drawer and the chat around it, as from a field of
// the browser's own. The field prevents the default of Enter and Escape, so
// that Escape neither closes the drawer nor stops the turn.
function Rename({ title, onDone }: { readonly title: string; readonly onDone: (title: string | undefined) => void }): ReactElement {
  const [draft, setDraft] = useState(title);

  return (
    <TextField
      className="blockr-assistant-drawer-rename"
      aria-label="Title of the conversation"
      value={draft}
      onChange={setDraft}
      autoFocus
      onFocus={(event) => {
        event.target.select();
      }}
      onKeyDown={(event) => {
        event.continuePropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          const renamed = normalizeTitle(draft);
          if (renamed !== undefined) onDone(renamed);
        } else if (event.key === "Escape") {
          // Escape leaves the field, and the drawer stays open.
          event.preventDefault();
          onDone(undefined);
        }
      }}
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
