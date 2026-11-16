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
// 3. It loads the loop and its provider code with a dynamic import, which the
//    browser does once, as the board's first turn starts, since a page where
//    nobody asks the assistant anything never needs them.
// 4. It runs on the model that the conversation picked, or on the default.
//    The reply streams in the plugin's memory, which current() gives, and
//    enters the conversation as one finished message, with the results of its
//    tool calls as a message of the role tool. The memory keeps each reply's
//    reasoning, by message.
// 5. After each call, it adds the call's input and output tokens, and every
//    token of the call as the total, through blockr.assistant-add_usage.
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
// The turns withdraw it once a later call succeeds, and core withdraws it as
// the next board opens.
// The memory keeps the failure by the conversation's last message, so that
// the chat shows it at its turn. The conversation keeps what the turn
// finished, and what its reply streamed until the failure.

import type { CoreApi } from "@blockr/core";
import type { Conversations } from "../conversations/index.ts";
import type { Answered, Connection as LoopConnection, Handlers, Loop, Streamed } from "../loop/index.ts";
import { ASSISTANT } from "../state/index.ts";
import type { ConversationId } from "../state/index.ts";
import type { Tool } from "../tools/index.ts";
import { holdLock, pageLocks } from "./lock.ts";
import type { Locks } from "./lock.ts";

// Where the turns' calls go and how they are authenticated, with the model
// that a conversation talks to where it picked none, or null for none.
export interface Connection extends LoopConnection {
  readonly model: string | null;
}

export interface TurnsOptions {
  readonly conversations: Conversations;
  readonly tools: readonly Tool[];
  readonly connection: Connection;
  // Loads the loop, which imports pi's bundle.
  readonly load: () => Promise<Loop>;
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
  readonly controller: AbortController;
}

// Why a turn's signal aborted.
const STOP = new DOMException("The user stopped the turn.", "AbortError");
const CLOSED = new DOMException("Another board opened, which ended the turn.", "AbortError");
const GONE = new DOMException("The turn's conversation took no more messages.", "AbortError");

const NO_MODEL = "The assistant has no model to talk to, since the conversation picked none and the app offers none.";

export function createTurns(core: CoreApi, signal: AbortSignal, options: TurnsOptions): Turns {
  const { conversations, connection } = options;
  const locks = "locks" in options ? options.locks : pageLocks();
  const listeners = new Set<() => void>();
  let running: State | undefined;
  // What current() gives, which changed() makes anew.
  let snapshot: Running | undefined;
  // Withdraws the notification of a failed call that the turns raised, where
  // they raised one.
  let withdraw: (() => void) | undefined;

  signal.addEventListener(
    "abort",
    () => {
      withdraw = undefined;
    },
    { once: true },
  );

  // Whether the board is closed, as the next board opened. A function, since
  // the signal aborts while a turn awaits.
  function closed(): boolean {
    return signal.aborted;
  }

  function changed(): void {
    snapshot = running === undefined ? undefined : { conversation: running.conversation, reply: running.reply, results: running.results, stopping: running.stopping };
    for (const listener of listeners) listener();
  }

  // Raises the error of a failed call, in place of the one before, and keeps
  // why the turn failed by the conversation's last message.
  function fail(conversation: ConversationId, why: string): void {
    withdraw?.();
    withdraw = core.notifications.notify(ASSISTANT, { severity: "error", code: "assistant_call_failed", message: why });
    const last = conversations.get(conversation)?.messages.at(-1);
    if (last !== undefined) conversations.keep(conversation, last.id, { failure: why });
  }

  function succeeded(): void {
    withdraw?.();
    withdraw = undefined;
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
        if (call.failure !== undefined) {
          if (writes && !closed()) fail(turn.conversation, `The assistant's call to the model failed: ${call.failure}`);
        } else if (!turn.controller.signal.aborted) {
          succeeded();
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
    const held = conversations.get(turn.conversation);
    if (held === undefined) return;
    const model = held.model ?? connection.model;
    if (model === null) {
      fail(turn.conversation, NO_MODEL);
      return;
    }

    let loop: Loop;
    try {
      loop = await options.load();
    } catch (error) {
      if (!closed()) fail(turn.conversation, `The assistant could not load the code that runs its turns: ${messageOf(error)}`);
      return;
    }
    if (turn.controller.signal.aborted) return;

    await loop.run({
      connection,
      model,
      tools: options.tools,
      messages: () => conversations.get(turn.conversation)?.messages ?? [],
      kept: (message) => conversations.kept(turn.conversation, message),
      signal: turn.controller.signal,
      on: handlers(turn),
    });
  }

  return {
    async run(conversation) {
      if (closed()) throw new Error("The board that the assistant's turns ran on is closed.");
      if (running !== undefined) {
        throw new Error(`A turn of the assistant runs already on the board, in the conversation "${running.conversation}".`);
      }
      const turn: State = { conversation, reply: undefined, results: {}, stopping: false, controller: new AbortController() };
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
