// The turns of the open board, which the class's start makes, so that a turn
// goes on once the assistant's panel closes or its tab is hidden
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.1.12#running-a-plugin).
// The chat adds the user's message to a conversation, through the
// conversations, and then asks for a turn in that conversation through run()
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-message-field-and-a-turn).
// A turn runs in these steps:
// 1. It starts only where no other turn runs on the board, in whichever
//    conversation, since two turns would each edit the board under the other
//    (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#while-a-turn-runs).
// 2. It takes the tab's Web Lock, which it holds until it ends (./lock.ts).
// 3. It prepares its calls (./prepare.ts): where they go, the model that they
//    talk to, which the conversation picked where the deployment offers it,
//    with the model's settings, and the loop, which the browser loads once.
// 4. Before each call, compaction puts a summary in place where the
//    conversation nears the model's context window, and the call waits for
//    it (../compaction).
//    Each call sends the system prompt of the open board, and after the
//    conversation's last message the message of the app's, as it is when the
//    call goes out, with the board and what the user has on screen
//    (../prompt).
//    The reply streams in the plugin's memory, which current() gives, and
//    enters the conversation as one finished message, with the results of its
//    tool calls as a message of the role tool. The memory keeps each reply's
//    reasoning, by message.
// 5. After each call, it adds the call's input and output tokens, and every
//    token of the call as the total, through blockr.assistant-add_usage.
// 6. Where a call failed since the conversation outgrew the model's context
//    window, compaction puts a summary in place, and the turn tries the call
//    once more, as pi's own CLI does. The turn raises the call's failure only
//    where no summary went in or the second call fails too.
//
// A turn has a signal of its own, which stop() aborts, as the chat's stop
// button does, and which aborts as the next board opens, since core aborts
// the plugin's signal then
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#stopping-a-turn).
// - After a stop, what the reply streamed until then enters the conversation
//   as its message, and each tool call left without a result gets one that
//   says the user stopped the turn. A reply that streamed nothing adds no
//   message, since an empty reply would show as a spinner.
// - Once the next board opens, the turn writes nothing more, since it would
//   write to that board.
// - A turn whose conversation another plugin removes stops at its next
//   message, which no conversation takes.
//
// A call to the model that fails, and a turn that cannot start, raise the
// error assistant_call_failed from start, so that it holds once the panel
// closes (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#what-fails).
// A turn cannot start where a blockr option of the deployment holds a value
// that it does not take, or where the visitor authenticates and holds no key.
// It fails before its first call where a cap that the system prompt or the
// message of the app's reads holds a value that it does not take. The turns
// withdraw the error once a later call succeeds, and core withdraws it as the
// next board opens.
//
// A failed call that carried a key, the deployment's or the visitor's, says
// what it can of the key
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.1#how-a-call-is-authenticated):
// - Where the call's request got a 401 or a 403, the base URL refused the key.
// - Where the call's request got no answer that the page could read, the
//   turn has the models ask the base URL for its list of models with the same
//   key. OpenAI's refusal of a call's key reaches a page that way, while its
//   list's refusal reaches the page as a 401.
//   - A list that the base URL refuses says that it refused the key, and the
//     error adds why.
//   - A list that the base URL gives says that the key works, and the call
//     fails as any call does.
//   - Where the list fails as well, the error says that the connection was
//     lost and that the key may be wrong.
// With the deployment's key, that changes only the error. With the visitor's
// key, the turn also tells the key what the base URL said of it
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-credential):
// a refused key goes, so that the chat asks for a key again, and a key that
// may be wrong stays, while the chat asks for a key again, holding it. A call
// that succeeds tells the visitor's key that the base URL took it.
// A turn for which the deployment offers no model raises nothing of its own,
// since the models raised why already.
// The memory keeps the failure by the conversation's last message, so that
// the chat shows it at its turn. The conversation keeps what the turn
// finished, and what its reply streamed until the failure.
//
// A file that the user attached goes with every call of its conversation,
// from the memory (../loop). A provider may refuse such a file
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#what-fails):
// 1. A call fails, and the provider refused the request for what it held.
// 2. The call carried files that no call carried with success before. The
//    provider's answer does not say which one it refused, so each of them
//    counts as refused.
// 3. The turn ends, as a failed call ends it.
// 4. The turns raise the error assistant_attachment_refused, which names the
//    files and says why, in place of assistant_call_failed. The memory keeps
//    the failure by the conversation's last message.
// 5. The memory drops the content of those files, so that the conversation's
//    later calls go without them, while the state still names them.
// 6. A later call of that conversation that succeeds withdraws the error.
// A call that succeeds marks each file that it carried as taken, so that a
// later failure of the conversation's calls counts as no refusal of those
// files.
// A call that outgrew the model's window goes through compaction first, as
// any call does that outgrows it. Where the call after compaction fails again
// for what it holds, or where nothing could be compacted, the files that the
// call carried count as refused, since compaction keeps the newest exchange,
// which holds them.

