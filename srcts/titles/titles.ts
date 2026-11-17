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
//    once for each conversation while the board stays open. It prepares the
//    call as a turn prepares its calls (../turns), and the loop makes it as a
//    model call of the plugin's own, as it makes the call that writes a
//    summary (../loop). The call runs beside the turns rather than as one, so
//    that the next turn may start while the model writes the title
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
import { isNote, joinText, NEW_CONVERSATION } from "../state/index.ts";
import type { ConversationId, Message } from "../state/index.ts";
import { messageOf, prepareCall } from "../turns/index.ts";
import type { CallOptions, Turns } from "../turns/index.ts";

// What shinychat tells the model that titles a conversation
// (R/chat_history_title.R#L1-L5 at 6cb1417).
export const TITLE_PROMPT =
  "You title chat conversations. Reply with ONLY a title for the conversation excerpt the user provides: at most 6 words, no quotes, no trailing punctuation.";

// The most characters of each message that the call sends, and of a title,
// as shinychat has them.
const EXCERPT = 500;
const LONGEST = 80;

// What the titles read, beside what preparing a call reads, as the turns and
// compaction read it.
export interface TitlesOptions extends CallOptions {
  readonly conversations: Conversations;
  readonly turns: Pick<Turns, "current" | "subscribe">;
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
    const excerpt = buildExcerpt(held.messages);
    if (excerpt === undefined) return;
    asked.add(conversation);
    title(conversation, excerpt).catch((error: unknown) => {
      if (closed()) return;
      core.log("blockr.assistant").warn(`The assistant could not title the conversation "${conversation}": ${messageOf(error)}`);
    });
  }

  async function title(conversation: ConversationId, excerpt: string): Promise<void> {
    const prepared = await prepareCall(options, () => conversations.get(conversation)?.model ?? null, closed);
    if (prepared.kind === "stopped") return;
    if (prepared.kind === "failed") throw new Error(prepared.why);

    const reply = await prepared.loop.callModel({ ...prepared.model, systemPrompt: TITLE_PROMPT, prompt: excerpt, signal });
    if (closed() || conversations.get(conversation) === undefined) return;

    const { input, output } = reply.usage;
    if (input > 0 || output > 0) await conversations.addUsage(conversation, input, output);
    if (reply.failure !== undefined) throw new Error(`The call to the model failed: ${reply.failure}`);
    const written = normalizeTitle(reply.text ?? "");
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
export function buildExcerpt(messages: readonly Message[]): string | undefined {
  const first = messages.findIndex((message) => message.role === "assistant");
  if (first < 0) return undefined;
  const asked = messages
    .slice(0, first)
    .filter((message) => message.role === "user" && !isNote(message))
    .at(-1);
  const answer = messages
    .slice(first)
    .filter((message) => message.role === "assistant")
    .map((message) => joinText(message).trim())
    .find((text) => text !== "");
  const lines = [
    ...(asked === undefined ? [] : [`user: ${joinText(asked).trim().slice(0, EXCERPT)}`]),
    ...(answer === undefined ? [] : [`assistant: ${answer.slice(0, EXCERPT)}`]),
  ];
  return lines.length === 0 ? undefined : lines.join("\n\n");
}

// The title that the model wrote, with its white space collapsed, and cut to
// 80 characters, as shinychat cuts it, or undefined where it holds none.
export function normalizeTitle(text: string): string | undefined {
  const title = text.trim().split(/\s+/).join(" ");
  if (title === "") return undefined;
  return title.length > LONGEST ? `${title.slice(0, LONGEST - 3)}...` : title;
}
