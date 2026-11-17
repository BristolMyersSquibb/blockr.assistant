// Compaction, which puts a summary in place of a conversation's older
// messages, so that the conversation's calls stay within its model's context
// window, as pi's own CLI compacts a session
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.3#compaction).
// The class's start opens it as each board opens, and it lasts until the next
// board opens, as the signal aborts.
//
// A conversation gets a summary at three moments:
// - Before each call of a turn, where the conversation needs one by the rule
//   (./rule.ts). The turn's call waits for the summary, which also covers a
//   board that opens with a conversation past the rule, at its first call.
// - Once a turn's call failed since the conversation outgrew the model's
//   context window, after which the turn tries the call once more (../turns).
// - As the user asks, through the slash command /compact, whatever the rule
//   says, where there is anything to summarize.
//
// A compaction runs in these steps:
// 1. It cuts the conversation into the older messages, which the summary
//    covers, and the newest ones, which it keeps (./rule.ts).
// 2. It has the loop make the call that writes the summary of the older
//    exchanges, on the model that the turn talks to, with the earlier summary
//    to update. Where the cut falls inside an exchange, a second call writes
//    a summary of that exchange's start, at the same time (./prompt.ts).
// 3. It adds the calls' tokens through blockr.assistant-add_usage, so that
//    the meter counts them.
// 4. It puts the summary in place of the older messages through the
//    conversations, which run blockr.assistant-compact_conversation, or change
//    the memory alone under a cap of 0 (../conversations). It names the first
//    message that it keeps in `from`, so that a message that the user sent
//    meanwhile, as a turn starts, stays after it.
//
// One compaction runs at a time in a conversation, and a turn that calls the
// model meanwhile waits for it, until the turn stops. The chat shows for
// which conversations the model writes a summary, as writing() says. A
// compaction that runs for a turn stops with the turn, as the stop button
// stops it, and writes nothing then. The next board's opening stops every
// compaction, after which none writes anything.
//
// A compaction that fails leaves the conversation as it was, and raises the
// warning assistant_compaction_failed, one for each conversation. The turn's
// call then goes out with the conversation as it was. The compaction
// withdraws a conversation's warning once a later compaction of the
// conversation succeeds, or once the conversation goes
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#what-fails).
// A summary whose conversation goes meanwhile goes with it, and raises
// nothing. Where the deployment offers no model, the compaction raises nothing
// either, since the models raised why already.

import type { CoreApi } from "@blockr/core";
import type { Conversations } from "../conversations/index.ts";
import type { ModelReply } from "../loop/index.ts";
import { heldError } from "../notifications/index.ts";
import type { HeldError } from "../notifications/index.ts";
import { newId } from "../state/index.ts";
import type { ConversationId, Message } from "../state/index.ts";
import { prepareCall } from "../turns/index.ts";
import type { CallOptions, PreparedCall } from "../turns/index.ts";
import { historyPrompt, mergedSummary, SUMMARY_SYSTEM_PROMPT, turnStartPrompt } from "./prompt.ts";
import { cutOf, keptTokens, needsSummary } from "./rule.ts";

export interface CompactionOptions extends CallOptions {
  readonly conversations: Conversations;
}

export interface Compaction {
  // What a turn does before each of its calls: it puts a summary in place
  // where the conversation needs one by the rule, or waits for the compaction
  // that runs in the conversation, until the signal aborts. It resolves once
  // the call may go out, whether a summary went in or not.
  beforeCall(conversation: ConversationId, call: PreparedCall, signal: AbortSignal): Promise<void>;
  // Puts a summary in place whatever the rule says, where there is anything
  // to summarize: for the call given, with its signal, as a turn's call that
  // overflowed asks, or for the call that the compaction prepares, as /compact
  // asks. It resolves with whether a summary went in.
  compact(conversation: ConversationId, call?: PreparedCall, signal?: AbortSignal): Promise<boolean>;
  // Whether the model writes a summary of the conversation.
  writing(conversation: ConversationId): boolean;
  // Calls the listener whenever what writing() gives may have changed, until
  // the function that it returns is called.
  subscribe(listener: () => void): () => void;
}

