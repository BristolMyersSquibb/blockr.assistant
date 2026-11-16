// The conversations: the one way in which the loop and the chat change a
// conversation, and the plugin's memory, which holds what the state leaves out
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.3#how-much-of-a-thread-the-state-keeps).
// The class's start makes them as each board opens, and they last until the
// next board opens, as the signal aborts.
//
// They read the cap, the blockr option chat_save_turns (./cap.ts), and open
// in one of three ways:
// - Under a cap above 0, they cut every conversation to the cap through
//   blockr.assistant-trim_conversations, so that a board saved under a higher
//   cap keeps no more than this one allows.
// - Under a cap of 0, they move every conversation into the memory, removing
//   each from the state through blockr.assistant-remove_conversation.
// - Under -1, for every message, they change nothing.
//
// Then each function changes a conversation in one of two ways, so that
// neither the loop nor the chat has to know which:
// - Under a cap above 0, or under -1, it runs the command of its name. The
//   messages that the cap cuts from the state move into the memory, and a
//   conversation shows them before those that the state holds.
// - Under a cap of 0, it changes the memory alone, which holds every
//   conversation whole, with its title, its usage and its pick of the model,
//   and refuses what the command would refuse. So the plugin then runs none of
//   the commands that write a conversation.
// Each waits for the opening, and fails where the opening fails, as where
// chat_save_turns holds a value that the cap does not take.
//
// What the memory holds follows its conversation: it goes with a conversation
// that the state no longer holds, whoever removed it, and with the messages
// that a summary replaces.

import type { CoreApi, Json } from "@blockr/core";
import {
  addedUsage,
  assistantState,
  canCompact,
  findConversation,
  holdsMessage,
  messagesToDrop,
  newConversation,
} from "../state/index.ts";
import type { Conversation, ConversationId, Message, MessageId } from "../state/index.ts";
import { readCap } from "./cap.ts";

// The origin of the steps that the conversations take through the commands.
const ORIGIN = "assistant";

export interface Conversations {
  // Resolves once the conversations have opened, and rejects where the
  // opening fails.
  readonly opened: Promise<void>;
  // Every conversation by id, each with every message that the plugin holds of
  // it: those in the memory, then those in the state.
  all(): Readonly<Record<ConversationId, Conversation>>;
  // The conversation under the id, as all() gives it, or undefined.
  get(conversation: ConversationId): Conversation | undefined;
  // Each of these changes a conversation as the command of its name does.
  addConversation(id: ConversationId, title: string, model?: string | null): Promise<void>;
  renameConversation(conversation: ConversationId, title: string): Promise<void>;
  removeConversation(conversation: ConversationId): Promise<void>;
  addMessage(conversation: ConversationId, message: Message): Promise<void>;
  compactConversation(conversation: ConversationId, summary: Message, from: MessageId): Promise<void>;
  addUsage(conversation: ConversationId, input: number, output: number, total: number): Promise<void>;
  setModel(conversation: ConversationId, model: string | null): Promise<void>;
}

