// What the plugin tells the model with each call: the system prompt, which
// holds the template of the open board, and the message of the app's, which
// holds the board and what the user has on screen.

export { createPrompt } from "./prompt.ts";
export type { Prompt, PromptOptions } from "./prompt.ts";
export { createTemplate, fillTemplate, SECTIONS, TEMPLATE } from "./template.ts";
export type { Template } from "./template.ts";
