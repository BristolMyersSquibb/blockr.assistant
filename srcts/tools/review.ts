// The review of a step, which the edit tool and undo_edit return once their
// step has applied, as steps 3 to 7 of the edit tool have it
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.2#the-edit-tool):
// 1. From the changes of the step, the review takes the blocks that the step
//    added or whose state or links it changed, every block downstream of them,
//    and the blocks that feed the changed blocks directly (./changes.ts).
// 2. It brings those blocks up to date with one one-time evaluation, given the
//    turn's signal. It passes no parameters, since a one-time evaluation with
//    parameters has R run every block again, whether the block is current or
//    not.
// 3. It picks the blocks that it covers: at most assistant_review_max_blocks,
//    the changed blocks first, then those that feed them, then those
//    downstream.
// 4. It sends one request, describe_result, for those of them that read
//    ready, with the turn's signal.
// 5. It gives, for each block that it covers, its status, why it is invalid or
//    waiting where it is, why the transport could not send its latest
//    evaluation where it could not, the conditions that appeared since the
//    step began, what describe_result() wrote, and the state of each block
//    that the step added, within the caps of today's review of a commit
//    (R/stage-review.R at fcbdb27). It marks as unverified a changed block
//    that has no result but has not failed, says how many blocks it left out,
//    and names the blocks, links and stacks that the step added or removed.
// What happens meanwhile:
// - A block that the user edits meanwhile reports its status at its newer
//   revision, since the review reads each status once it has its texts. Such
//   an edit delays the evaluation and the request rather than failing them.
// - A block that leaves the board meanwhile is named as removed, so that the
//   model does not report it as built. Where every block of step 2 leaves, the
//   one-time evaluation rejects, and the review names each of them so.
// - Where another board opens, the review says only that the step applied to
//   a board that is no longer open.
// - Where core rejects the request of step 4, the review sends it once more
//   without the blocks that the rejection names, and where that fails too, it
//   gives the one-line summary of each block that reads ready, as
//   scheduler.status() has it, in place of each text. Where R loses the
//   request to a new session, the review goes back to step 2 once, since every
//   block then reads stale.
// - A stop while the review waits leaves the step applied, so the review says
//   that the user stopped the turn, and gives as much as it has.
// The review sends its request inside context.with() of the context that the
// tool captured before its first await, so that the request's span goes under
// the tool's, as core puts it under the span that is active as request() is
// called (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4#proposal).
// It takes the conditions of R's reply itself, as every tool's request does,
// so that core raises no notification for them, and its notes give the
// warnings and messages that R raised as it described the results
// (./conditions.ts).

import { context } from "@opentelemetry/api";
import type { Context } from "@opentelemetry/api";
import type { BlockId, BlockStatus, Board, Condition, CoreApi, Json } from "@blockr/core";
import { answeredObject, answeredText, failureMessage, isRequestError, isSessionEnded } from "../requests/index.ts";
import { readToolCap } from "./caps.ts";
import { addedAndRemoved, changedBlocks } from "./changes.ts";
import type { Heard } from "./changes.ts";
import { toolRequest, withConditions } from "./conditions.ts";
import { own } from "./context.ts";
import { cutText, leaveOutLong } from "./cut.ts";
import { conditionList } from "./statuses.ts";
import { json } from "./tool.ts";

const STATE_HINT = "call get_block_state for the full argument values";

// The note on a changed block that has no result but has not failed, as
// today's review marks it.
const UNVERIFIED =
  "You changed this block and it produced no result to check, so what you built here is UNVERIFIED. Do not report it as done: say what is unverified, or get the block into a state where it evaluates.";

const REMOVED = "The block left the board while the tool waited for its review.";

// What the review reads its caps as.
export interface Caps {
  // The most blocks that it covers.
  readonly blocks: number;
  // A value of an added block's state, past which the review leaves the value
  // out.
  readonly value: number;
  // An added block's state, past which the review cuts it.
  readonly state: number;
}

// The caps of the review, which the tool reads before its step, so that a cap
// that nobody can read fails the tool before the step applies.
export async function reviewCaps(core: Pick<CoreApi, "blockrOption">): Promise<Caps> {
  const [blocks, value, state] = await Promise.all([
    readToolCap(core, "assistant_review_max_blocks"),
    readToolCap(core, "assistant_state_value_max_chars"),
    readToolCap(core, "assistant_summary_max_chars"),
  ]);
  return { blocks, value, state };
}

// The conditions of each block, by block id, each as its key.
export type Conditions = ReadonlyMap<BlockId, ReadonlySet<string>>;

// The conditions of every block on the board now, which the tool reads before
// its step.
export function conditionsNow(core: Pick<CoreApi, "store" | "scheduler">): Conditions {
  return new Map(
    Object.keys(core.store.board().blocks).map((id) => [id, new Set((core.scheduler.status(id)?.conditions ?? []).map(conditionKey))]),
  );
}

