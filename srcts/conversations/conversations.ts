// The conversations: the one way in which the loop and the chat change a
// conversation, and the plugin's memory, which holds what the state leaves out
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.3#how-much-of-a-conversation-the-state-keeps).
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
// The memory also keeps, by message, what the state leaves out of it
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.3#files-and-images):
// - A reply's reasoning, as text, which the chat shows, and the reply as the
//   loop's library wrote it, which the loop sends back to the model.
// - The images that the results of a message of the role tool carried, which
//   the loop sends to the model and the chat shows.
// - Why the turn that ended at the message failed, which the chat shows.
//
// What the memory holds follows its conversation: it goes with a conversation
// that the state no longer holds, whoever removed it, and with the messages
// that a summary replaces.
//
// The chat follows the conversations through subscribe(), which calls it
// whenever what all() or kept() gives may have changed: as the assistant's
// state changes, and as the memory changes, which no change of the board
// shows (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-panel).
// Until then all() gives the same object, as React's useSyncExternalStore()
// asks of a snapshot, and so does each conversation in it that did not change.

import type { CoreApi, Json } from "@blockr/core";
import {
  addedUsage,
  assistantState,
  findConversation,
  holdsMessage,
  messagesToDrop,
  newConversation,
} from "../state/index.ts";
import type { AssistantState, Conversation, ConversationId, Message, MessageId } from "../state/index.ts";
import { readCap } from "./cap.ts";

// The origin of the steps that the conversations take through the commands.
const ORIGIN = "assistant";

// What the memory keeps of a message, which the state leaves out of it.
export interface Kept {
  // A reply's reasoning, as the text of each part of it that the provider
  // gave as text.
  readonly reasoning?: readonly string[];
  // A reply as the loop's library wrote it, which the loop alone reads.
  readonly reply?: unknown;
  // The images that the results of a message of the role tool carried, by the
  // id of each call.
  readonly images?: Readonly<Record<string, readonly KeptImage[]>>;
  // Why the turn that ended at the message failed.
  readonly failure?: string;
}

export interface KeptImage {
  // The image's bytes, as base64.
  readonly data: string;
  readonly mimeType: string;
}

export interface Conversations {
  // Resolves once the conversations have opened, and rejects where the
  // opening fails.
  readonly opened: Promise<void>;
  // Every conversation by id, each with every message that the plugin holds of
  // it: those in the memory, then those in the state. It gives the same object
  // until something that it or kept() gives changes.
  all(): Readonly<Record<ConversationId, Conversation>>;
  // The conversation under the id, as all() gives it, or undefined.
  get(conversation: ConversationId): Conversation | undefined;
  // What the memory keeps of a message of the conversation, or undefined.
  kept(conversation: ConversationId, message: MessageId): Kept | undefined;
  // Keeps more of a message that the conversation holds in the memory, over
  // what it kept of the message before.
  keep(conversation: ConversationId, message: MessageId, kept: Kept): void;
  // Each of these changes a conversation as the command of its name does.
  // A message that addMessage() adds takes with it what the memory keeps of
  // it, where it is given.
  // The summary of compactConversation() takes the place of the messages up to
  // `through`, the last message that it covers. The command gets the message
  // after `through` as `from`, as the conversation holds it when the command
  // runs, or no `from` where `through` is the conversation's last message. So
  // the messages that entered the conversation while the model wrote the
  // summary stay.
  addConversation(id: ConversationId, title: string, model?: string | null): Promise<void>;
  renameConversation(conversation: ConversationId, title: string): Promise<void>;
  removeConversation(conversation: ConversationId): Promise<void>;
  addMessage(conversation: ConversationId, message: Message, kept?: Kept): Promise<void>;
  compactConversation(conversation: ConversationId, summary: Message, through: MessageId): Promise<void>;
  addUsage(conversation: ConversationId, input: number, output: number, total: number): Promise<void>;
  setModel(conversation: ConversationId, model: string | null): Promise<void>;
  // Calls the listener whenever what all() or kept() gives may have changed,
  // until the function that it returns is called.
  subscribe(listener: () => void): () => void;
}

