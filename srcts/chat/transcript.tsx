// The transcript of the open conversation, which assistant-ui's viewport
// scrolls, as the reply streams, to the newest message, until the user
// scrolls up. A button then scrolls back to it, as in today's chat
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-message-field-and-a-turn).
// - A conversation with no message shows the greeting (./greeting.ts), whose
//   suggestions send nothing while a turn runs or the chat lacks the
//   visitor's key.
// - A message that the user sent shows its text as the user typed it, with the
//   name of each file that it holds.
// - A turn shows as one reply (./messages.ts), whose pieces show in the order
//   in which they came (./rows.ts): its text as Markdown, its reasoning as a
//   row that folds, its tool calls as rows (./tools.tsx), and why it failed,
//   where it failed.
// - A summary shows as one row, titled as a summary of the earlier messages,
//   folded to its title and opening to its text, as the row of a tool call
//   does (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#slash-commands).
// - While the turn runs in the conversation and shows nothing new, as before
//   its reply starts, the transcript says that it runs at its end.
// - While the model writes a summary of the conversation, the transcript says
//   so at its end (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#slash-commands).

import { useMemo } from "react";
import type { ReactElement, ReactNode } from "react";
import { useChat, useChatActions } from "./context.ts";
import { greetingOf } from "./greeting.ts";
import { useBoard } from "./hooks.ts";
import { libraries } from "./libraries.ts";
import { Markdown, MarkdownText } from "./markdown.tsx";
import { ATTACHMENT } from "./messages.ts";
import { segmentsOf } from "./rows.ts";
import { ToolRows } from "./tools.tsx";

export function Transcript(): ReactElement {
  const { AuiIf, ThreadPrimitive } = libraries();
  return (
    <ThreadPrimitive.Viewport className="blockr-assistant-transcript">
      <AuiIf condition={isEmpty}>
        <Greeting />
      </AuiIf>
      <ThreadPrimitive.Messages>{drawMessage}</ThreadPrimitive.Messages>
      <Working />
      <Compacting />
      <div className="blockr-assistant-transcript-end">
        <ThreadPrimitive.ScrollToBottom className="blockr-assistant-to-bottom" title="Scroll to the newest message" aria-label="Scroll to the newest message">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 3v10M3.5 8.5 8 13l4.5-4.5" />
          </svg>
        </ThreadPrimitive.ScrollToBottom>
      </div>
    </ThreadPrimitive.Viewport>
  );
}

// Whether the open conversation shows no message.
function isEmpty(state: { readonly thread: { readonly isEmpty: boolean } }): boolean {
  return state.thread.isEmpty;
}

// Each message, by its role in assistant-ui: a message that the user sent, a
// turn, or a summary.
function drawMessage({ message }: { readonly message: { readonly role: string } }): ReactNode {
  switch (message.role) {
    case "user":
      return <UserMessage />;
    case "system":
      return <Summary />;
    default:
      return <Reply />;
  }
}

