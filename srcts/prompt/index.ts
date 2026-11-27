// What the plugin tells the model with each call: the system prompt, which
// holds the template of the open board, and the message of the app's, which
// holds the board, with what the app's plugins write about their state, and
// what the user has on screen. The notes of what others
// changed list words in a sentence as these do.

export { createDescribe } from "./describe.ts";
export type { PluginLines } from "./describe.ts";
export { createPrompt } from "./prompt.ts";
export type { Prompt, PromptOptions } from "./prompt.ts";
export { createTemplate, fillTemplate, listed, SECTIONS, TEMPLATE } from "./template.ts";
export type { Template } from "./template.ts";
