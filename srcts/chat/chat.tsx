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
//   the picks of the model and of the thinking level for the next
//   conversation that it adds, below.
// - The user's message goes to the conversations and starts a turn
//   (./send.ts). Sending waits while a turn runs in any conversation. While
//   the model writes a summary that the user asked for, a turn starts, and
//   its first call waits for the summary (../compaction).
// - The files that the user attaches go through assistant-ui's adapter for
//   attachments (./attach.ts). The user picks them with the message field's
//   button, drops them anywhere on the chat, or pastes them into the field.
//   A click on a file of a message that the user sent opens it large, in a
//   dialog (./files.tsx).
// - Where the deployment leaves the key to the visitor, the chat asks for the
//   visitor's own key in a field above the message field, and sends nothing
//   while it lacks one (./key.tsx). Where the base URL is OpenRouter's, the
//   field offers OpenRouter's login beside the key (../openrouter).
// - The notifications about the plugin show above the field for the
//   visitor's key and the message field (./notifications.tsx).
// - The stop button, which shows in the turn's conversation, and Escape
//   anywhere in the chat stop the turn, with a summary that the turn waits
//   for, while a summary that the user asked for goes on.
// - The footer, under the message field, opens the drawer of conversations,
//   shows the meter and offers the picks of the model and of the thinking
//   level (./footer.tsx, ./drawer.tsx).
// - The message field takes the slash commands, which typing / lists
//   (./slash.ts, ./composer.tsx), and the chat runs each, below.
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
// conversation's picks of the model and of the thinking level as the picks
// for the next conversation that it adds, so that the next conversation goes
// on with the last picks
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.1#who-picks-the-model).
// While no conversation is open, a pick in the footer changes those picks.
// The chat holds them for the board, so that a mount of the chat again, as
// when the dock redraws a view, holds them too.
//
// Deleting the conversation whose turn runs takes three steps
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#while-a-turn-runs):
// 1. The chat stops the turn, as the stop button does.
// 2. It waits until the turn ends, so that the turn writes what it finished
//    to the conversation, as after any stop.
// 3. It removes the conversation.
//
// The chat runs the slash commands in these ways
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#slash-commands):
// - The command /compact has the compaction write a summary of the open
//   conversation, whatever the rule says, where there is anything to
//   summarize (../compaction). While the model writes it, the transcript
//   says so at its end.
// - The command /clear opens none, as the drawer's New does.
// - The command /undo takes back the assistant's last undo step through
//   core.store.undo("assistant"), as the tool undo_edit does, with no call to
//   the model. The store gives that undo the origin assistant, so the chat
//   runs it inside the notes' asUser(), and the note of what others changed
//   counts it as the user's (../notes).
// - The command /redo applies again what the last undo took back through
//   core.store.redo(), as the frontend's Redo does, whoever took the step
//   back. The store gives a redo the origin user.
// - The command /name has R read the skill's text through the skills, and
//   then sends it with the line that the user typed, as a message that starts
//   a turn (./send.ts). Where R cannot read the skill, the skills raise
//   assistant_skills_failed, the chat sends nothing, and the message field
//   keeps the line.
// None of the built-in commands enters the transcript, since the board or the
// conversation shows what it did. Where /undo or /redo finds no step, or the
// store refuses the step, as a lock refuses it, the chat says so under the
// message field.