import type { CoreApi } from "@blockr/core";
import { namesOf } from "../attachments/index.ts";
import type { Conversations, KeptFile } from "../conversations/index.ts";
import type { Compaction } from "../compaction/index.ts";
import type { Answered, Call, CarriedFile, Handlers, Streamed } from "../loop/index.ts";
import type { Models } from "../models/index.ts";
import { heldError } from "../notifications/index.ts";
import type { HeldError } from "../notifications/index.ts";
import type { Prompt } from "../prompt/index.ts";
import type { ConversationId } from "../state/index.ts";
import type { Tool } from "../tools/index.ts";
import { holdLock, pageLocks } from "./lock.ts";
import type { Locks } from "./lock.ts";
import { messageOf, prepareCall } from "./prepare.ts";
import type { CallOptions, Carried } from "./prepare.ts";

export interface TurnsOptions extends CallOptions {
  readonly conversations: Conversations;
  readonly tools: readonly Tool[];
  // The models that the deployment offers, which also ask the base URL for
  // its list with a key, to tell whether the base URL takes the key.
  readonly models: Pick<Models, "offered" | "check">;
  // The error assistant_call_failed, which the models raise as well, for a
  // list of models that the base URL refuses for its key.
  readonly callFailed: HeldError;
  // The system prompt of the open board, and the message of the app's for
  // each call.
  readonly prompt: Prompt;
  // The compaction, which puts a summary in place before a call that needs
  // one, and after a call that outgrew the window.
  readonly compaction: Pick<Compaction, "beforeCall" | "compact">;
  // The tab's Web Locks, the page's by default.
  readonly locks?: Locks | undefined;
}

export interface Turns {
  // Runs a turn in the conversation, which holds the user's message, and
  // resolves once the turn ends, however it ends. It rejects at once where a
  // turn runs already on the board, or where the board is closed.
  run(conversation: ConversationId): Promise<void>;
  // Stops the turn that runs, where one runs.
  stop(): void;
  // The turn that runs, or undefined. It gives the same object until the
  // turn changes, as React's useSyncExternalStore() asks of a snapshot.
  current(): Running | undefined;
  // Calls the listener whenever what current() gives changes, until the
  // function that it returns is called.
  subscribe(listener: () => void): () => void;
}

// A turn that runs.
export interface Running {
  readonly conversation: ConversationId;
  // The reply as it streams, until it enters the conversation.
  readonly reply: Streamed | undefined;
  // The results of the reply's tool calls that returned, by call, until the
  // results enter the conversation.
  readonly results: Readonly<Record<string, Answered>>;
  // Whether the user stopped the turn, which runs until the tool calls that
  // it waits for give up.
  readonly stopping: boolean;
}

interface State {
  conversation: ConversationId;
  reply: Streamed | undefined;
  results: Readonly<Record<string, Answered>>;
  stopping: boolean;
  // The key that the turn's last call carried, and whether it is the
  // visitor's, where the call carried a key.
  carried: Carried | undefined;
  // Why a call failed that outgrew the window, which the turn holds back
  // while it tries the call once more, and the files that the call carried
  // which no call carried with success before.
  overflow: string | undefined;
  overflowed: readonly CarriedFile[];
  // Whether the turn tried a call once more already.
  retried: boolean;
  readonly controller: AbortController;
}

// Why a turn's signal aborted.
const STOP = new DOMException("The user stopped the turn.", "AbortError");
const CLOSED = new DOMException("Another board opened, which ended the turn.", "AbortError");
const GONE = new DOMException("The turn's conversation took no more messages.", "AbortError");

const LOST = "The connection was lost, and the key may be wrong.";