function Greeting(): ReactElement {
  const { core, send } = useChatActions();
  const { noKey, running } = useChat();
  const board = useBoard(core);
  const { lead, note, suggestions } = greetingOf(board);
  return (
    <div className="blockr-assistant-greeting">
      <h3>{lead}</h3>
      <p>{note}</p>
      <ul className="blockr-assistant-suggestions">
        {suggestions.map((suggestion) => (
          <li key={suggestion}>
            <button
              type="button"
              className="blockr-assistant-suggestion"
              disabled={running !== undefined || noKey}
              onClick={() => {
                send(suggestion);
              }}
            >
              {suggestion}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UserMessage(): ReactElement {
  const { MessagePrimitive, useAuiState } = libraries();
  const parts = useAuiState(({ message }) => message.parts);
  const text = parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n\n");
  const files = parts.flatMap((part) => (part.type === "data" && part.name === ATTACHMENT ? [fileName(part.data)] : []));
  return (
    <MessagePrimitive.Root className="blockr-assistant-user">
      {text === "" ? null : <div className="blockr-assistant-user-text">{text}</div>}
      {files.length === 0 ? null : (
        <ul className="blockr-assistant-files">
          {files.map((name, index) => (
            <li key={index}>{name}</li>
          ))}
        </ul>
      )}
    </MessagePrimitive.Root>
  );
}

// A turn, whose reply streams while the turn runs.
function Reply(): ReactElement {
  const { MessagePrimitive, useAuiState } = libraries();
  const parts = useAuiState(({ message }) => message.parts);
  const running = useAuiState(({ message }) => message.status?.type === "running");
  const segments = useMemo(() => segmentsOf(parts), [parts]);
  return (
    <MessagePrimitive.Root className="blockr-assistant-reply">
      {segments.map((segment) => {
        switch (segment.kind) {
          case "text":
            return <MessagePrimitive.PartByIndex key={`text-${String(segment.index)}`} index={segment.index} components={TEXT} />;
          case "reasoning": {
            const part = parts[segment.index];
            const text = part?.type === "reasoning" ? part.text : "";
            const last = segment.index === parts.length - 1;
            return <Reasoning key={`reasoning-${String(segment.index)}`} text={text} running={running && last} />;
          }
          case "tools":
            return <ToolRows key={`tools-${segment.rows[0]?.calls[0]?.id ?? ""}`} rows={segment.rows} />;
          case "failure":
            return (
              <p key="failure" className="blockr-assistant-failure" role="alert">
                {segment.text}
              </p>
            );
        }
      })}
    </MessagePrimitive.Root>
  );
}

const TEXT = { Text: MarkdownText };

// The model's reasoning, as a row that folds, as in today's chat.
function Reasoning({ text, running }: { readonly text: string; readonly running: boolean }): ReactElement {
  return (
    <details className="blockr-assistant-reasoning" data-running={running ? "" : undefined}>
      <summary>
        <span className="blockr-assistant-reasoning-label">Reasoning</span>
      </summary>
      <div className="blockr-assistant-reasoning-text">
        <Markdown text={text} running={running} />
      </div>
    </details>
  );
}

function Summary(): ReactElement {
  const { MessagePrimitive, useAuiState } = libraries();
  const parts = useAuiState(({ message }) => message.parts);
  const text = parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n\n");
  return (
    <MessagePrimitive.Root className="blockr-assistant-summary">
      <details>
        <summary>Summary of the earlier messages</summary>
        <div className="blockr-assistant-summary-text">
          <Markdown text={text} />
        </div>
      </details>
    </MessagePrimitive.Root>
  );
}

// What the transcript shows at its end while the turn runs in the open
// conversation and shows nothing new, as before its reply starts and between
// its calls to the model. While the turn stops, the stop button says so
// instead (./composer.tsx), and while the turn waits for a summary, the line
// of the summary does.
function Working(): ReactElement | null {
  const { running, runsHere, waiting, compacting } = useChat();
  if (running === undefined || !runsHere || running.stopping || compacting) return null;
  const streamed = running.reply !== undefined && (running.reply.parts.length > 0 || running.reply.reasoning.length > 0);
  if (streamed || waiting.size > 0) return null;
  return (
    <p className="blockr-assistant-working" aria-label="The assistant is working">
      <span />
      <span />
      <span />
    </p>
  );
}

// What the transcript shows at its end while the model writes a summary of
// the open conversation, which a turn's next call waits for.
function Compacting(): ReactElement | null {
  const { compacting } = useChat();
  if (!compacting) return null;
  return (
    <p className="blockr-assistant-compacting" role="status">
      Writing a summary of the earlier messages
    </p>
  );
}

function fileName(data: unknown): string {
  const name = typeof data === "object" && data !== null ? (data as { readonly name?: unknown }).name : undefined;
  return typeof name === "string" ? name : "";
}
