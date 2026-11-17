// The titles of the conversations, which model calls of the plugin's own
// write, as shinychat's titles come today
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.3#commands).
// The class's start sets them up as each board opens, and they last until the
// next board opens, as the signal aborts.
//
// A conversation takes its title in these steps:
// 1. A turn ends in a conversation that is still titled "New conversation"
//    and holds a reply of the model. So a first turn that failed before the
//    model replied leaves the title to the next turn that the model answers.
// 2. The plugin asks the model that the conversation talks to for a title,
//    once for each conversation while the board stays open. The call runs
//    beside the turns rather than as one, so that the next turn may start
//    while the model writes the title
//    (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#slash-commands).
// 3. The call sends shinychat's prompt for titles, with the exchange that the
//    model answered first: the message that the user sent, and the model's
//    first reply that holds text, up to 500 characters of each, as shinychat
//    sends them (R/chat_history_title.R at 6cb1417).
// 4. The plugin adds the call's input and output tokens to the conversation's
//    usage, so that the meter counts them. It leaves the usage's last as it
//    was, since compaction reads the last as the size of the conversation.
// 5. It gives the conversation the title through
//    blockr.assistant-rename_conversation only where the title is still
//    "New conversation", so that a rename that the user made meanwhile
//    stands.
//
// A title that fails, as where the call fails or the model gives no text,
// leaves the conversation's title as it was, for the user to rename, with no
// notification. The plugin logs why.

import type { CoreApi } from "@blockr/core";
import type { Conversations } from "../conversations/index.ts";
import type { Deployment } from "../deployment/index.ts";
import type { Loop } from "../loop/index.ts";
import type { ModelSettingsFile } from "../model-settings/index.ts";
import { talksTo } from "../models/index.ts";
import type { Models } from "../models/index.ts";
import { isNote, NEW_CONVERSATION, textOf } from "../state/index.ts";
import type { ConversationId, Message } from "../state/index.ts";
import { connectionOf } from "../turns/index.ts";
import type { Turns } from "../turns/index.ts";

// What shinychat tells the model that titles a conversation
// (R/chat_history_title.R#L1-L5 at 6cb1417).
export const TITLE_PROMPT =
  "You title chat conversations. Reply with ONLY a title for the conversation excerpt the user provides: at most 6 words, no quotes, no trailing punctuation.";

// The most characters of each message that the call sends, and of a title,
// as shinychat has them.
const EXCERPT = 500;
const LONGEST = 80;

export interface TitlesOptions {
  readonly conversations: Conversations;
  readonly turns: Pick<Turns, "current" | "subscribe">;
  // What the deployment chose, where the call goes as a turn's calls go.
  readonly deployment: Promise<Deployment>;
  readonly models: Pick<Models, "offered">;
  readonly settings: Pick<ModelSettingsFile, "checked">;
  // Loads the loop, which a turn has loaded already where the model replied.
  readonly load: () => Promise<Loop>;
}

// Titles each conversation of the open board once its first exchange that
// the model answered ends.
export function titleConversations(core: Pick<CoreApi, "log">, signal: AbortSignal, options: TitlesOptions): void {
  const { conversations, turns } = options;
  // The conversations whose titles the plugin asked for while the board stays
  // open, which it asks for no more.
  const asked = new Set<ConversationId>();

  // Whether the board is closed, as the next board opened. A function, since
  // the signal aborts while a title awaits.
  function closed(): boolean {
    return signal.aborted;
  }

  // A turn ends where the turns go from one that runs to none, since a turn
  // starts only while none runs.
  let running = turns.current()?.conversation;
  const stop = turns.subscribe(() => {
    const ended = running;
    running = turns.current()?.conversation;
    if (ended !== undefined && running === undefined) afterTurn(ended);
  });
  signal.addEventListener("abort", stop, { once: true });

  function afterTurn(conversation: ConversationId): void {
    if (closed() || asked.has(conversation)) return;
    const held = conversations.get(conversation);
    if (held?.title !== NEW_CONVERSATION) return;
    const excerpt = excerptOf(held.messages);
    if (excerpt === undefined) return;
    asked.add(conversation);
    title(conversation, excerpt).catch((error: unknown) => {
      if (closed()) return;
      core.log("blockr.assistant").warn(`The assistant could not title the conversation "${conversation}": ${messageOf(error)}`);
    });
  }

  async function title(conversation: ConversationId, excerpt: string): Promise<void> {
    const deployment = await options.deployment;
    const offered = await options.models.offered();
    const model = talksTo(offered, conversations.get(conversation)?.model ?? null);
    if (model === undefined) throw new Error(offered.failure ?? "The app offers no model.");
    const loop = await options.load();
    const settings = await options.settings.checked((id) => loop.inCatalog(id));
    if (closed()) return;

    const reply = await loop.callModel({
      connection: connectionOf(deployment),
      model,
      settings: settings.get(model),
      listed: offered.settings?.get(model),
      systemPrompt: TITLE_PROMPT,
      text: excerpt,
      signal,
    });
    if (closed() || conversations.get(conversation) === undefined) return;

    const { input, output } = reply.usage;
    if (input > 0 || output > 0) await conversations.addUsage(conversation, input, output);
    if (reply.failure !== undefined) throw new Error(`The call to the model failed: ${reply.failure}`);
    const written = titleOf(reply.text);
    if (written === undefined) throw new Error("The model gave no title.");
    if (closed() || conversations.get(conversation)?.title !== NEW_CONVERSATION) return;
    await conversations.renameConversation(conversation, written);
  }
}

// What the call sends of the exchange that the model answered first: the
// message that the user sent, as the user typed it, and the model's first
// reply that holds text, up to 500 characters of each, each after the role
// that shinychat names it by. It is undefined where the model has not
// replied.
export function excerptOf(messages: readonly Message[]): string | undefined {
  const first = messages.findIndex((message) => message.role === "assistant");
  if (first < 0) return undefined;
  const asked = messages
    .slice(0, first)
    .filter((message) => message.role === "user" && !isNote(message))
    .at(-1);
  const answer = messages
    .slice(first)
    .filter((message) => message.role === "assistant")
    .map((message) => textOf(message).trim())
    .find((text) => text !== "");
  const lines = [
    ...(asked === undefined ? [] : [`user: ${textOf(asked).trim().slice(0, EXCERPT)}`]),
    ...(answer === undefined ? [] : [`assistant: ${answer.slice(0, EXCERPT)}`]),
  ];
  return lines.length === 0 ? undefined : lines.join("\n\n");
}

// The title that the model wrote, with its white space collapsed, and cut to
// 80 characters, as shinychat cuts it, or undefined where it holds none.
export function titleOf(text: string): string | undefined {
  const title = text.trim().split(/\s+/).join(" ");
  if (title === "") return undefined;
  return title.length > LONGEST ? `${title.slice(0, LONGEST - 3)}...` : title;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