export interface Step {
  // The changes of the step, as the tool heard them.
  readonly heard: readonly Heard[];
  // The conditions of each block before the step.
  readonly before: Conditions;
  // What the result gives before the review, such as whether the step applied.
  readonly head: Readonly<Record<string, Json>>;
  // What the step is, as the notes name it, such as "the commands".
  readonly what: string;
  // What the result notes besides what the review notes.
  readonly notes?: readonly string[];
  readonly caps: Caps;
}

export interface Signals {
  // The turn's, which aborts where the user stops the turn.
  readonly turn: AbortSignal;
  // The one that core aborts as the next board opens.
  readonly board: AbortSignal;
}

// What the result of a step gives before its review: the head, and the
// blocks, links and stacks that the step added and removed, by kind.
export function stepResult(heard: readonly Heard[], head: Readonly<Record<string, Json>>): Record<string, Json> {
  return withChanges(head, addedAndRemoved(heard));
}

function withChanges(head: Readonly<Record<string, Json>>, { added, removed }: ReturnType<typeof addedAndRemoved>): Record<string, Json> {
  return {
    ...head,
    ...(Object.keys(added).length === 0 ? {} : { added }),
    ...(Object.keys(removed).length === 0 ? {} : { removed }),
  };
}

// The result of the step with its review.
export async function reviewed(core: CoreApi, step: Step, signals: Signals, active: Context): Promise<Record<string, Json>> {
  const changes = addedAndRemoved(step.heard);
  const result = withChanges(step.head, changes);
  const notes = [...(step.notes ?? [])];
  const done = (): Record<string, Json> => (notes.length === 0 ? result : { ...result, notes });

  const groups = reviewGroups(core.store.board(), changedBlocks(step.heard));
  const all = [...groups.changed, ...groups.feeding, ...groups.downstream];
  if (all.length === 0) return done();

  const picked = all.slice(0, step.caps.blocks);
  const described = await describeResults(core, all, picked, signals, active, step.what);
  if (described.closed) {
    notes.push(closed(step.what));
    return done();
  }
  if (described.note !== undefined) notes.push(described.note);
  const raised = await withConditions(core, "", described.conditions);
  if (raised !== "") notes.push(`R raised these as it described the results:\n${raised}`);

  const changed = new Set(groups.changed);
  const fresh = new Set(changes.added.blocks ?? []);
  result.blocks = Object.fromEntries(
    picked.map((id) => [
      id,
      blockEntry(core, id, {
        before: step.before,
        text: own(described.texts, id),
        summary: described.summaries,
        added: fresh.has(id),
        changed: changed.has(id),
        caps: step.caps,
      }),
    ]),
  );
  if (picked.length < all.length) {
    notes.push(
      `The review shows ${String(picked.length)} of the ${String(all.length)} blocks that ${step.what} changed, that feed them or that are downstream of them. Call get_block_result or inspect_results for the rest.`,
    );
  }
  return done();
}

// The blocks that the review evaluates, in three groups, each in the order of
// the board: those of `changed` that the board holds, those that feed them
// directly, and those downstream of them.
function reviewGroups(board: Board, changed: readonly BlockId[]) {
  const order = Object.keys(board.blocks);
  const links = Object.values(board.links);
  const changing = new Set(changed.filter((id) => Object.hasOwn(board.blocks, id)));
  const feeding = new Set(links.filter(({ from, to }) => changing.has(to) && !changing.has(from)).map(({ from }) => from));
  const downstream = new Set<BlockId>();
  const queue = [...changing];
  for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
    for (const { from, to } of links) {
      if (from !== id || changing.has(to) || downstream.has(to)) continue;
      downstream.add(to);
      queue.push(to);
    }
  }
  const inOrder = (ids: ReadonlySet<BlockId>, except: ReadonlySet<BlockId> = new Set()): BlockId[] =>
    order.filter((id) => ids.has(id) && !except.has(id));
  return { changed: inOrder(changing), feeding: inOrder(feeding), downstream: inOrder(downstream, feeding) };
}

interface Described {
  // What describe_result() wrote about each block that R described, by id.
  readonly texts: Readonly<Record<BlockId, string>>;
  // The conditions of R's reply to the request that R answered.
  readonly conditions: readonly Condition[];
  // Whether the review gives each ready block's one-line summary in place of
  // the texts that it lacks.
  readonly summaries: boolean;
  // Why the review is incomplete, where it is.
  readonly note?: string;
  // Whether another board opened meanwhile.
  readonly closed?: boolean;
}

// Steps 2 to 4: evaluates the blocks, and has R describe the results of those
// that the review covers and that read ready.
async function describeResults(
  core: CoreApi,
  all: readonly BlockId[],
  picked: readonly BlockId[],
  signals: Signals,
  active: Context,
  what: string,
): Promise<Described> {
  for (let attempt = 1; ; attempt++) {
    let statuses: Readonly<Record<BlockId, BlockStatus>>;
    try {
      statuses = await core.scheduler.evaluate(all, undefined, { signal: signals.turn });
    } catch (error) {
      return halted(core, error, signals, all, { what, waited: "the evaluation of the blocks" });
    }
    const ready = picked.filter((id) => own(statuses, id)?.status === "ready");
    try {
      return { ...(await requested(core, ready, signals.turn, active)), summaries: false };
    } catch (error) {
      if (isSessionEnded(error) && attempt === 1) continue;
      return halted(core, error, signals, all, { what, waited: "the request that has R describe the results" });
    }
  }
}

