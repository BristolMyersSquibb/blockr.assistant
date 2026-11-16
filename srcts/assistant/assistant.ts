// The assistant of the open board: its conversations, its skills and its
// turns, which the class's start opens as each board opens, and which last
// until the next board opens, as the plugin's signal aborts
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.1.12#running-a-plugin).
// What has to outlive a mount of the chat, the turn above all, runs from
// start, so the chat finds the assistant through the CoreApi that core gives
// both (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-panel).
// A frontend may mount the chat before core calls start, as core calls it once
// the frontend has drawn the board, so the chat waits for the assistant with
// nextAssistant().
//
// The turns call the model where the connection says. Until the assistant
// reads its blockr options, the connection names OpenAI's base URL, which
// speaks the Responses API, with no key and no default model. So every turn
// then fails with the error assistant_call_failed.

import type { CoreApi } from "@blockr/core";
import { createConversations } from "../conversations/index.ts";
import type { Conversations } from "../conversations/index.ts";
import { loadLoop } from "../loop/index.ts";
import type { Loop } from "../loop/index.ts";
import { createSkills } from "../skills/index.ts";
import type { Skills } from "../skills/index.ts";
import { readTools } from "../tools/index.ts";
import { createTurns } from "../turns/index.ts";
import type { Connection, Locks, Turns } from "../turns/index.ts";

export interface Assistant {
  readonly conversations: Conversations;
  readonly skills: Skills;
  readonly turns: Turns;
  // The signal that aborts as the next board opens, which ends the assistant.
  readonly signal: AbortSignal;
}

export interface AssistantOptions {
  // Where the calls go, how they are authenticated and the default model.
  readonly connection?: Connection;
  // Loads the loop, which imports pi's bundle.
  readonly load?: () => Promise<Loop>;
  // The tab's Web Locks, the page's by default.
  readonly locks?: Locks | undefined;
}

// The connection until the assistant reads its blockr options.
export const UNSET: Connection = {
  baseUrl: "https://api.openai.com/v1",
  api: "openai-responses",
  apiKey: () => Promise.resolve(undefined),
  model: null,
};

const opened = new WeakMap<CoreApi, Assistant>();
// Those who wait for the next assistant that opens on a CoreApi.
const waiting = new WeakMap<CoreApi, Set<(assistant: Assistant) => void>>();

// Opens the assistant of the board that opens, and keeps it where
// assistantOf() finds it until the signal aborts. Where the conversations
// cannot open, as for a cap that nobody can read, it logs why.
export function openAssistant(core: CoreApi, signal: AbortSignal, options: AssistantOptions = {}): Assistant {
  const conversations = createConversations(core, signal);
  conversations.opened.catch((error: unknown) => {
    core.log("blockr.assistant").error(error instanceof Error ? error : new Error(String(error)));
  });
  const skills = createSkills(core, signal);
  const turns = createTurns(core, signal, {
    conversations,
    tools: readTools(core, skills),
    connection: options.connection ?? UNSET,
    load: options.load ?? loadLoop,
    ...("locks" in options ? { locks: options.locks } : {}),
  });

  const assistant = { conversations, skills, turns, signal };
  opened.set(core, assistant);
  const waiters = waiting.get(core);
  waiting.delete(core);
  for (const waiter of waiters ?? []) waiter(assistant);
  signal.addEventListener(
    "abort",
    () => {
      if (opened.get(core) === assistant) opened.delete(core);
    },
    { once: true },
  );
  return assistant;
}

// The assistant of the board that the CoreApi has open, or undefined before
// the class's start has opened it.
export function assistantOf(core: CoreApi): Assistant | undefined {
  return opened.get(core);
}

// Resolves with the assistant of the board that the CoreApi has open, at once
// where the class's start has opened it, and otherwise once start opens it.
// An assistant whose board has closed does not count, so the promise waits for
// the next one.
export function nextAssistant(core: CoreApi): Promise<Assistant> {
  const open = opened.get(core);
  if (open !== undefined && !open.signal.aborted) return Promise.resolve(open);
  return new Promise((resolve) => {
    const waiters = waiting.get(core) ?? new Set();
    waiters.add(resolve);
    waiting.set(core, waiters);
  });
}
