// The conversations, through which the loop and the chat change a
// conversation, with the plugin's memory, and the cap on what the state keeps
// of each.

export { readCap } from "./cap.ts";
export { createConversations } from "./conversations.ts";
export type { Conversations, Kept, KeptFile, KeptImage } from "./conversations.ts";
