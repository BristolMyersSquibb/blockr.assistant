// What the chat's components share, which the chat gives them through React's
// context, since assistant-ui draws each message and so passes no props of
// the chat's.
// The actions change only as another conversation opens, while the state
// changes with every change of the turn, as each token of a reply streams.
// So a component that only acts, as a link does, takes the actions alone and
// draws again only as another conversation opens.

import { createContext, useContext } from "react";
import type { CoreApi } from "@blockr/core";
import type { Running } from "../turns/index.ts";
import type { KeyState } from "../visitor-key/index.ts";
import type { OpenedFile } from "./files.tsx";

export interface ChatActions {
  readonly core: CoreApi;
  // Sends the text as the user's message.
  readonly send: (text: string) => void;
  // Stops the turn that runs.
  readonly stop: () => void;
  // Asks before a link opens another site.
  readonly openLink: (url: string) => void;
  // Adds the files to the message field, in order, leaving out those that the
  // field does not take or that pass the bound.
  readonly addFiles: (files: readonly File[]) => void;
  // Opens a file of a message that the user sent large, in a dialog.
  readonly openFile: (file: OpenedFile) => void;
  // Gives the visitor's own key, which the calls carry from then on.
  readonly giveKey: (key: string) => void;
}

// What the field for the visitor's key shows: why the chat asks for a key,
// and the host of the base URL that the key is for, such as api.openai.com.
export interface KeyField {
  readonly state: Exclude<KeyState, { readonly kind: "given" }>;
  readonly host: string;
}

export interface ChatState {
  // The turn that runs on the board, in whichever conversation, or undefined.
  readonly running: Running | undefined;
  // Whether that turn runs in the open conversation.
  readonly runsHere: boolean;
  // Whether the model writes a summary of the open conversation.
  readonly compacting: boolean;
  // The tool calls that the turn waits for, which show as running. A call of
  // the open conversation that has no result and is not among them shows that
  // the turn ended before it returned.
  readonly waiting: ReadonlySet<string>;
  // The user's earlier messages in the open conversation, oldest first, as
  // the user typed them.
  readonly history: readonly string[];
  // The title of a conversation, or undefined for one that the board lacks.
  readonly titleOf: (conversation: string) => string | undefined;
  // What the chat says of the files that it left out of the message field as
  // the user last added files, if any.
  readonly filesNote: string | undefined;
  // What the field for the visitor's key shows, where the chat asks for a
  // key, or undefined where it shows no such field.
  readonly keyField: KeyField | undefined;
  // Whether the chat lacks the visitor's key, which it then asks for, and so
  // sends nothing.
  readonly noKey: boolean;
}

export const ChatActionsContext = createContext<ChatActions | undefined>(undefined);

export const ChatStateContext = createContext<ChatState | undefined>(undefined);

export function useChatActions(): ChatActions {
  const actions = useContext(ChatActionsContext);
  if (actions === undefined) throw new Error("The chat's components draw only inside the chat.");
  return actions;
}

export function useChat(): ChatState {
  const state = useContext(ChatStateContext);
  if (state === undefined) throw new Error("The chat's components draw only inside the chat.");
  return state;
}