export function createCompaction(core: CoreApi, signal: AbortSignal, options: CompactionOptions): Compaction {
  const { conversations } = options;
  // The compaction that runs in each conversation, which resolves with whether
  // a summary went in.
  const runs = new Map<ConversationId, Promise<boolean>>();
  const writes = new Set<ConversationId>();
  const listeners = new Set<() => void>();
  // The warning of each conversation whose last compaction failed.
  const warnings = new Map<ConversationId, HeldError>();

  // Whether the board is closed, as the next board opened. A function, since
  // the signal aborts while a compaction awaits.
  function closed(): boolean {
    return signal.aborted;
  }

  function changed(): void {
    for (const listener of listeners) listener();
  }

  function warn(conversation: ConversationId, why: string): void {
    if (closed()) return;
    let warning = warnings.get(conversation);
    if (warning === undefined) {
      warning = heldError(core, signal, "assistant_compaction_failed", "warning");
      warnings.set(conversation, warning);
    }
    const title = conversations.get(conversation)?.title ?? conversation;
    warning.raise(`The assistant could not summarize the earlier messages of the conversation "${title}": ${why}`);
  }

  function withdraw(conversation: ConversationId): void {
    warnings.get(conversation)?.withdraw();
    warnings.delete(conversation);
  }

  const unfollow = conversations.subscribe(() => {
    for (const conversation of [...warnings.keys()]) {
      if (conversations.get(conversation) === undefined) withdraw(conversation);
    }
  });
  signal.addEventListener(
    "abort",
    () => {
      unfollow();
      listeners.clear();
    },
    { once: true },
  );

  // Runs the compaction in the conversation, where none runs in it already,
  // and otherwise resolves as the one that runs.
  function run(conversation: ConversationId, compacting: () => Promise<boolean>): Promise<boolean> {
    const running = runs.get(conversation);
    if (running !== undefined) return running;
    const done = compacting().finally(() => {
      runs.delete(conversation);
    });
    runs.set(conversation, done);
    return done;
  }

  // Writes the summary and puts it in place, for the call given, with the
  // signal given. It resolves with whether the summary went in.
  async function summarize(conversation: ConversationId, { loop, model }: PreparedCall, stop: AbortSignal): Promise<boolean> {
    const stopped = (): boolean => closed() || stop.aborted || conversations.get(conversation) === undefined;
    const held = conversations.get(conversation);
    if (held === undefined || stopped()) return false;
    const cut = cutOf(held.messages, keptTokens(loop.contextWindow(model)));
    const kept = cut === undefined ? undefined : held.messages[cut.first];
    if (cut === undefined || kept === undefined) return false;
    const earlier = cut.start === 1 ? textOf(held.messages[0]) : undefined;
    const history = held.messages.slice(cut.start, cut.turnStart ?? cut.first);
    const turnStart = cut.turnStart === undefined ? [] : held.messages.slice(cut.turnStart, cut.first);

    writes.add(conversation);
    changed();
    try {
      const write = (prompt: string): Promise<ModelReply> => loop.callModel({ ...model, systemPrompt: SUMMARY_SYSTEM_PROMPT, prompt, signal: stop });
      const [past, start] = await Promise.all([
        history.length > 0 ? write(historyPrompt(history, earlier)) : undefined,
        turnStart.length > 0 ? write(turnStartPrompt(turnStart)) : undefined,
      ]);
      if (stopped()) return false;
      const written = [past, start].filter((result) => result !== undefined);
      const input = written.reduce((sum, result) => sum + result.usage.input, 0);
      const output = written.reduce((sum, result) => sum + result.usage.output, 0);
      const total = written.reduce((sum, result) => sum + result.usage.total, 0);
      if (input > 0 || output > 0 || total > 0) await conversations.addUsage(conversation, input, output, total);
      const failure = written.find((result) => result.text === undefined)?.failure;
      if (failure !== undefined) {
        warn(conversation, failure);
        return false;
      }
      const covered = past?.text ?? earlier ?? "No prior history.";
      const text = start?.text === undefined ? covered : mergedSummary(covered, start.text);
      const summary: Message = { id: newId(), role: "summary", parts: [{ type: "text", text }], created: new Date().toISOString() };
      await conversations.compactConversation(conversation, summary, kept.id);
      withdraw(conversation);
      return true;
    } catch (error) {
      if (!stopped()) warn(conversation, error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      writes.delete(conversation);
      changed();
    }
  }

  return {
    async beforeCall(conversation, call, stop) {
      const running = runs.get(conversation);
      if (running !== undefined) {
        await untilAborted(running, stop);
        return;
      }
      const held = conversations.get(conversation);
      if (held === undefined || !needsSummary(held, call.loop.contextWindow(call.model))) return;
      await run(conversation, () => summarize(conversation, call, stop));
    },

    compact(conversation, call, stop = signal) {
      return run(conversation, async () => {
        if (call !== undefined) return summarize(conversation, call, stop);
        await conversations.opened;
        if (conversations.get(conversation) === undefined || closed()) return false;
        const prepared = await prepareCall(options, () => conversations.get(conversation)?.model ?? null, closed);
        if (prepared.kind === "stopped") return false;
        if (prepared.kind === "failed") {
          if (prepared.raise) warn(conversation, prepared.why);
          return false;
        }
        return summarize(conversation, prepared, stop);
      });
    },

    writing: (conversation) => writes.has(conversation),

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// The text of a message, its text parts joined.
function textOf(message: Message | undefined): string {
  return (message?.parts ?? []).flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n\n");
}

// Resolves once the promise settles, or once the signal aborts.
function untilAborted(promise: Promise<unknown>, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const done = (): void => {
      signal.removeEventListener("abort", done);
      resolve();
    };
    signal.addEventListener("abort", done, { once: true });
    promise.then(done, done);
  });
}