import { useCallback, useMemo, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent, ReactElement } from "react";
import type { AppendMessage } from "@assistant-ui/react";
import type { CoreApi } from "@blockr/core";
import type { Assistant } from "../assistant/index.ts";
import type { Picks } from "../conversations/index.ts";
import type { Notes } from "../notes/index.ts";
import { isNote, joinText } from "../state/index.ts";
import type { Conversation, ConversationId, Message, ThinkingLevel } from "../state/index.ts";
import { failuresOf, ORIGIN } from "../tools/index.ts";
import type { Turns } from "../turns/index.ts";
import { keyOf } from "../visitor-key/index.ts";
import { addFiles, attachedOf, attachmentAdapter } from "./attach.ts";
import { Composer } from "./composer.tsx";
import { ChatActionsContext, ChatStateContext } from "./context.ts";
import type { ChatActions, ChatState, KeyField } from "./context.ts";
import { Drawer } from "./drawer.tsx";
import { FileDialog } from "./files.tsx";
import type { OpenedFile } from "./files.tsx";
import { Footer } from "./footer.tsx";
import { useCompacting, useConversations, useOffered, useOpenRouterLogin, useResolved, useRunning, useSkills, useThinkingLevels, useVisitorKey } from "./hooks.ts";
import { KeyForm } from "./key.tsx";
import { libraries } from "./libraries.ts";
import { LinkDialog } from "./links.tsx";
import { shownOf, threadMessageOf, waitingCalls } from "./messages.ts";
import { Notifications } from "./notifications.tsx";
import { storeConversation, storedConversation } from "./open.ts";
import { sendMessage } from "./send.ts";
import type { Attached } from "./send.ts";
import { waits } from "./slash.ts";
import type { SlashCommand } from "./slash.ts";
import { Transcript } from "./transcript.tsx";

