// What the model reads of a failure, as the result of the tool that met it
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.2#how-failures-reach-the-model):
// - A block, a stack, a block class, a command, a plugin or a skill that the
//   tool names and the board or the app lacks is not there, and the result
//   names the tool that lists those that are.
// - A request whose blocks are not ready gives the status with which core
//   rejected it, of each block that is not.
// - A request that R lost to a new session says so, since core sends it no
//   more.
// - An error in R, such as in the model's own code, gives R's message,
//   followed by the warnings and messages of R's reply (./conditions.ts).

import type { BlockStatus } from "@blockr/core";
import { failureMessage, isRequestError, isSessionEnded } from "../requests/index.ts";

// The text of the result of a tool that failed with `error`.
export function failureText(error: unknown): string {
  if (isSessionEnded(error)) {
    return "R's session ended before R answered, so the request was lost, and core does not send it to the new session. Call the tool again to send it there.";
  }
  if (isRequestError(error) && error.blocks.length > 0) return notReady(error.blocks);
  return failureMessage(error);
}

// That the request did not go to R, with each block that is not ready, its
// status, and why it is not: the error of a failed block, or why the
// transport could not send its evaluation, and the reason of one that is
// invalid or waiting.
function notReady(blocks: readonly { readonly block: string; readonly status: BlockStatus }[]): string {
  return [
    "The request did not go to R, since a block that it reads is not ready:",
    ...blocks.map(({ block, status }) => {
      const why = [status.reason, status.unsent, ...status.conditions.filter((c) => c.severity === "error").map((c) => c.message)];
      const said = why.filter((text): text is string => text !== null && text !== "");
      return `- Block "${block}" reads ${status.status}${said.length > 0 ? `: ${said.join(" ")}` : "."}`;
    }),
  ].join("\n");
}

export function noBlock(id: string): string {
  return `The board holds no block "${id}". Call list_blocks for the blocks that it holds.`;
}

export function noBlocks(ids: readonly string[]): string {
  if (ids.length === 1) return noBlock(ids[0] ?? "");
  return `The board holds no blocks ${ids.map((id) => `"${id}"`).join(", ")}. Call list_blocks for the blocks that it holds.`;
}

export function noStack(id: string): string {
  return `The board holds no stack "${id}". Call list_stacks for the stacks that it holds.`;
}

export function noBlockType(id: string): string {
  return `The app offers no block class "${id}". Call list_block_types for those that it offers.`;
}

export function noCommand(id: string): string {
  return `The app registers no command "${id}" that you may run. Call list_commands for those that it registers.`;
}

export function noPlugin(id: string): string {
  return `The app runs no plugin "${id}" that you may read. Call list_plugins for those that it runs.`;
}

export function noSkill(name: string): string {
  return `No skill named "${name}" is available here. The Skills section of the system prompt lists the skills that name no class, and describe_block_type, describe_block and get_plugin_state list those that name one.`;
}
