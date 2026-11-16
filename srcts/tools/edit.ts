// The tools that change the board: edit, which runs a list of commands as one
// step of the assistant, and undo_edit, which takes back the assistant's last
// undo step. Each returns the review of its step (./review.ts)
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.2#the-edit-tool).
// - The edit tool refuses a list that holds a command of the assistant's own,
//   or blockr.core-set_plugin_state for the assistant's plugin, since only the
//   assistant's chat and loop change its conversations. It refuses a command
//   that the app does not register as well, with the tool that lists those
//   that it registers.
// - It runs the list with core.commands.run(list, "assistant"), which plans
//   each command on the board that the commands before it leave, and applies
//   them all as one step of the origin "assistant", or applies none. Where a
//   command refuses, the tool returns the command's index, its id and each
//   failure that the command registry names, and the board stays as it was.
//   Where the command failed its preflight, the tool adds a hint that says
//   what to check, and on a locked board, that the lock may be why, since a
//   lock makes some commands fail their preflight
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.1.11#plugins-on-a-locked-board).
// - The step took an undo step unless every command of the list has
//   `undo: false`, or the changes that the tool heard set only board options.
// - The tool undo_edit takes back the assistant's last undo step with
//   core.store.undo("assistant"), which applies the undo as a new edit and
//   announces it with the origin "assistant". That step may be another
//   conversation's. Where the assistant has no undo step left, the tool
//   changes nothing, and where the store refuses the undo, as a lock refuses
//   it, the tool returns why.
// - An edit that applied is never marked as an error, even where its review
//   holds a failed block or the user stopped the turn. A stop while a command
//   of the list waits in its prepare() does not stop core.commands.run(),
//   which takes no signal, so the tool waits for the call to settle, and
//   returns whether the commands applied, with no review. A call that the user
//   stopped before it began rejects, as any tool's does.
// - Both set executionMode to "sequential", so that pi runs every call of a
//   response that calls either of them one after the other, in the model's
//   order. Otherwise a read that the model put after an edit could read the
//   board from before the edit.
// - The edit tool's own schema is fixed. The schemas of commands reach the
//   model as text, through describe_command, so that no provider checks them.
// - Both take the signal that core aborts as the next board opens, the one
//   that the plugin's start gets, to tell another board opening from the user
//   stopping the turn.
// - Each captures the active context before its first await, in which the
//   tool's span is active, and runs its step and sends the request of its
//   review inside context.with() of that context. So core puts the spans of
//   the commands and of the request under the tool's span, as it puts them
//   under the span that is active as run() or request() is called
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4#proposal).

import { context } from "@opentelemetry/api";
import type { CommandError, CoreApi, Json } from "@blockr/core";
import { assistantCommands, object } from "../commands/index.ts";
import { failureMessage } from "../requests/index.ts";
import { ASSISTANT } from "../state/index.ts";
import { hear, ORIGIN, setsOnlyOptions } from "./changes.ts";
import type { Heard } from "./changes.ts";
import { own } from "./context.ts";
import { noCommand } from "./failures.ts";
import { conditionsNow, reviewCaps, reviewed, stepResult } from "./review.ts";
import { json, tool } from "./tool.ts";
import type { Tool, ToolResult } from "./tool.ts";

const OWN = new Set(assistantCommands.map((command) => command.id));

const SET_PLUGIN_STATE = "blockr.core-set_plugin_state";

const OWN_STATE = `Only the assistant's chat and loop change the assistant's conversations, so an edit sets no state of the plugin "${ASSISTANT}".`;

// What the edit tool's hint says to check where a command failed its
// preflight, since a preflight says only whether it passed.
const HINT =
  "Check that each block, link, stack and plugin that the args name is on the board, and each board option is defined, with list_blocks, list_links, list_stacks, list_plugins or list_board_options, and that a block that a new link goes to has a free data input, with describe_block.";

