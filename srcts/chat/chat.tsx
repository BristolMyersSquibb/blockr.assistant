// The chat of the open board, on assistant-ui's runtime over a store of the
// app's own, its ExternalStoreRuntime, which here displays the assistant's
// conversations (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-panel):
// - The chat follows the conversations, which hold the state's messages after
//   those of the plugin's memory, so that a conversation shows the same
//   whichever command changed it last, and where chat_save_turns is 0 shows
//   from the memory alone.
// - It follows the turn that runs, from the class's start, whose reply streams
//   in the plugin's memory.
// - It keeps only what is the screen's alone: which conversation is open,
//   which local storage keeps (./open.ts), the text typed and not sent,
//   which assistant-ui's message field holds while the chat is mounted, and
//   the pick of the model for the next conversation that it adds, below.
// - The user's message goes to the conversations and starts a turn
//   (./send.ts). Sending waits while a turn runs in any conversation. While
//   the model writes a summary that the user asked for, a turn starts, and
//   its first call waits for the summary (../compaction).
// - The stop button, which shows in the turn's conversation, and Escape
//   anywhere in the chat stop the turn, with a summary that the turn waits
//   for, while a summary that the user asked for goes on.
// - The footer, under the message field, opens the drawer of conversations,
//   shows the meter and offers the pick of the model (./footer.tsx,
//   ./drawer.tsx).
// What assistant-ui draws comes from ./messages.ts, ./transcript.tsx and
// ./composer.tsx.
//
// The chat opens a conversation, or none, which shows the greeting, in these
// ways (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#conversations):
// - The drawer opens the conversation that the user clicks.
// - The drawer's New opens none, so that the first message adds the
//   conversation, rather than an empty conversation that would stay in the
//   drawer, as today's drawer lists no conversation before its first reply.
// - Deleting the open conversation opens none.
// Each time it goes from a conversation to none, the chat takes that
// conversation's pick of the model as the pick for the next conversation that
// it adds, so that the next conversation goes on with the last pick
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.1#who-picks-the-model).
// While no conversation is open, a pick in the footer changes that pick. The
// chat holds it for the board, so that a mount of the chat again, as when the
// dock redraws a view, holds it too.
//
// Deleting the conversation whose turn runs takes three steps
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#while-a-turn-runs):
// 1. The chat stops the turn, as the stop button does.
// 2. It waits until the turn ends, so that the turn writes what it finished
//    to the conversation, as after any stop.
// 3. It removes the conversation.

