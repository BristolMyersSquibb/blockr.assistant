// The hooks through which the chat follows the board, the conversations, the
// turn that runs, the models offered, the visitor's key and the login, as
// React's useSyncExternalStore() follows a store. Each source gives the same
// object until it changes, so the chat draws again only then. The chat also
// reads what the deployment chose, once the assistant has read it.

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { Board, CoreApi } from "@blockr/core";
import type { Compaction } from "../compaction/index.ts";
import type { Conversations } from "../conversations/index.ts";
import type { Deployment } from "../deployment/index.ts";
import type { Login, LoginState } from "../login/index.ts";
import type { Models, Offered } from "../models/index.ts";
import type { Conversation, ConversationId } from "../state/index.ts";
import type { Running, Turns } from "../turns/index.ts";
import type { KeyState, VisitorKey } from "../visitor-key/index.ts";

export function useBoard(core: CoreApi): Board {
  const subscribe = useCallback((changed: () => void) => core.store.subscribe(changed), [core]);
  const board = useCallback(() => core.store.board(), [core]);
  return useSyncExternalStore(subscribe, board);
}

export function useConversations(conversations: Conversations): Readonly<Record<ConversationId, Conversation>> {
  const subscribe = useCallback((changed: () => void) => conversations.subscribe(changed), [conversations]);
  const all = useCallback(() => conversations.all(), [conversations]);
  return useSyncExternalStore(subscribe, all);
}

// Whether the model writes a summary of the conversation, false where none
// is open.
export function useCompacting(compaction: Compaction, conversation: ConversationId | undefined): boolean {
  const subscribe = useCallback((changed: () => void) => compaction.subscribe(changed), [compaction]);
  const writing = useCallback(() => conversation !== undefined && compaction.writing(conversation), [compaction, conversation]);
  return useSyncExternalStore(subscribe, writing);
}

export function useRunning(turns: Turns): Running | undefined {
  const subscribe = useCallback((changed: () => void) => turns.subscribe(changed), [turns]);
  const current = useCallback(() => turns.current(), [turns]);
  return useSyncExternalStore(subscribe, current);
}

// The models offered, as the last answer gave them, or undefined until the
// first answer comes.
export function useOffered(models: Models): Offered | undefined {
  const subscribe = useCallback((changed: () => void) => models.subscribe(changed), [models]);
  const current = useCallback(() => models.current(), [models]);
  return useSyncExternalStore(subscribe, current);
}

export function useVisitorKey(key: VisitorKey): KeyState {
  const subscribe = useCallback((changed: () => void) => key.subscribe(changed), [key]);
  const current = useCallback(() => key.current(), [key]);
  return useSyncExternalStore(subscribe, current);
}

export function useLogin(login: Login): LoginState {
  const subscribe = useCallback((changed: () => void) => login.subscribe(changed), [login]);
  const current = useCallback(() => login.current(), [login]);
  return useSyncExternalStore(subscribe, current);
}

// What the deployment chose, once the assistant has read it, or undefined
// until then and where its blockr options cannot be read, which the turns
// report.
export function useDeployment(deployment: Promise<Deployment>): Deployment | undefined {
  const [read, setRead] = useState<{ readonly of: Promise<Deployment>; readonly deployment: Deployment } | undefined>(undefined);
  useEffect(() => {
    let live = true;
    deployment.then(
      (given) => {
        if (live) setRead({ of: deployment, deployment: given });
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [deployment]);
  return read?.of === deployment ? read.deployment : undefined;
}
