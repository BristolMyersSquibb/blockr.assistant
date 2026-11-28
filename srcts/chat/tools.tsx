// The rows of a reply's tool calls
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#tool-calls).
// A row shows the calls of a run to one tool (./rows.ts), folded to its title,
// and opens to each call's args and result.
// - A call that runs shows as running.
// - A call whose result is marked as an error shows as failed.
// - A call that has no result and that the turn does not wait for, as in a
//   board saved during a turn, shows that the turn ended before it returned,
//   as the plugin tells the model.
// - The images of a result show while the board stays open, as the plots of
//   inspect_results do. Once the board opens again, the result says how many
//   it had.
// - The rows of the edit tool and of undo_edit name the commands that the edit
//   ran and each block of its review with its status, or the command that
//   refused and why (./edit.ts).

import type { CSSProperties, ReactElement } from "react";
import { ENDED } from "../loop/index.ts";
import { useChat, useChatActions } from "./context.ts";
import { editView } from "./edit.ts";
import { useBoard } from "./hooks.ts";
import type { EditView, ReviewedBlock } from "./edit.ts";
import type { Call, Row } from "./rows.ts";
import { toolTitle } from "./rows.ts";
import { dotColor, dotOf } from "./status.ts";

type CallState = "running" | "done" | "failed" | "ended";

// The tools whose rows show their edit.
const EDITS: ReadonlySet<string> = new Set(["edit", "undo_edit"]);

// The rows of a run of tool calls.
export function ToolRows({ rows }: { readonly rows: readonly Row[] }): ReactElement {
  return (
    <div className="blockr-assistant-tools">
      {rows.map((row) => (
        <ToolRow key={row.calls[0]?.id ?? row.tool} row={row} />
      ))}
    </div>
  );
}

function ToolRow({ row }: { readonly row: Row }): ReactElement {
  const { waiting } = useChat();
  const states = row.calls.map((call) => stateOf(call, waiting));
  const state = rowState(states);
  const edits = EDITS.has(row.tool) ? <Edits calls={row.calls} /> : null;

  return (
    <details className="blockr-assistant-tool" data-state={state}>
      <summary>
        <StateMark state={state} />
        <span className="blockr-assistant-tool-title">{toolTitle(row.tool)}</span>
        {row.calls.length > 1 ? <span className="blockr-assistant-tool-count">{row.calls.length}</span> : null}
        {edits}
      </summary>
      <div className="blockr-assistant-tool-calls">
        {row.calls.map((call, index) => (
          <CallDetails key={call.id} call={call} state={states[index] ?? "done"} />
        ))}
      </div>
    </details>
  );
}

// What the calls of the edit tool's row did, which the row shows while it is
// folded: the commands that they ran, then each block of their reviews with
// its status, the last review's where two give the same block, or the
// command that refused and why.
function Edits({ calls }: { readonly calls: readonly Call[] }): ReactElement {
  const { core } = useChatActions();
  // The row names each block by its name on the board, and by its id once it
  // has left, so it follows the board.
  const board = useBoard(core);
  const views = calls.map((call) => editView(call.args, call.result?.text, call.error, core, board));
  const commands = views.flatMap((view) => view.commands);
  const blocks = new Map<string, ReviewedBlock>();
  for (const view of views) for (const block of view.blocks) blocks.set(block.id, block);
  const refused = views.flatMap((view) => (view.refused === undefined ? [] : [view.refused]));

  return (
    <span className="blockr-assistant-edit">
      {commands.length > 0 ? <span className="blockr-assistant-edit-commands">{commands.join(", ")}</span> : null}
      {blocks.size > 0 ? (
        <span className="blockr-assistant-edit-blocks">
          {[...blocks.values()].map((block) => (
            <Block key={block.id} block={block} />
          ))}
        </span>
      ) : null}
      {refused.map((refusal, index) => (
        <span key={index} className="blockr-assistant-edit-refused">
          {refusal.command === undefined ? "Refused" : `Refused by ${refusal.command}`}
          {refusal.failures.length > 0 ? `: ${refusal.failures.join(" ")}` : ""}
        </span>
      ))}
    </span>
  );
}

// A block of an edit's review, with its status dot.
function Block({ block }: { readonly block: EditView["blocks"][number] }): ReactElement {
  const dot = block.status === undefined ? undefined : dotOf(block.status);
  const style = dot === undefined ? undefined : ({ "--blockr-assistant-dot": dotColor(dot) } as CSSProperties);
  return (
    <span className="blockr-assistant-block" data-removed={block.removed ? "" : undefined} title={block.removed ? `${block.name} left the board` : dot?.tooltip}>
      {dot === undefined ? null : <span className="blockr-assistant-dot" data-filled={dot.filled ? "" : undefined} style={style} />}
      <span className="blockr-assistant-block-name">{block.name}</span>
    </span>
  );
}

// A call's args and its result.
function CallDetails({ call, state }: { readonly call: Call; readonly state: CallState }): ReactElement {
  return (
    <div className="blockr-assistant-call" data-state={state}>
      <div className="blockr-assistant-call-label">Args</div>
      <pre className="blockr-assistant-call-args">{argsText(call.args)}</pre>
      <div className="blockr-assistant-call-label">Result</div>
      <Result call={call} state={state} />
    </div>
  );
}

function Result({ call, state }: { readonly call: Call; readonly state: CallState }): ReactElement {
  if (state === "running") return <p className="blockr-assistant-call-note">Running</p>;
  if (state === "ended" || call.result === undefined) return <p className="blockr-assistant-call-note">{ENDED}</p>;
  const { text, images, count } = call.result;
  return (
    <>
      {text === "" ? null : <pre className="blockr-assistant-call-result">{text}</pre>}
      {images.map((image, index) => (
        <img
          key={index}
          className="blockr-assistant-call-image"
          src={`data:${image.mimeType};base64,${image.data}`}
          alt={`Image ${String(index + 1)} of the result`}
        />
      ))}
      {images.length === 0 && count > 0 ? (
        <p className="blockr-assistant-call-note">
          {count === 1 ? "The result had an image, which the board does not keep." : `The result had ${String(count)} images, which the board does not keep.`}
        </p>
      ) : null}
    </>
  );
}

function StateMark({ state }: { readonly state: CallState }): ReactElement {
  const label = { running: "Running", done: "Done", failed: "Failed", ended: "Ended before it returned" }[state];
  return <span className="blockr-assistant-tool-mark" data-state={state} role="img" aria-label={label} title={label} />;
}

function stateOf(call: Call, waiting: ReadonlySet<string>): CallState {
  if (call.result === undefined) return waiting.has(call.id) ? "running" : "ended";
  return call.error ? "failed" : "done";
}

// The state of a row: running while any call runs, then failed where any
// call failed, then ended where any call ended before it returned.
function rowState(states: readonly CallState[]): CallState {
  for (const state of ["running", "failed", "ended"] as const) {
    if (states.includes(state)) return state;
  }
  return "done";
}

// The args of a call, which the model gave as JSON.
function argsText(args: unknown): string {
  return JSON.stringify(args ?? {}, null, 2);
}