import { useCallback, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import type { AppendMessage } from "@assistant-ui/react";
import type { CoreApi } from "@blockr/core";
import type { Assistant } from "../assistant/index.ts";
import { isNote, joinText } from "../state/index.ts";
import type { ConversationId, Message } from "../state/index.ts";
import type { Turns } from "../turns/index.ts";
import { Composer } from "./composer.tsx";
import { ChatActionsContext, ChatStateContext } from "./context.ts";
import type { ChatActions, ChatState } from "./context.ts";
import { Drawer } from "./drawer.tsx";
import { Footer } from "./footer.tsx";
import { useCompacting, useConversations, useOffered, useRunning } from "./hooks.ts";
import { libraries } from "./libraries.ts";
import { LinkDialog } from "./links.tsx";
import { shownOf, threadMessageOf, waitingCalls } from "./messages.ts";
import { storeConversation, storedConversation } from "./open.ts";
import { sendMessage } from "./send.ts";
import { Transcript } from "./transcript.tsx";

export function Chat({ core, assistant }: { readonly core: CoreApi; readonly assistant: Assistant }): ReactElement {
  const { AssistantRuntimeProvider, useExternalStoreRuntime } = libraries();
  const { conversations, turns, models, compaction } = assistant;
  const all = useConversations(conversations);
  const running = useRunning(turns);
  const offered = useOffered(models);
  const [chosen, setChosen] = useState(storedConversation);
  const [nextPick, setNextPick] = useNextPick(assistant);
  const [drawer, setDrawer] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const [link, setLink] = useState<string | undefined>(undefined);

  // The open conversation, which the board may lack, as where another plugin
  // removed it, and the chat then shows the greeting.
  const open = chosen !== undefined && Object.hasOwn(all, chosen) ? chosen : undefined;
  const conversation = open === undefined ? undefined : all[open];
  const messages = conversation?.messages ?? NO_MESSAGES;
  const runsHere = running !== undefined && running.conversation === open;
  const compacting = useCompacting(compaction, open);

  // Assistant-ui keeps what it converted of each item that the chat gives it
  // again, so a long conversation converts only what changed as a reply
  // streams (./messages.ts).
  const shown = shownOf(messages, runsHere ? running : undefined, (message) => (open === undefined ? undefined : conversations.kept(open, message)));

  // Opens the conversation, or none, which shows the greeting.
  const openConversation = useCallback((id: ConversationId | undefined) => {
    storeConversation(id);
    setChosen(id);
  }, []);

  const send = useCallback(
    (text: string): Promise<void> => {
      if (text.trim() === "" || turns.current() !== undefined) return Promise.resolve();
      return sendMessage(assistant, open, text, nextPick, openConversation);
    },
    [assistant, nextPick, open, openConversation, turns],
  );

  const logError = useCallback(
    (error: unknown): void => {
      core.log("blockr.assistant").error(error instanceof Error ? error : new Error(String(error)));
    },
    [core],
  );

  // A pick of the model sets the open conversation's, which applies from its
  // next turn, or the pick for the next conversation where none is open.
  const pick = (model: string): void => {
    if (open === undefined) setNextPick(model);
    else conversations.setModel(open, model).catch(logError);
  };

  // The drawer's New opens the greeting, and takes the pick of the conversation
  // that was open for the next one.
  const startNew = (): void => {
    if (conversation !== undefined) setNextPick(conversation.model);
    openConversation(undefined);
    setDrawer(false);
  };

  const remove = async (id: ConversationId): Promise<void> => {
    const removed = all[id];
    const wasOpen = id === open;
    if (turns.current()?.conversation === id) {
      turns.stop();
      await turnEnds(turns, id);
    }
    if (assistant.signal.aborted) return;
    try {
      await conversations.removeConversation(id);
    } catch (error) {
      logError(error);
      throw error;
    }
    if (wasOpen) setNextPick(removed?.model ?? null);
  };

  const runtime = useExternalStoreRuntime({
    messages: shown,
    convertMessage: threadMessageOf,
    isRunning: runsHere,
    isSendDisabled: running !== undefined,
    onNew: async (message: AppendMessage) => {
      const text = textOf(message);
      try {
        await send(text);
      } catch (error) {
        // The message did not enter the conversation, so it goes back into the
        // message field.
        core.log("blockr.assistant").error(error instanceof Error ? error : new Error(String(error)));
        runtime.thread.composer.setText(text);
      }
    },
    onCancel: () => {
      turns.stop();
      return Promise.resolve();
    },
  });

  const actions = useMemo<ChatActions>(
    () => ({
      core,
      send: (text) => {
        send(text).catch((error: unknown) => {
          core.log("blockr.assistant").error(error instanceof Error ? error : new Error(String(error)));
        });
      },
      stop: () => {
        turns.stop();
      },
      openLink: setLink,
    }),
    [core, send, turns],
  );

  const history = useMemo(() => messages.filter((message) => message.role === "user" && !isNote(message)).map(joinText).filter((text) => text !== ""), [messages]);
  const waiting = useMemo(() => waitingCalls(messages, runsHere ? running : undefined), [messages, running, runsHere]);
  const state = useMemo<ChatState>(
    () => ({
      running,
      runsHere,
      compacting,
      waiting,
      history,
      titleOf: (id) => (Object.hasOwn(all, id) ? all[id]?.title : undefined),
    }),
    [all, compacting, history, running, runsHere, waiting],
  );

  const escape = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "Escape" || event.defaultPrevented || running === undefined) return;
    // Escape in the drawer closes the drawer alone, which takes it first,
    // Escape in the dialog before a link closes the dialog alone, and Escape
    // in the pick of the model closes its list.
    if (event.target instanceof Element && event.target.closest("dialog, select") !== null) return;
    event.preventDefault();
    turns.stop();
  };

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatActionsContext value={actions}>
        <ChatStateContext value={state}>
          <div className="blockr-assistant-chat" onKeyDown={escape}>
            <div className="blockr-assistant-chat-main" inert={drawer}>
              <Transcript />
              <Composer />
              <Footer
                usage={conversation?.usage}
                pick={conversation === undefined ? nextPick : conversation.model}
                offered={offered}
                onPick={pick}
                opener={opener}
                onDrawer={() => {
                  setDrawer(true);
                }}
              />
            </div>
            {drawer ? (
              <Drawer
                onClose={() => {
                  setDrawer(false);
                }}
                opener={opener}
                conversations={all}
                open={open}
                running={running?.conversation}
                onSelect={(id) => {
                  openConversation(id);
                  setDrawer(false);
                }}
                onNew={startNew}
                onRename={(id, title) => {
                  conversations.renameConversation(id, title).catch(logError);
                }}
                onDelete={remove}
              />
            ) : null}
            <LinkDialog
              url={link}
              onClose={() => {
                setLink(undefined);
              }}
            />
          </div>
        </ChatStateContext>
      </ChatActionsContext>
    </AssistantRuntimeProvider>
  );
}

const NO_MESSAGES: readonly Message[] = [];

// The pick of the model for the next conversation that the chat adds while no
// conversation is open, by the assistant of each board, so that a mount of
// the chat again holds it while the board stays open. It is null, for the
// default, until the user picks.
const nextPicks = new WeakMap<Assistant, string | null>();

function useNextPick(assistant: Assistant): readonly [string | null, (pick: string | null) => void] {
  const [nextPick, setPick] = useState(() => nextPicks.get(assistant) ?? null);
  const setNextPick = useCallback(
    (pick: string | null) => {
      nextPicks.set(assistant, pick);
      setPick(pick);
    },
    [assistant],
  );
  return [nextPick, setNextPick];
}

// Resolves once no turn runs in the conversation, as once the turn that the
// chat stopped has ended.
function turnEnds(turns: Pick<Turns, "current" | "subscribe">, conversation: ConversationId): Promise<void> {
  return new Promise((resolve) => {
    if (turns.current()?.conversation !== conversation) {
      resolve();
      return;
    }
    const stop = turns.subscribe(() => {
      if (turns.current()?.conversation === conversation) return;
      stop();
      resolve();
    });
  });
}

// The text of a message that the message field sends.
function textOf(message: AppendMessage): string {
  return message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");
}


