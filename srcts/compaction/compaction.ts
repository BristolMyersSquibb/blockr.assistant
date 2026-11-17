// Compaction, which puts a summary in place of a conversation's older
// messages, so that the conversation's calls stay within its model's context
// window (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.3#compaction).
// The class's start opens it as each board opens, beside the turns, and it
// lasts until the next board opens, as the signal aborts.
//
// It judges a conversation by its rule (./rule.ts) at two moments:
// - As a turn in the conversation ends, however the turn ended. The
//   compaction learns of that by following the turns.
// - As the board opens, for each conversation that the board holds, so that a
//   conversation that the board saved past its rule gets a summary before its
//   next turn. Only the loop knows a model's context window, through pi's
//   catalogs, so the board's opening loads the loop where a conversation's
//   last call spent tokens.
// The slash command /compact compacts a conversation whatever the rule says,
// through compact().
//
// A compaction runs in these steps:
// 1. It prepares the call as a turn prepares one, for the model that the
//    conversation's next turn talks to (../turns).
// 2. It splits the conversation into the older messages, which the summary
//    covers, and the newer ones, which it keeps (./rule.ts). Where a turn runs
//    in the conversation, it stops, since the turn's end judges the
//    conversation again.
// 3. It has the loop make the call, which sends the older messages as text,
//    then the request for the summary (./prompt.ts).
// 4. It adds the call's tokens through blockr.assistant-add_usage, so that
//    the meter counts them.
// 5. It puts the summary in place of the older messages through the
//    conversations, which run blockr.assistant-compact_conversation, or change
//    the memory alone under a cap of 0 (../conversations). The messages that
//    entered the conversation while the model wrote the summary stay after
//    it.
//
// The call runs beside the turns rather than as one, so that a turn may start
// while the model writes, and the stop button stops the turn alone
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#slash-commands).
// Only the next board's opening stops the call, after which the compaction
// writes nothing. One compaction runs at a time in each conversation, and
// writing() says for which conversations the model writes a summary, which
// the chat shows.
//
// A compaction that fails leaves the conversation as it was, and raises the
// warning assistant_compaction_failed, one for each conversation. The
// compaction withdraws a conversation's warning once a later compaction of the
// conversation succeeds, or once the conversation goes
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#what-fails).
// A summary whose conversation goes meanwhile goes with it, and raises
// nothing. Where the deployment offers no model, the compaction raises nothing
// either, since the models raised why already.

import type { CoreApi } from "@blockr/core";
import type { Conversations } from "../conversations/index.ts";
import { heldError } from "../notifications/index.ts";
import type { HeldError } from "../notifications/index.ts";
import { newId } from "../state/index.ts";
import type { ConversationId, Message } from "../state/index.ts";
import { prepareCall } from "../turns/index.ts";
import type { CallOptions, Turns } from "../turns/index.ts";
import { SUMMARY_SYSTEM_PROMPT, summaryPrompt } from "./prompt.ts";
import { firstKept, keptTokens, lastIsCurrent, needsSummary } from "./rule.ts";

export interface CompactionOptions extends CallOptions {
  readonly conversations: Conversations;
  // The turns of the board, whose ends the compaction follows.
  readonly turns: Pick<Turns, "current" | "subscribe">;
}

export interface Compaction {
  // Compacts the conversation where it needs a summary by the rule, as the end
  // of a turn in it and the board's opening ask. It resolves once the summary
  // is in place, or once the compaction failed or found that the conversation
  // needs none.
  judge(conversation: ConversationId): Promise<void>;
  // Compacts the conversation whatever the rule says, as /compact asks. It
  // resolves as judge() does, or once the compaction found nothing to
  // summarize.
  compact(conversation: ConversationId): Promise<void>;
  // Whether the model writes a summary of the conversation.
  writing(conversation: ConversationId): boolean;
  // Calls the listener whenever what writing() gives may have changed, until
  // the function that it returns is called.
  subscribe(listener: () => void): () => void;
}