// What the review gives where what it waited for failed: that another board
// opened, that the user stopped the turn, or why it failed, unless every block
// left the board, which the review then names as removed. It gives the ready
// blocks' summaries in place of the texts that it lacks.
function halted(
  core: CoreApi,
  error: unknown,
  signals: Signals,
  all: readonly BlockId[],
  { what, waited }: { readonly what: string; readonly waited: string },
): Described {
  if (signals.board.aborted) return { texts: {}, conditions: [], summaries: false, closed: true };
  if (signals.turn.aborted) {
    return {
      texts: {},
      conditions: [],
      summaries: true,
      note: `The user stopped the turn while the tool waited for its review, after ${what} applied. So the review gives each block's status as it was then, with no description of its result.`,
    };
  }
  if (all.every((id) => core.scheduler.status(id) === undefined)) return { texts: {}, conditions: [], summaries: false };
  const why = isSessionEnded(error) ? "R's session ended twice before R answered." : failureMessage(error);
  return {
    texts: {},
    conditions: [],
    summaries: true,
    note: `The review could not finish ${waited}. ${/[.!?]$/.test(why) ? why : `${why}.`} So it gives each block's status as it is now, and the one-line summary of each ready block's result in place of a description. Call get_block_result for a block's result.`,
  };
}

// What describe_result() wrote about the result of each block of `reads`, by
// id, with the conditions of R's reply, sent again without the blocks that
// core's rejection names where core rejects the request. Where that fails too,
// or R loses it to a new session, it rejects.
async function requested(core: CoreApi, reads: readonly BlockId[], signal: AbortSignal, active: Context): Promise<Answered> {
  if (reads.length === 0) return { texts: {}, conditions: [] };
  try {
    return await sent(core, reads, signal, active);
  } catch (error) {
    if (signal.aborted || isSessionEnded(error)) throw error;
    const named = new Set(isRequestError(error) ? error.blocks.map(({ block }) => block) : []);
    const rest = reads.filter((id) => !named.has(id) && core.scheduler.status(id) !== undefined);
    return rest.length === 0 ? { texts: {}, conditions: [] } : await sent(core, rest, signal, active);
  }
}

interface Answered {
  readonly texts: Readonly<Record<BlockId, string>>;
  readonly conditions: readonly Condition[];
}

async function sent(core: CoreApi, reads: readonly BlockId[], signal: AbortSignal, active: Context): Promise<Answered> {
  const { answer, conditions } = await context.with(active, () =>
    toolRequest(core, "describe_result", {}, { reads: [...reads], signal }),
  );
  const described = answeredObject(answer, "describe_result");
  const texts = Object.fromEntries(
    reads.flatMap((id) => {
      const text = own(described, id);
      return text === undefined ? [] : [[id, answeredText(text, "describe_result")]];
    }),
  );
  return { texts, conditions };
}

interface EntryOptions {
  readonly before: Conditions;
  readonly text: string | undefined;
  readonly summary: boolean;
  readonly added: boolean;
  readonly changed: boolean;
  readonly caps: Caps;
}

// What the review gives of one block, from its status now.
function blockEntry(core: CoreApi, id: BlockId, options: EntryOptions): Json {
  const status = core.scheduler.status(id);
  const block = own(core.store.board().blocks, id);
  if (status === undefined || block === undefined) return { removed: REMOVED };
  const kind = status.status;
  const seen = options.before.get(id);
  const conditions = status.conditions.filter(
    (condition) => (kind === "failed" && condition.severity === "error") || seen?.has(conditionKey(condition)) !== true,
  );
  return {
    status: kind,
    ...((kind === "invalid" || kind === "waiting") && status.reason !== null ? { reason: status.reason } : {}),
    ...(status.unsent === null ? {} : { unsent: status.unsent }),
    conditions: conditionList(conditions),
    ...(options.text === undefined ? {} : { result: options.text }),
    ...(options.text === undefined && options.summary && kind === "ready" && status.summary !== null ? { summary: status.summary } : {}),
    ...(options.added ? { state: addedState(block.state, options.caps) } : {}),
    ...(options.changed && kind !== "ready" && kind !== "failed" ? { unverified: UNVERIFIED } : {}),
  };
}

// The state of a block that the step added, as today's review gives it: each
// value whose JSON takes more than the value cap left out and marked, and the
// whole cut at the state cap, as its JSON text, where it takes more.
function addedState(state: Readonly<Record<string, Json>>, caps: Caps): Json {
  const shown = leaveOutLong(state, caps.value, STATE_HINT);
  const text = json(shown);
  return Array.from(text).length > caps.state ? cutText(text, caps.state, STATE_HINT) : shown;
}

// A condition as the review compares it with those before the step: by its
// severity, the phase that raised it and its message.
function conditionKey({ severity, phase, message }: Condition): string {
  return JSON.stringify([severity, phase ?? null, message]);
}

function closed(what: string): string {
  return `Another board opened while the tool waited, so ${what} applied to a board that is no longer open.`;
}
