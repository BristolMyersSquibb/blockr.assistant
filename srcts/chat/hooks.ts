// The hooks through which the chat follows the board, the conversations and
// the turn that runs, as React's useSyncExternalStore() follows a store. Each
// source gives the same object until it changes, so the chat draws again only
// then.

import { useCallback, useSyncExternalStore } from "react";
import type { Board, CoreApi } from "@blockr/core";
import type { Conversations } from "../conversations/index.ts";
import type { Conversation, ConversationId } from "../state/index.ts";
import type { Running, Turns } from "../turns/index.ts";

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

export function useRunning(turns: Turns): Running | undefined {
  const subscribe = useCallback((changed: () => void) => turns.subscribe(changed), [turns]);
  const current = useCallback(() => turns.current(), [turns]);
  return useSyncExternalStore(subscribe, current);
}