// A compaction that runs, and whether the user asked for it, which a later
// ask sets where it comes while the compaction prepares its call.
interface Run {
  readonly asked: { forced: boolean };
  readonly done: Promise<void>;
}

export function createCompaction(core: CoreApi, signal: AbortSignal, options: CompactionOptions): Compaction {
  const { conversations, turns } = options;
  const runs = new Map<ConversationId, Run>();
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

  const unfollowConversations = conversations.subscribe(() => {
    for (const conversation of [...warnings.keys()]) {
      if (conversations.get(conversation) === undefined) withdraw(conversation);
    }
  });

  // The conversation of the turn that ran when the turns last changed.
  let turnIn = turns.current()?.conversation;
  const unfollowTurns = turns.subscribe(() => {
    const now = turns.current()?.conversation;
    if (turnIn !== undefined && turnIn !== now) void start(turnIn, false);
    turnIn = now;
  });

  signal.addEventListener(
    "abort",
    () => {
      unfollowConversations();
      unfollowTurns();
      listeners.clear();
    },
    { once: true },
  );

  conversations.opened.then(
    () => {
      for (const conversation of Object.keys(conversations.all())) void start(conversation, false);
    },
    // The assistant logs why the conversations cannot open.
    () => undefined,
  );

  function start(conversation: ConversationId, forced: boolean): Promise<void> {
    const running = runs.get(conversation);
    if (running !== undefined) {
      running.asked.forced ||= forced;
      return running.done;
    }
    const asked = { forced };
    const done = compactIn(conversation, asked).finally(() => {
      runs.delete(conversation);
    });
    runs.set(conversation, { asked, done });
    return done;
  }

  async function compactIn(conversation: ConversationId, asked: { readonly forced: boolean }): Promise<void> {
    try {
      await conversations.opened;
      const held = conversations.get(conversation);
      // The rule cannot judge a conversation whose usage.last counts no call
      // that sent the conversation as it is, so the loop need not load.
      if (held === undefined || closed() || (!asked.forced && !lastIsCurrent(held))) return;

      const prepared = await prepareCall(options, () => conversations.get(conversation)?.model ?? null, closed);
      if (prepared.kind === "stopped") return;
      if (prepared.kind === "failed") {
        if (prepared.raise) warn(conversation, prepared.why);
        return;
      }
      const { loop, model } = prepared;
      const window = loop.contextWindow(model);
      const now = conversations.get(conversation);
      if (now === undefined || (!asked.forced && !needsSummary(now, window))) return;
      if (turns.current()?.conversation === conversation) return;
      const first = firstKept(now.messages, keptTokens(window));
      const through = first === undefined ? undefined : now.messages[first - 1];
      if (through === undefined) return;

      writes.add(conversation);
      changed();
      try {
        const older = now.messages.slice(0, first);
        const summarized = await loop.summarize({ ...model, systemPrompt: SUMMARY_SYSTEM_PROMPT, prompt: summaryPrompt(older), signal });
        if (closed() || conversations.get(conversation) === undefined) return;
        const { input, output, total } = summarized.usage;
        if (input > 0 || output > 0 || total > 0) await conversations.addUsage(conversation, input, output, total);
        if (summarized.text === undefined) {
          warn(conversation, summarized.failure ?? "The model wrote no summary.");
          return;
        }
        const summary: Message = { id: newId(), role: "summary", parts: [{ type: "text", text: summarized.text }], created: new Date().toISOString() };
        await conversations.compactConversation(conversation, summary, through.id);
        withdraw(conversation);
      } finally {
        writes.delete(conversation);
        changed();
      }
    } catch (error) {
      // A conversation that went meanwhile takes its summary with it.
      if (closed() || conversations.get(conversation) === undefined) return;
      warn(conversation, error instanceof Error ? error.message : String(error));
    }
  }

  return {
    judge: (conversation) => start(conversation, false),

    compact: (conversation) => start(conversation, true),

    writing: (conversation) => writes.has(conversation),

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