const LOCKED_HINT =
  "The board is locked, which may be why: on a locked board, blockr.core-set_plugin_state fails its preflight, and a plugin's own commands fail theirs for what the plugin locks.";

const STOPPED_PREPARING =
  "The user stopped the turn while a command of the list prepared. The commands applied all the same, but the tool reviewed nothing, so do not run them again.";

const NOTHING_TO_UNDO = "The assistant has no edit left to take back, so the tool changed nothing.";

const UNDID_NOTHING = "The undo changed nothing, since what the edit changed is no longer on the board.";

const EDIT_DESCRIPTION =
  "Change the board by running a list of commands, each by its id with its args, as one step: either every command applies, or none does. Apart from undo_edit, this is the only tool that changes the board. List the commands with list_commands, and read the args that one takes with describe_command. Each command is planned on the board that the commands before it leave, so one edit can add a block, link it and show its panel. Where a command refuses, nothing applies, and the result gives the command's index in the list, counted from 0, its id, why it refused and, where it fails its preflight, what to check. Once the commands apply, the tool evaluates the blocks that the edit added or whose state or links it changed, every block downstream of them and the blocks that feed them, and returns a review of them, the changed blocks first. For each block, the review gives its status, why it is `invalid` or `waiting` where it is, the conditions that appeared since the edit began, what blockr writes about its result, and, for a block that the edit added, its state. A changed block that produced no result is marked as unverified: do not report it as done. The review names the blocks, links and stacks that the edit added or removed, and says in its notes how many blocks it left out. Its `undo_step` says whether undo_edit can take the edit back: an edit that only changes what the user looks at, such as the active view, or that only sets board options, takes no undo step.";

const UNDO_DESCRIPTION =
  "Take back the assistant's last edit that took an undo step, when the user asks for that. The undo is a new edit on the board as it is now, so it keeps what the user changed after the edit, but sets back what both the user and the edit changed to its value before the edit. That edit may come from another of the assistant's conversations. The tool returns a review of what the undo changed, as edit does. Where the assistant has no edit left to take back, it changes nothing.";

interface Listed {
  readonly command: string;
  readonly args?: Readonly<Record<string, Json>>;
}

// The edit tool and undo_edit on the CoreApi of the open board, given the
// signal that core aborts as the next board opens.
export function editTools(core: CoreApi, board: AbortSignal): Tool[] {
  return [
    tool<{ readonly commands: readonly Listed[] }>({
      name: "edit",
      description: EDIT_DESCRIPTION,
      parameters: object(
        {
          commands: {
            type: "array",
            minItems: 1,
            items: object(
              {
                command: { type: "string", description: "The command's id, as list_commands gives it." },
                args: {
                  type: "object",
                  description: "The command's args, which the JSON Schema that describe_command gives types. Leave it out for a command that takes none.",
                },
              },
              ["command"],
            ),
            description: "The commands to run, in order, as one step.",
          },
        },
        ["commands"],
      ),
      executionMode: "sequential",
      run: async ({ commands }, signal) => {
        const active = context.active();
        const caps = await reviewCaps(core);
        const refused = refusedAhead(core, commands);
        if (refused !== undefined) return refused;
        signal.throwIfAborted();

        const before = conditionsNow(core);
        const hearing = hear(core);
        let refusal: { readonly error: unknown } | undefined;
        try {
          await context.with(active, () =>
            core.commands.run(
              commands.map(({ command, args }) => (args === undefined ? { id: command } : { id: command, args })),
              ORIGIN,
            ),
          );
        } catch (error) {
          refusal = { error };
        } finally {
          hearing.stop();
        }

        if (refusal !== undefined) return refusedList(core, commands, refusal.error, signal.aborted);
        const heard = hearing.heard();
        const head = { applied: true, undo_step: tookUndoStep(core, commands, heard) };
        if (signal.aborted) return json({ ...stepResult(heard, head), notes: [STOPPED_PREPARING] });
        return json(await reviewed(core, { heard, before, head, what: "the commands", caps }, { turn: signal, board }, active));
      },
    }),

    tool<Record<string, never>>({
      name: "undo_edit",
      description: UNDO_DESCRIPTION,
      parameters: object({}, []),
      executionMode: "sequential",
      run: async (_args, signal) => {
        const active = context.active();
        const caps = await reviewCaps(core);
        signal.throwIfAborted();
        if (!core.store.canUndo(ORIGIN)) throw new Error(NOTHING_TO_UNDO);

        const before = conditionsNow(core);
        const hearing = hear(core);
        try {
          context.with(active, () => {
            core.store.undo(ORIGIN);
          });
        } catch (error) {
          return refusedResult({ applied: false, failures: failuresOf(error) });
        } finally {
          hearing.stop();
        }

        const heard = hearing.heard();
        const notes = heard.length === 0 ? [UNDID_NOTHING] : [];
        return json(await reviewed(core, { heard, before, head: { applied: true }, what: "the undo", notes, caps }, { turn: signal, board }, active));
      },
    }),
  ];
}

