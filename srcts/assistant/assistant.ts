// The assistant of the open board: its conversations, its skills, the models
// that it offers and its turns, which the class's start opens as each board
// opens, and which last until the next board opens, as the plugin's signal
// aborts (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.1.12#running-a-plugin).
// What has to outlive a mount of the chat, the turn above all, runs from
// start, so the chat finds the assistant through the CoreApi that core gives
// both (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-panel).
//
// As the board opens, the assistant reads the deployment's blockr options,
// which say where the calls go, how they are authenticated and which models
// the assistant offers (../deployment). The models and the turns read what the
// options say from there. Where an option holds a value that it does not
// take, each turn fails with the error assistant_call_failed, which says why.

import type { CoreApi } from "@blockr/core";
import { createConversations } from "../conversations/index.ts";
import type { Conversations } from "../conversations/index.ts";
import { readDeployment } from "../deployment/index.ts";
import { loadLoop } from "../loop/index.ts";
import type { Loop } from "../loop/index.ts";
import { createModels } from "../models/index.ts";
import type { Fetch, Models } from "../models/index.ts";
import { heldError } from "../notifications/index.ts";
import { createSkills } from "../skills/index.ts";
import type { Skills } from "../skills/index.ts";
import { readTools } from "../tools/index.ts";
import { createTurns } from "../turns/index.ts";
import type { Locks, Turns } from "../turns/index.ts";

export interface Assistant {
  readonly conversations: Conversations;
  readonly skills: Skills;
  readonly models: Models;
  readonly turns: Turns;
}

export interface AssistantOptions {
  // Loads the loop, which imports pi's bundle.
  readonly load?: () => Promise<Loop>;
  // The tab's Web Locks, the page's by default.
  readonly locks?: Locks | undefined;
  // How the assistant asks the base URL for its list of models, through the
  // page's fetch unless given.
  readonly fetch?: Fetch;
}

const opened = new WeakMap<CoreApi, Assistant>();

// Opens the assistant of the board that opens, and keeps it where
// assistantOf() finds it until the signal aborts. Where the conversations
// cannot open, as for a cap that nobody can read, it logs why.
export function openAssistant(core: CoreApi, signal: AbortSignal, options: AssistantOptions = {}): Assistant {
  const conversations = createConversations(core, signal);
  conversations.opened.catch((error: unknown) => {
    core.log("blockr.assistant").error(error instanceof Error ? error : new Error(String(error)));
  });
  const skills = createSkills(core, signal);
  const deployment = readDeployment(core);
  // The turns report why the options cannot be read, as each turn starts.
  deployment.catch(() => undefined);
  const callFailed = heldError(core, signal, "assistant_call_failed");
  const models = createModels(core, signal, { deployment, callFailed, fetch: options.fetch });
  const turns = createTurns(core, signal, {
    conversations,
    tools: readTools(core, skills),
    deployment,
    models,
    callFailed,
    load: options.load ?? loadLoop,
    ...("locks" in options ? { locks: options.locks } : {}),
  });

  const assistant = { conversations, skills, models, turns };
  opened.set(core, assistant);
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
