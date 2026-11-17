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
//   which local storage keeps (./open.ts), and the text typed and not sent,
//   which assistant-ui's message field holds while the chat is mounted.
// - The user's message goes to the conversations and starts a turn
//   (./send.ts). Sending waits while a turn runs in any conversation.
// - The stop button, which shows in the turn's conversation, and Escape
//   anywhere in the chat stop the turn.
// What assistant-ui draws comes from ./messages.ts, ./transcript.tsx and
// ./composer.tsx.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import type { AppendMessage } from "@assistant-ui/react";
import type { CoreApi } from "@blockr/core";
import type { Assistant } from "../assistant/index.ts";
import { isNote } from "../state/index.ts";
import type { Message } from "../state/index.ts";
import { Composer } from "./composer.tsx";
import { ChatActionsContext, ChatStateContext } from "./context.ts";
import type { ChatActions, ChatState } from "./context.ts";
import { useConversations, useRunning } from "./hooks.ts";
import { libraries } from "./libraries.ts";
import { LinkDialog } from "./links.tsx";
import { shownOf, threadMessageOf, waitingCalls } from "./messages.ts";
import { storeConversation, storedConversation } from "./open.ts";
import { sendMessage } from "./send.ts";
import { Transcript } from "./transcript.tsx";

export function Chat({ core, assistant }: { readonly core: CoreApi; readonly assistant: Assistant }): ReactElement {
  const { AssistantRuntimeProvider, useExternalStoreRuntime } = libraries();
  const { conversations, turns } = assistant;
  const all = useConversations(conversations);
  const running = useRunning(turns);
  const [chosen, setChosen] = useState(storedConversation);
  const [link, setLink] = useState<string | undefined>(undefined);

  // The open conversation, which the board may lack, as where another plugin
  // removed it, and the chat then shows the greeting.
  const open = chosen !== undefined && Object.hasOwn(all, chosen) ? chosen : undefined;
  const conversation = open === undefined ? undefined : all[open];
  const messages = conversation?.messages ?? NO_MESSAGES;
  const runsHere = running !== undefined && running.conversation === open;

  // Assistant-ui keeps what it converted of each item that the chat gives it
  // again, so a long conversation converts only what changed as a reply
  // streams (./messages.ts).
  const shown = shownOf(messages, runsHere ? running : undefined, (message) => (open === undefined ? undefined : conversations.kept(open, message)));

  const send = useCallback(
    (text: string): Promise<void> => {
      if (text.trim() === "" || turns.current() !== undefined) return Promise.resolve();
      return sendMessage(assistant, open, text, (added) => {
        storeConversation(added);
        setChosen(added);
      });
    },
    [assistant, open, turns],
  );

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

  // The chat is a view of the conversation that it shows, while its element
  // shows, so that a turn that fails there leaves the failure to the chat
  // rather than raise a notification of it as well (../turns).
  const element = useRef<HTMLDivElement>(null);
  const showing = useRef(open);
  useLayoutEffect(() => {
    showing.current = open;
  });
  useEffect(() => turns.addView((id) => id === showing.current && visible(element.current)), [turns]);

  const history = useMemo(() => messages.filter((message) => message.role === "user" && !isNote(message)).map(typedText).filter((text) => text !== ""), [messages]);
  const waiting = useMemo(() => waitingCalls(messages, runsHere ? running : undefined), [messages, running, runsHere]);
  const state = useMemo<ChatState>(
    () => ({
      running,
      runsHere,
      waiting,
      history,
      titleOf: (id) => (Object.hasOwn(all, id) ? all[id]?.title : undefined),
    }),
    [all, history, running, runsHere, waiting],
  );

  const escape = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "Escape" || event.defaultPrevented || running === undefined) return;
    // Escape in the dialog before a link closes the dialog alone.
    if (event.target instanceof Element && event.target.closest("dialog") !== null) return;
    event.preventDefault();
    turns.stop();
  };

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatActionsContext value={actions}>
        <ChatStateContext value={state}>
          <div ref={element} className="blockr-assistant-chat" onKeyDown={escape}>
            <Transcript />
            <Composer />
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

// The text of a message that the message field sends.
function textOf(message: AppendMessage): string {
  return message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");
}

// The text of a message that the user sent, as the user typed it, without the
// text of a skill that a slash command carries.
function typedText(message: Message): string {
  return message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");
}

// Whether the element shows. A frontend may keep the chat mounted out of
// sight, as in a tab of the dock that does not show, where the user sees
// nothing that the chat draws.
function visible(element: HTMLElement | null): boolean {
  return element?.checkVisibility({ visibilityProperty: true }) ?? false;
}