export function createConversations(core: CoreApi, signal: AbortSignal): Conversations {
  // The cap, once it is read.
  let cap: number | undefined;
  // Under a cap of 0, every conversation, by id.
  const memory = new Map<ConversationId, Conversation>();
  // Under any other cap, the messages of each conversation that the cap cut
  // from the state, oldest first.
  const older = new Map<ConversationId, readonly Message[]>();
  // What the memory keeps of each message, by conversation and message.
  const keptOf = new Map<ConversationId, Map<MessageId, Kept>>();

  // Whoever follows the conversations, and how often the memory has changed.
  const listeners = new Set<() => void>();
  let changes = 0;
  // What all() gave last, with the assistant's state and the count of changes
  // that it read, and each conversation that it gave with the messages of the
  // memory first, with the conversation of the state and the messages that it
  // read.
  let given:
    | { readonly state: AssistantState | undefined; readonly changes: number; readonly all: Readonly<Record<ConversationId, Conversation>> }
    | undefined;
  const merged = new Map<ConversationId, { readonly held: Conversation; readonly cut: readonly Message[]; readonly conversation: Conversation }>();

  function notify(): void {
    for (const listener of listeners) listener();
  }

  // Counts a change of the memory and tells whoever follows.
  function changed(): void {
    changes += 1;
    notify();
  }

  // Under a cap of 0, the state holds no conversation, and the memory alone
  // says which conversations there are.
  let state = assistantState(core.store.board());
  const stop = core.store.subscribe((_change, board) => {
    const now = assistantState(board);
    if (now === state) return;
    state = now;
    if (cap !== 0) {
      const held = now?.conversations ?? {};
      for (const id of older.keys()) {
        if (!Object.hasOwn(held, id)) older.delete(id);
      }
      for (const id of keptOf.keys()) {
        if (!Object.hasOwn(held, id)) keptOf.delete(id);
      }
      for (const id of merged.keys()) {
        if (!Object.hasOwn(held, id)) merged.delete(id);
      }
    }
    notify();
  });
  signal.addEventListener(
    "abort",
    () => {
      stop();
      listeners.clear();
    },
    { once: true },
  );

  const capped = readCap(core).then(async (read) => {
    cap = read;
    changed();
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
      changed();
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
    if (cut.length === 0) return;
    older.set(conversation, [...(older.get(conversation) ?? []), ...cut]);
    changed();
  }

  // The conversation with the messages that the memory holds of it first,
  // the same object as last time where neither changed since.
  function withOlder(id: ConversationId, held: Conversation): Conversation {
    const cut = older.get(id);
    if (cut === undefined) return held;
    const last = merged.get(id);
    if (last?.held === held && last.cut === cut) return last.conversation;
    const conversation = { ...held, messages: [...cut, ...held.messages] };
    merged.set(id, { held, cut, conversation });
    return conversation;
  }

  // Changes a conversation in the memory, under a cap of 0.
  function change(conversation: ConversationId, changing: (held: Conversation) => Conversation): void {
    const held = memory.get(conversation);
    if (held === undefined) throw new Error(`The plugin's memory holds no conversation "${conversation}".`);
    memory.set(conversation, changing(held));
    changed();
  }

  function get(conversation: ConversationId): Conversation | undefined {
    if (cap === 0) return memory.get(conversation);
    const held = findConversation(core.store.board(), conversation);
    return held === undefined ? undefined : withOlder(conversation, held);
  }

  function keep(conversation: ConversationId, message: MessageId, kept: Kept): void {
    const held = keptOf.get(conversation) ?? new Map<MessageId, Kept>();
    held.set(message, { ...held.get(message), ...kept });
    keptOf.set(conversation, held);
    changed();
  }

  // Drops what the memory keeps of a message, as of one that did not enter its
  // conversation.
  function unkeep(conversation: ConversationId, message: MessageId): void {
    if (keptOf.get(conversation)?.delete(message) === true) changed();
  }

  // Drops what the memory keeps of the messages that the conversation no
  // longer holds, as those that a summary replaced.
  function forget(conversation: ConversationId): void {
    const held = keptOf.get(conversation);
    if (held === undefined) return;
    const ids = new Set(get(conversation)?.messages.map((message) => message.id) ?? []);
    const gone = [...held.keys()].filter((id) => !ids.has(id));
    for (const id of gone) held.delete(id);
    if (gone.length > 0) changed();
  }

  return {
    opened: capped.then(() => undefined),

    all() {
      const now = cap === 0 ? undefined : assistantState(core.store.board());
      if (given !== undefined && given.state === now && given.changes === changes) return given.all;
      const all =
        cap === 0
          ? Object.fromEntries(memory)
          : Object.fromEntries(Object.entries(now?.conversations ?? {}).map(([id, conversation]) => [id, withOlder(id, conversation)]));
      given = { state: now, changes, all };
      return all;
    },

    get,

    kept(conversation, message) {
      return keptOf.get(conversation)?.get(message);
    },

    keep(conversation, message, kept) {
      if (get(conversation)?.messages.some((held) => held.id === message) !== true) {
        throw new Error(`The conversation "${conversation}" holds no message "${message}".`);
      }
      keep(conversation, message, kept);
    },

    async addConversation(id, title, model = null) {
      if ((await capped) !== 0) {
        await run("blockr.assistant-add_conversation", { id, title, model });
        return;
      }
      if (memory.has(id)) throw new Error(`The plugin's memory holds a conversation "${id}" already.`);
      memory.set(id, newConversation(title, model));
      changed();
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
      keptOf.delete(conversation);
      changed();
    },

    async addMessage(conversation, message, kept) {
      const read = await capped;
      // What the memory keeps of the message goes in first, so that whoever
      // follows the conversations reads the message with it.
      if (kept !== undefined) keep(conversation, message.id, kept);
      try {
        if (read !== 0) {
          const before = findConversation(core.store.board(), conversation)?.messages ?? [];
          const done = run("blockr.assistant-add_message", { conversation, message, ...(read === Infinity ? {} : { keep: read }) });
          keepCut(conversation, before);
          await done;
        } else {
          change(conversation, (held) => {
            if (holdsMessage(held, message.id)) {
              throw new Error(`The conversation "${conversation}" holds a message "${message.id}" already.`);
            }
            return { ...held, messages: [...held.messages, message], updated: message.created };
          });
        }
      } catch (error) {
        if (kept !== undefined) unkeep(conversation, message.id);
        throw error;
      }
    },

    async compactConversation(conversation, summary, through) {
      const read = await capped;
      if (read === 0) {
        change(conversation, (inMemory) => ({ ...inMemory, messages: compacted(inMemory.messages, summary, through, conversation) }));
        forget(conversation);
        return;
      }
      // From here on, nothing awaits until the command has applied, so no
      // message enters the conversation between reading `from` and the
      // command.
      const held = findConversation(core.store.board(), conversation);
      const left = held === undefined ? [] : compacted(withOlder(conversation, held).messages, summary, through, conversation);
      const from = left[1]?.id;
      if (held === undefined || from === undefined || holdsMessage(held, from)) {
        // The memory holds only messages that the summary covers. Where the
        // state lacks the conversation, the command refuses.
        await run("blockr.assistant-compact_conversation", { conversation, summary, ...(from === undefined ? {} : { from }) });
        if (older.delete(conversation)) changed();
      } else {
        // The cap has cut the conversation past `from`, so the state keeps
        // what it holds, every message of it newer than what the summary
        // covers.
        older.set(conversation, left.slice(0, left.length - held.messages.length));
        changed();
      }
      forget(conversation);
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

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// The messages with the summary in place of those up to `through`, or an
// error where the messages lack `through` or one after it has the summary's
// id.
function compacted(messages: readonly Message[], summary: Message, through: MessageId, conversation: ConversationId): Message[] {
  const index = messages.findIndex((message) => message.id === through);
  const kept = messages.slice(index + 1);
  if (index < 0 || kept.some((message) => message.id === summary.id)) {
    throw new Error(
      `The conversation "${conversation}" holds no message "${through}" for the summary to take the place of, or holds a message "${summary.id}" after it.`,
    );
  }
  return [summary, ...kept];
}