// The refusal of a list that holds a command that the model may not run: one
// of the assistant's own, which the app registers but list_commands leaves
// out, core's command for the assistant's own state, or one that the app does
// not register.
function refusedAhead(core: CoreApi, commands: readonly Listed[]): ToolResult | undefined {
  const registered = core.commands.registered();
  for (const [index, { command, args }] of commands.entries()) {
    const failure =
      command === SET_PLUGIN_STATE && args?.plugin === ASSISTANT
        ? OWN_STATE
        : OWN.has(command) || own(registered, command) === undefined
          ? noCommand(command)
          : undefined;
    if (failure !== undefined) return refusedResult({ applied: false, index, command, failures: [failure] });
  }
  return undefined;
}

// What the tool returns where the command registry refused the list: the
// index of the command that refused, its id and each failure, with a hint
// where it failed its preflight, and, where the user stopped the turn, that
// they did.
function refusedList(core: CoreApi, commands: readonly Listed[], error: unknown, stopped: boolean): ToolResult {
  const notes: Record<string, Json> = stopped ? { notes: ["The user stopped the turn while the commands ran."] } : {};
  if (!isCommandError(error) || error.index === undefined) {
    return refusedResult({ applied: false, failures: failuresOf(error), ...notes });
  }
  const hint: Record<string, Json> = error.preflight === false ? { hint: core.lock.board ? `${HINT} ${LOCKED_HINT}` : HINT } : {};
  return refusedResult({
    applied: false,
    index: error.index,
    command: commands[error.index]?.command ?? null,
    failures: [...error.failures],
    ...hint,
    ...notes,
  });
}

function refusedResult(value: Readonly<Record<string, Json>>): ToolResult {
  return { text: json(value), isError: true, images: [] };
}

// Whether the step took an undo step: unless every command of the list has
// `undo: false`, or the step set only board options, as one that changed
// nothing does.
function tookUndoStep(core: CoreApi, commands: readonly Listed[], heard: readonly Heard[]): boolean {
  const registered = core.commands.registered();
  return commands.some(({ command }) => own(registered, command)?.undo !== false) && !setsOnlyOptions(heard);
}

// The failures with which the command registry or the store refused, each in
// a sentence, or the error's message.
function failuresOf(error: unknown): string[] {
  if (error instanceof Error && (error.name === "CommandError" || error.name === "StoreError")) {
    const { failures } = error as Error & { readonly failures?: unknown };
    if (Array.isArray(failures) && failures.every((failure) => typeof failure === "string")) return [...failures];
  }
  return [failureMessage(error)];
}

// Whether the error is a CommandError, which core exports to plugins as a type
// alone, so the tool tells it by its name.
function isCommandError(error: unknown): error is CommandError {
  return error instanceof Error && error.name === "CommandError" && Array.isArray((error as Partial<CommandError>).failures);
}