export function Chat({ core, assistant }: { readonly core: CoreApi; readonly assistant: Assistant }): ReactElement {
  const { AssistantRuntimeProvider, MessageNotSentError, useExternalStoreRuntime } = libraries();
  const { conversations, turns, models, compaction } = assistant;
  const all = useConversations(conversations);
  const running = useRunning(turns);
  const offered = useOffered(models);
  const levelsOf = useThinkingLevels(assistant.thinkingLevels);
  const deployment = useResolved(assistant.deployment);
  const visitorKey = useVisitorKey(assistant.key);
  const openRouterLogin = useOpenRouterLogin(assistant.openRouterLogin);
  const [chosen, setChosen] = useState(storedConversation);
  const [nextPicks, setNextPicks] = useNextPicks(assistant);
  const [drawer, setDrawer] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const [link, setLink] = useState<string | undefined>(undefined);
  const [file, setFile] = useState<OpenedFile | undefined>(undefined);
  const [filesNote, setFilesNote] = useState<string | undefined>(undefined);
  const [commandNote, setCommandNote] = useState<string | undefined>(undefined);
  const skills = useSkills(assistant.skills);
  const [dragging, setDragging] = useState(false);
  const attachments = useMemo(() => attachmentAdapter(), []);
  // The files that the user adds go to the message field one batch after
  // another, so that each file meets the bound with every file before it.
  const adding = useRef<Promise<void>>(Promise.resolve());

  // The open conversation, which the board may lack, as where another plugin
  // removed it, and the chat then shows the greeting.
  const open = chosen !== undefined && Object.hasOwn(all, chosen) ? chosen : undefined;
  const conversation = open === undefined ? undefined : all[open];
  const messages = conversation?.messages ?? NO_MESSAGES;
  const runsHere = running !== undefined && running.conversation === open;
  const compacting = useCompacting(compaction, open);

  // Where the deployment leaves the key to the visitor, the chat shows the
  // field for the key unless the key is given, and sends nothing while it
  // lacks a key. The field offers OpenRouter's login where the base URL is
  // OpenRouter's.
  const visitorAuthenticates = deployment?.credential.kind === "visitor";
  const noKey = visitorAuthenticates && keyOf(visitorKey) === undefined;
  const keyField = useMemo<KeyField | undefined>(() => {
    if (deployment === undefined || !visitorAuthenticates || visitorKey.kind === "given") return undefined;
    const offered = assistant.openRouterLogin.offers(deployment.baseUrl) ? openRouterLogin : undefined;
    return { state: visitorKey, host: new URL(deployment.baseUrl).host, openRouterLogin: offered };
  }, [assistant, deployment, openRouterLogin, visitorAuthenticates, visitorKey]);

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
    (text: string, files: readonly Attached[] = []): Promise<void> => {
      if ((text.trim() === "" && files.length === 0) || turns.current() !== undefined || noKey) return Promise.resolve();
      return sendMessage(assistant, open, text, files, nextPicks, openConversation);
    },
    [assistant, nextPicks, noKey, open, openConversation, turns],
  );

  const logError = useCallback(
    (error: unknown): void => {
      core.log("blockr.assistant").error(error instanceof Error ? error : new Error(String(error)));
    },
    [core],
  );

  // A pick of the model or of the thinking level sets the open
  // conversation's, which applies from its next turn, or the pick for the next
  // conversation where none is open.
  const pick = (model: string): void => {
    if (open === undefined) setNextPicks({ ...nextPicks, model });
    else conversations.setModel(open, model).catch(logError);
  };
  const pickLevel = (level: ThinkingLevel): void => {
    if (open === undefined) setNextPicks({ ...nextPicks, thinkingLevel: level });
    else conversations.setThinkingLevel(open, level).catch(logError);
  };

  // The drawer's New and /clear open the greeting, and take the picks of the
  // conversation that was open for the next one. The picks are read as the
  // user asks, so that the chat's actions change only as another conversation
  // opens, rather than with each message.
  const clear = useCallback((): void => {
    const held = open === undefined ? undefined : conversations.get(open);
    if (held !== undefined) setNextPicks(picksOf(held));
    openConversation(undefined);
  }, [conversations, open, openConversation, setNextPicks]);

  const startNew = (): void => {
    clear();
    setDrawer(false);
  };

  // Runs the slash command that the line names, unless it waits for the turn
  // that runs or for the visitor's key.
  const runCommand = useCallback(
    async (command: SlashCommand, line: string): Promise<boolean> => {
      if (waits(command, { running: turns.current() !== undefined, noKey })) return false;
      setCommandNote(undefined);
      if (command.kind === "skill") {
        const { name } = command.skill;
        let text: string;
        try {
          text = await assistant.skills.read(name);
        } catch {
          return false;
        }
        // A turn may have started while R read the skill, as from a
        // suggestion of the greeting, after which the message would go
        // unanswered.
        if (turns.current() !== undefined || assistant.signal.aborted) return false;
        try {
          await sendMessage(assistant, open, line, [], nextPicks, openConversation, { name, text });
        } catch (error) {
          logError(error);
          return false;
        }
        return true;
      }
      switch (command.name) {
        case "compact":
          if (open !== undefined) compaction.compact(open).catch(logError);
          return true;
        case "clear":
          clear();
          return true;
        case "undo":
          setCommandNote(undoAssistant(core, assistant.notes));
          return true;
        case "redo":
          setCommandNote(redo(core));
          return true;
      }
    },
    [assistant, clear, compaction, core, logError, nextPicks, noKey, open, openConversation, turns],
  );

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
    if (wasOpen) setNextPicks(removed === undefined ? NO_PICKS : picksOf(removed));
  };

  const runtime = useExternalStoreRuntime({
    messages: shown,
    convertMessage: threadMessageOf,
    isRunning: runsHere,
    isSendDisabled: running !== undefined || noKey,
    adapters: { attachments },
    onNew: async (message: AppendMessage) => {
      setFilesNote(undefined);
      setCommandNote(undefined);
      try {
        await send(textOf(message), attachedOf(message.attachments ?? []));
      } catch (error) {
        // The message did not enter the conversation, so assistant-ui puts its
        // text and its files back into the message field.
        core.log("blockr.assistant").error(error instanceof Error ? error : new Error(String(error)));
        throw new MessageNotSentError("The message did not enter the conversation.");
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
      runCommand,
      stop: () => {
        turns.stop();
      },
      openLink: setLink,
      addFiles: (files) => {
        const composer = runtime.thread.composer;
        const add = async (): Promise<void> => {
          setFilesNote(await addFiles(composer, files));
        };
        adding.current = adding.current.then(add).catch((error: unknown) => {
          core.log("blockr.assistant").error(error instanceof Error ? error : new Error(String(error)));
        });
      },
      openFile: setFile,
      giveKey: (key) => {
        assistant.key.give(key);
      },
      logInWithOpenRouter: () => {
        assistant.openRouterLogin.start();
      },
    }),
    [assistant, core, runCommand, runtime, send, turns],
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
      filesNote,
      skills,
      commandNote,
      keyField,
      noKey,
    }),
    [all, commandNote, compacting, filesNote, history, keyField, noKey, running, runsHere, skills, waiting],
  );

  const closeFile = useCallback(() => {
    setFile(undefined);
  }, []);

  const escape = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "Escape" || event.defaultPrevented || running === undefined) return;
    // Escape in the drawer closes the drawer alone, which takes it first, and
    // Escape in the dialog before a link or in that of a file closes the
    // dialog alone. Escape in a pick of the footer closes its list alone,
    // since the pick prevents the default.
    if (event.target instanceof Element && event.target.closest("dialog") !== null) return;
    event.preventDefault();
    turns.stop();
  };

  // Files dropped anywhere on the chat go to the message field.
  const dragOver = (event: DragEvent<HTMLDivElement>): void => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };
  const dragLeave = (event: DragEvent<HTMLDivElement>): void => {
    if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false);
  };
  const drop = (event: DragEvent<HTMLDivElement>): void => {
    setDragging(false);
    if (event.dataTransfer.files.length === 0) return;
    event.preventDefault();
    actions.addFiles([...event.dataTransfer.files]);
  };

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatActionsContext value={actions}>
        <ChatStateContext value={state}>
          <div
            className="blockr-assistant-chat"
            data-dragging={dragging ? "" : undefined}
            onKeyDown={escape}
            onDragOver={dragOver}
            onDragLeave={dragLeave}
            onDrop={drop}
          >
            <div className="blockr-assistant-chat-main" inert={drawer}>
              <Transcript />
              <Notifications core={core} />
              <KeyForm />
              <Composer />
              <Footer
                usage={conversation?.usage}
                picks={conversation === undefined ? nextPicks : picksOf(conversation)}
                offered={offered}
                levelsOf={levelsOf}
                onPick={pick}
                onPickLevel={pickLevel}
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
            <FileDialog file={file} onClose={closeFile} />
          </div>
        </ChatStateContext>
      </ChatActionsContext>
    </AssistantRuntimeProvider>
  );
}