export function createTurns(core: CoreApi, signal: AbortSignal, options: TurnsOptions): Turns {
  const { conversations, callFailed } = options;
  const locks = "locks" in options ? options.locks : pageLocks();
  const listeners = new Set<() => void>();
  let running: State | undefined;
  // What current() gives, which changed() makes anew.
  let snapshot: Running | undefined;
  // The error of a file that the provider refused, and the conversation whose
  // call raised it, until a later call of that conversation succeeds.
  const attachmentRefused = heldError(core, signal, "assistant_attachment_refused");
  let refusedIn: ConversationId | undefined;

  // Whether the board is closed, as the next board opened. A function, since
  // the signal aborts while a turn awaits.
  function closed(): boolean {
    return signal.aborted;
  }

  // Whether the turn stopped, or its board closed, while it awaited.
  function stopped(turn: State): boolean {
    return closed() || turn.controller.signal.aborted;
  }

  function changed(): void {
    snapshot = running === undefined ? undefined : { conversation: running.conversation, reply: running.reply, results: running.results, stopping: running.stopping };
    for (const listener of listeners) listener();
  }

  // Raises the error of a failed call, in place of the one before, and keeps
  // why the turn failed by the conversation's last message.
  function fail(conversation: ConversationId, why: string): void {
    callFailed.raise(why);
    keep(conversation, why);
  }

  // Keeps why the turn failed by the conversation's last message.
  function keep(conversation: ConversationId, why: string): void {
    const last = conversations.get(conversation)?.messages.at(-1);
    if (last !== undefined) conversations.keep(conversation, last.id, { failure: why });
  }

  // Raises the error of the files that the provider refused, keeps why the
  // turn failed, and drops the content of those files from the memory.
  function refuse(conversation: ConversationId, files: readonly CarriedFile[], why: string): void {
    const names = namesOf(files.map((file) => file.name));
    const which = files.length === 1 ? `the file ${names}, so the conversation goes on without it` : `the files ${names}, so the conversation goes on without them`;
    const message = `The provider refused ${which}: ${why}`;
    attachmentRefused.raise(message);
    refusedIn = conversation;
    keep(conversation, message);
    change(conversation, files, () => ({ refused: true }));
  }

  // Withdraws the errors that a call's success withdraws, marks the files
  // that the call carried as taken, and tells the visitor's key that the base
  // URL took it, where the call carried that key.
  function succeeded(turn: State, files: readonly CarriedFile[]): void {
    callFailed.withdraw();
    if (refusedIn === turn.conversation) {
      attachmentRefused.withdraw();
      refusedIn = undefined;
    }
    change(turn.conversation, files, taken);
    if (turn.carried?.visitor === true) options.key.took(turn.carried.key);
  }

  // Raises the error of a failed call, once the turn knows what the call says
  // of its key, where the call carried one.
  async function failed(turn: State, call: Call & { readonly failure: string }): Promise<void> {
    const why = `The assistant's call to the model failed: ${call.failure}`;
    const { carried } = turn;
    if (carried === undefined || call.answer === undefined) {
      fail(turn.conversation, why);
      return;
    }
    const { key, visitor } = carried;
    if (call.answer === "refused") {
      fail(turn.conversation, why);
      if (visitor) options.key.refused(key);
      return;
    }
    const checked = await options.models.check(key);
    if (closed()) return;
    switch (checked.kind) {
      case "refused":
        fail(turn.conversation, `${sentence(why)} ${checked.message}`);
        if (visitor) options.key.refused(key);
        return;
      case "listed":
        fail(turn.conversation, why);
        if (visitor) options.key.took(key);
        return;
      case "failed":
        fail(turn.conversation, `${sentence(why)} ${LOST}`);
        if (visitor) options.key.lost(key);
        return;
    }
  }

  // Changes the files given in the memory, by message. A message that the
  // conversation no longer holds keeps nothing to change.
  function change(conversation: ConversationId, files: readonly CarriedFile[], changing: (file: KeptFile) => KeptFile): void {
    const byMessage = new Map<string, Set<number>>();
    for (const file of files) byMessage.set(file.message, (byMessage.get(file.message) ?? new Set()).add(file.index));
    for (const [message, indices] of byMessage) {
      const held = conversations.kept(conversation, message)?.files;
      if (held === undefined) continue;
      const next = held.map((file, index) => (indices.has(index) ? changing(file) : file));
      try {
        conversations.keep(conversation, message, { files: next });
      } catch {
        // The conversation no longer holds the message.
      }
    }
  }

  // What the turn does with what the loop reports.
  function handlers(turn: State): Handlers {
    // Whether the turn still writes to its conversation: not once its board
    // closed, nor once its conversation took no message.
    let writes = true;
    const write = async (change: () => Promise<void>): Promise<void> => {
      if (!writes || closed()) return;
      try {
        await change();
      } catch (error) {
        writes = false;
        turn.controller.abort(GONE);
        core.log("blockr.assistant").warn(`The assistant stopped its turn, since its conversation took no more messages: ${messageOf(error)}`);
      }
    };

    return {
      streaming(reply) {
        turn.reply = reply;
        changed();
      },
      async called(call) {
        turn.reply = undefined;
        if (call.reply !== undefined) {
          const { message, kept } = call.reply;
          await write(() => conversations.addMessage(turn.conversation, message, kept));
        }
        const { input, output, total } = call.usage;
        if (input > 0 || output > 0 || total > 0) {
          await write(() => conversations.addUsage(turn.conversation, input, output, total));
        }
        const { failure } = call;
        if (failure !== undefined) {
          if (call.overflow === true && !turn.retried && !turn.controller.signal.aborted) {
            turn.overflow = failure;
            turn.overflowed = call.files;
          } else if (writes && !closed()) {
            if (call.refused && call.files.length > 0) refuse(turn.conversation, call.files, failure);
            else await failed(turn, { ...call, failure });
          }
        } else if (!turn.controller.signal.aborted) {
          succeeded(turn, call.files);
        }
        changed();
      },
      returned(id, result) {
        turn.results = { ...turn.results, [id]: result };
        changed();
      },
      async results(message, kept) {
        await write(() => conversations.addMessage(turn.conversation, message, kept));
        turn.results = {};
        changed();
      },
    };
  }

  async function runTurn(turn: State): Promise<void> {
    if (conversations.get(turn.conversation) === undefined) return;

    const prepared = await prepareCall(
      options,
      () => conversations.get(turn.conversation)?.model ?? null,
      () => stopped(turn),
      (carried) => {
        turn.carried = carried;
      },
    );
    if (prepared.kind === "stopped") return;
    if (prepared.kind === "failed") {
      if (!prepared.raise) keep(turn.conversation, prepared.why);
      else if (!closed()) fail(turn.conversation, prepared.why);
      return;
    }

    let systemPrompt: string;
    try {
      systemPrompt = await options.prompt.system();
    } catch (error) {
      if (!closed()) fail(turn.conversation, `The assistant cannot write its system prompt: ${messageOf(error)}`);
      return;
    }
    if (stopped(turn)) return;

    const call = { loop: prepared.loop, model: prepared.model };
    const loop = (): Promise<void> =>
      prepared.loop.run({
        ...prepared.model,
        tools: options.tools,
        messages: () => conversations.get(turn.conversation)?.messages ?? [],
        kept: (message) => conversations.kept(turn.conversation, message),
        systemPrompt,
        appMessage: () => options.prompt.appMessage(),
        beforeCall: (stop) => options.compaction.beforeCall(turn.conversation, call, stop),
        signal: turn.controller.signal,
        on: handlers(turn),
      });

    await loop();
    const overflow = turn.overflow;
    if (overflow === undefined || stopped(turn)) return;
    turn.overflow = undefined;
    turn.retried = true;
    const compacted = await options.compaction.compact(turn.conversation, call, turn.controller.signal);
    if (stopped(turn)) return;
    if (compacted) await loop();
    else if (turn.overflowed.length > 0) refuse(turn.conversation, turn.overflowed, overflow);
    else fail(turn.conversation, `The assistant's call to the model failed: ${overflow}`);
  }

  return {
    async run(conversation) {
      if (closed()) throw new Error("The board that the assistant's turns ran on is closed.");
      if (running !== undefined) {
        throw new Error(`A turn of the assistant runs already on the board, in the conversation "${running.conversation}".`);
      }
      const turn: State = { conversation, reply: undefined, results: {}, stopping: false, carried: undefined, overflow: undefined, overflowed: [], retried: false, controller: new AbortController() };
      const close = (): void => {
        turn.controller.abort(CLOSED);
      };
      signal.addEventListener("abort", close, { once: true });
      running = turn;
      changed();

      const release = await holdLock(locks);
      try {
        await runTurn(turn);
      } catch (error) {
        if (!closed()) fail(conversation, `The assistant's turn failed: ${messageOf(error)}`);
      } finally {
        release();
        signal.removeEventListener("abort", close);
        running = undefined;
        changed();
      }
    },

    stop() {
      if (running === undefined || running.controller.signal.aborted) return;
      running.stopping = true;
      running.controller.abort(STOP);
      changed();
    },

    current() {
      return snapshot;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// A file that a call carried with success, which the provider took.
function taken(file: KeptFile): KeptFile {
  return "refused" in file || file.taken === true ? file : { ...file, taken: true };
}

// The text given, ending as a sentence ends, so that another sentence can
// follow it: pi's message of a connection that failed, "Connection error.:
// Failed to fetch", ends with no full stop.
function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