export function createConversations(core: CoreApi, signal: AbortSignal): Conversations {
  // The cap, once it is read.
  let cap: number | undefined;
  // Under a cap of 0, every conversation, by id.
  const memory = new Map<ConversationId, Conversation>();
  // Under any other cap, the messages of each conversation that the cap cut
  // from the state, oldest first.
  const older = new Map<ConversationId, readonly Message[]>();

  const stop = core.store.subscribe((_change, board) => {
    const held = assistantState(board)?.conversations ?? {};
    for (const id of older.keys()) {
      if (!Object.hasOwn(held, id)) older.delete(id);
    }
  });
  signal.addEventListener("abort", stop, { once: true });

  const capped = readCap(core).then(async (read) => {
    cap = read;
    await open(read);
    return read;
  });

  function run(id: string, args: Json): Promise<void> {
    return core.commands.run(id, args, ORIGIN);
  }

  async function open(read: number): Promise<void> {
    const conversations = assistantState(core.store.board())?.conversations ?? {};
    if (read === 0) {
      for (const [id, conversation] of Object.entries(conversations)) memory.set(id, conversation);
      await Promise.all(Object.keys(conversations).map((id) => run("blockr.assistant-remove_conversation", { conversation: id })));
      return;
    }
    if (!Object.values(conversations).some((conversation) => messagesToDrop(conversation.messages, read) > 0)) return;
    const done = run("blockr.assistant-trim_conversations", { keep: read });
    for (const [id, conversation] of Object.entries(conversations)) keepCut(id, conversation.messages);
    await done;
  }

  // Moves the messages of the conversation that the state held before a
  // command, and no longer holds after it, into the memory. A command that
  // does not prepare is applied before core's run() returns, so that this
  // runs right after it.
  function keepCut(conversation: ConversationId, before: readonly Message[]): void {
    const after = findConversation(core.store.board(), conversation);
    if (after === undefined) return;
    const kept = new Set(after.messages.map((message) => message.id));
    const cut = before.filter((message) => !kept.has(message.id));
    if (cut.length > 0) older.set(conversation, [...(older.get(conversation) ?? []), ...cut]);
  }

  // The conversation with the messages that the memory holds of it first.
  function withOlder(id: ConversationId, conversation: Conversation): Conversation {
    const cut = older.get(id);
    return cut === undefined ? conversation : { ...conversation, messages: [...cut, ...conversation.messages] };
  }

  // Changes a conversation in the memory, under a cap of 0.
  function change(conversation: ConversationId, changed: (held: Conversation) => Conversation): void {
    const held = memory.get(conversation);
    if (held === undefined) throw new Error(`The plugin's memory holds no conversation "${conversation}".`);
    memory.set(conversation, changed(held));
  }

  return {
    opened: capped.then(() => undefined),

    all() {
      if (cap === 0) return Object.fromEntries(memory);
      const conversations = assistantState(core.store.board())?.conversations ?? {};
      return Object.fromEntries(Object.entries(conversations).map(([id, conversation]) => [id, withOlder(id, conversation)]));
    },

    get(conversation) {
      if (cap === 0) return memory.get(conversation);
      const held = findConversation(core.store.board(), conversation);
      return held === undefined ? undefined : withOlder(conversation, held);
    },

    async addConversation(id, title, model = null) {
      if ((await capped) !== 0) {
        await run("blockr.assistant-add_conversation", { id, title, model });
        return;
      }
      if (memory.has(id)) throw new Error(`The plugin's memory holds a conversation "${id}" already.`);
      memory.set(id, newConversation(title, model));
    },

    async renameConversation(conversation, title) {
      if ((await capped) !== 0) {
        await run("blockr.assistant-rename_conversation", { conversation, title });
        return;
      }
      change(conversation, (held) => ({ ...held, title }));
    },

    async removeConversation(conversation) {
      if ((await capped) !== 0) {
        await run("blockr.assistant-remove_conversation", { conversation });
        return;
      }
      if (!memory.delete(conversation)) throw new Error(`The plugin's memory holds no conversation "${conversation}".`);
    },

    async addMessage(conversation, message) {
      const read = await capped;
      if (read !== 0) {
        const before = findConversation(core.store.board(), conversation)?.messages ?? [];
        const done = run("blockr.assistant-add_message", { conversation, message, ...(read === Infinity ? {} : { keep: read }) });
        keepCut(conversation, before);
        await done;
        return;
      }
      change(conversation, (held) => {
        if (holdsMessage(held, message.id)) {
          throw new Error(`The conversation "${conversation}" holds a message "${message.id}" already.`);
        }
        return { ...held, messages: [...held.messages, message], updated: message.created };
      });
    },

    async compactConversation(conversation, summary, from) {
      const read = await capped;
      if (read === 0) {
        change(conversation, (held) => ({ ...held, messages: compacted(held.messages, summary, from, conversation) }));
        return;
      }
      const held = findConversation(core.store.board(), conversation);
      if (held === undefined || holdsMessage(held, from)) {
        // The memory holds only messages before `from`, which the summary
        // replaces. Where the state lacks the conversation, the command
        // refuses.
        await run("blockr.assistant-compact_conversation", { conversation, summary, from });
        older.delete(conversation);
        return;
      }
      // The cap has cut the conversation past `from`, so the state keeps what
      // it holds, every message of it newer than what the summary covers.
      const cut = older.get(conversation) ?? [];
      const kept = compacted([...cut, ...held.messages], summary, from, conversation);
      older.set(conversation, kept.slice(0, kept.length - held.messages.length));
    },

    async addUsage(conversation, input, output, total) {
      if ((await capped) !== 0) {
        await run("blockr.assistant-add_usage", { conversation, input, output, total });
        return;
      }
      change(conversation, (held) => ({ ...held, usage: addedUsage(held.usage, input, output, total) }));
    },

    async setModel(conversation, model) {
      if ((await capped) !== 0) {
        await run("blockr.assistant-set_model", { conversation, model });
        return;
      }
      change(conversation, (held) => ({ ...held, model }));
    },
  };
}

// The messages with the summary in place of those before `from`, or an error
// where the messages lack `from` or one from it on has the summary's id.
function compacted(messages: readonly Message[], summary: Message, from: MessageId, conversation: ConversationId): Message[] {
  if (!canCompact(messages, summary, from)) {
    throw new Error(
      `The conversation "${conversation}" holds no message "${from}" for the summary to go before, or holds a message "${summary.id}" from it on.`,
    );
  }
  return [summary, ...messages.slice(messages.findIndex((message) => message.id === from))];
}
