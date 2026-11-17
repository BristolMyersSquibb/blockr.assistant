// The assistant of the open board: its conversations, its skills, the models
// that it offers, its turns and its compaction, which the class's start opens
// as each board opens, and which last until the next board opens, as the plugin's signal
// aborts (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.1.12#running-a-plugin).
// What has to outlive a mount of the chat, the turn above all, runs from
// start, so the chat finds the assistant through the CoreApi that core gives
// both (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-panel).
// A frontend may mount the chat before core calls start, as core calls it once
// the frontend has drawn the board, so the chat waits for the assistant with
// nextAssistant().
//
// The turns offer the read tools and the edit tools, which take the
// plugin's signal to tell another board opening from a stop.
//
// The turns call on the compaction before each call and after a call that
// outgrew the window. The compaction prepares the calls of /compact as the
// turns prepare theirs, on the same deployment, models, model settings,
// visitor's key and loop (../compaction).
//
// As the board opens, the assistant has R list the skills and read the
// deployment's template, each once (../skills, ../prompt). The turns then
// write the system prompt from both, and the message of the app's for each
// call (../prompt).
//
// As the board opens, the assistant reads the deployment's blockr options,
// which say where the calls go, how they are authenticated and which models
// the assistant offers (../deployment). The models and the turns read what the
// options say from there. Where an option holds a value that it does not
// take, each turn fails with the error assistant_call_failed, which says why.
// The assistant also has R read the deployment's model settings as the board
// opens, which the turns hand the loop (../model-settings).
// Where the deployment leaves the key to the visitor, the models, the turns
// and the compaction read the visitor's own key, which the page keeps across
// boards, and which the chat asks for (../visitor-key).
//
// Once a conversation's first exchange that the model answered ends, the
// assistant has a model call of its own title the conversation (../titles).

import type { CoreApi } from "@blockr/core";
import { createCompaction } from "../compaction/index.ts";
import type { Compaction } from "../compaction/index.ts";
import { createConversations } from "../conversations/index.ts";
import type { Conversations } from "../conversations/index.ts";
import { readDeployment } from "../deployment/index.ts";
import type { Deployment } from "../deployment/index.ts";
import { loadLoop } from "../loop/index.ts";
import type { Loop } from "../loop/index.ts";
import { createModelSettings } from "../model-settings/index.ts";
import { createModels } from "../models/index.ts";
import type { Fetch, Models } from "../models/index.ts";
import { heldError } from "../notifications/index.ts";
import { createPrompt, createTemplate } from "../prompt/index.ts";
import { createSkills } from "../skills/index.ts";
import type { Skills } from "../skills/index.ts";
import { titleConversations } from "../titles/index.ts";
import { editTools, readTools } from "../tools/index.ts";
import { createTurns } from "../turns/index.ts";
import type { Locks, Turns } from "../turns/index.ts";
import { pageKey } from "../visitor-key/index.ts";
import type { VisitorKey } from "../visitor-key/index.ts";

export interface Assistant {
  readonly conversations: Conversations;
  readonly skills: Skills;
  readonly models: Models;
  readonly turns: Turns;
  readonly compaction: Compaction;
  // What the deployment chose, which the chat reads to tell whether it asks
  // the visitor for a key. It rejects where an option holds a value that it
  // does not take.
  readonly deployment: Promise<Deployment>;
  // The visitor's own key.
  readonly key: VisitorKey;
  // The signal that aborts as the next board opens, which ends the assistant.
  readonly signal: AbortSignal;
}

export interface AssistantOptions {
  // What the deployment chose, which the assistant reads from its blockr
  // options unless given.
  readonly deployment?: Promise<Deployment>;
  // Loads the loop, which imports pi's bundle.
  readonly load?: () => Promise<Loop>;
  // The tab's Web Locks, the page's by default.
  readonly locks?: Locks | undefined;
  // How the assistant asks the base URL for its list of models, through the
  // page's fetch unless given.
  readonly fetch?: Fetch;
  // The visitor's own key, the page's unless given.
  readonly key?: VisitorKey;
}

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
  const prompt = createPrompt(core, { skills, template: createTemplate(core, signal) });
  const deployment = options.deployment ?? readDeployment(core);
  // The turns report why the options cannot be read, as each turn starts.
  deployment.catch(() => undefined);
  const callFailed = heldError(core, signal, "assistant_call_failed");
  const key = options.key ?? pageKey();
  const models = createModels(core, signal, { deployment, callFailed, key, fetch: options.fetch });
  const settings = createModelSettings(core, signal);
  const load = options.load ?? loadLoop;
  const compaction = createCompaction(core, signal, { conversations, deployment, models, settings, key, load });
  const turns = createTurns(core, signal, {
    conversations,
    tools: [...readTools(core, skills), ...editTools(core, signal)],
    deployment,
    models,
    settings,
    callFailed,
    key,
    prompt,
    compaction,
    load,
    ...("locks" in options ? { locks: options.locks } : {}),
  });
  titleConversations(core, signal, { conversations, turns, deployment, models, settings, key, load });

  const assistant = { conversations, skills, models, turns, compaction, deployment, key, signal };
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
