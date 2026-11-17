// The parts of assistant-ui, of its Markdown and of remark-gfm that the chat
// draws with. The build bundles them, minified, into a file of their own,
// chat-<hash>.js, as it bundles pi's parts into pi-<hash>.js. The chat
// imports this file as it first mounts (./libraries.ts), so the page fetches
// the bundle only once a frontend shows the chat.
// Only the files of the chat import these packages, so that a move away from
// assistant-ui rewrites the chat alone.

export {
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  TextMessagePartProvider,
  ThreadPrimitive,
  // The chat calls useAui() without args, which gives the client of the
  // nearest provider. Only its overload that takes args is deprecated.
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  useAui,
  useAuiState,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
export { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
export { default as remarkGfm } from "remark-gfm";