const NO_MESSAGES: readonly Message[] = [];

// Takes back the assistant's last undo step, as /undo asks, and gives what the
// chat says of it, if anything.
function undoAssistant(core: CoreApi, notes: Pick<Notes, "asUser">): string | undefined {
  if (!core.store.canUndo(ORIGIN)) return "The assistant has no edit left to take back.";
  try {
    notes.asUser(() => {
      core.store.undo(ORIGIN);
    });
    return undefined;
  } catch (error) {
    return `The board refused to take back the assistant's last edit: ${failuresOf(error).join(" ")}`;
  }
}

// Applies again what the last undo took back, as /redo asks, and gives what
// the chat says of it, if anything.
function redo(core: CoreApi): string | undefined {
  if (!core.store.canRedo()) return "No undo has taken back an edit to apply again.";
  try {
    core.store.redo();
    return undefined;
  } catch (error) {
    return `The board refused to apply the edit again: ${failuresOf(error).join(" ")}`;
  }
}

// The picks of the next conversation that the chat adds while no conversation
// is open, by the assistant of each board, so that a mount of the chat again
// holds them while the board stays open. They are the default model and no
// thinking level until the user picks.
const heldPicks = new WeakMap<Assistant, Picks>();

const NO_PICKS: Picks = { model: null };

function useNextPicks(assistant: Assistant): readonly [Picks, (picks: Picks) => void] {
  const [nextPicks, setPicks] = useState(() => heldPicks.get(assistant) ?? NO_PICKS);
  const setNextPicks = useCallback(
    (picks: Picks) => {
      heldPicks.set(assistant, picks);
      setPicks(picks);
    },
    [assistant],
  );
  return [nextPicks, setNextPicks];
}

// The picks of a conversation.
function picksOf(conversation: Conversation): Picks {
  return { model: conversation.model, thinkingLevel: conversation.thinking_level };
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
