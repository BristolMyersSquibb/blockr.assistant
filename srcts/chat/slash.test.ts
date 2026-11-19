// The slash commands of the message field (./slash.ts): which command a line
// names, what the list offers and shows for the text in the field, and when
// a command waits.

import { describe, expect, test } from "vitest";
import { skill } from "../testing/index.ts";
import { listedFor, slashCommandOf, slashCommands, waits } from "./slash.ts";

const FILTERS = skill("filters", { userInvocable: true, description: "How to filter." });
const REVIEW = skill("review", { userInvocable: true, modelInvocable: false, description: "A review the user runs." });
const LAYOUT = skill("layout");
const SKILLS = [FILTERS, LAYOUT, REVIEW];

describe("the slash commands of the message field", () => {
  test("name a built-in command by the word after the line's leading /, and leave out the rest of the line", () => {
    expect(slashCommandOf("/compact", SKILLS)).toEqual({ kind: "builtin", name: "compact" });
    expect(slashCommandOf("/clear now", SKILLS)).toEqual({ kind: "builtin", name: "clear" });
    expect(slashCommandOf("/undo\nthe filter", SKILLS)).toEqual({ kind: "builtin", name: "undo" });
    expect(slashCommandOf("/redo", [])).toEqual({ kind: "builtin", name: "redo" });
  });

  test("name each skill that the user may call, whether or not the model may read it", () => {
    expect(slashCommandOf("/filters keep adults", SKILLS)).toEqual({ kind: "skill", skill: FILTERS });
    expect(slashCommandOf("/review", SKILLS)).toEqual({ kind: "skill", skill: REVIEW });
    expect(slashCommandOf("/layout", SKILLS)).toBeUndefined();
  });

  test("name nothing for a line that names no command, as one that goes to the model as typed", () => {
    for (const line of ["/", "/tmp/data.csv holds the sales", " /undo", "undo", "/Undo", "/undone", "/filter"]) {
      expect(slashCommandOf(line, SKILLS)).toBeUndefined();
    }
  });

  test("keep a built-in command's name for the built-in command, past a skill of the same name", () => {
    const shadowed = skill("undo", { userInvocable: true });

    expect(slashCommandOf("/undo", [shadowed])).toEqual({ kind: "builtin", name: "undo" });
    expect(slashCommands([shadowed]).map(({ name }) => name)).toEqual(["compact", "clear", "undo", "redo"]);
  });

  test("offer the built-in commands, then each skill that the user may call, in R's order, with what each does", () => {
    expect(slashCommands(SKILLS)).toEqual([
      { name: "compact", description: "Summarize the conversation so far, keeping the newest messages as they are." },
      { name: "clear", description: "Start a new conversation, keeping this one." },
      { name: "undo", description: "Take back the assistant's last edit of the board." },
      { name: "redo", description: "Apply again what the last undo took back." },
      { name: "filters", description: "How to filter." },
      { name: "review", description: "A review the user runs." },
    ]);
  });

  test("show those whose names start with what follows the /, whatever the case, while the text holds no space or line break", () => {
    const commands = slashCommands(SKILLS);
    const names = (text: string) => listedFor(text, commands)?.map(({ name }) => name);

    expect(names("/")).toEqual(["compact", "clear", "undo", "redo", "filters", "review"]);
    expect(names("/c")).toEqual(["compact", "clear"]);
    expect(names("/RE")).toEqual(["redo", "review"]);
    expect(names("/undo")).toEqual(["undo"]);
    expect(names("/x")).toEqual([]);
    for (const text of ["", "undo", "/undo ", "/filters keep adults", "/c\n", " /c"]) {
      expect(listedFor(text, commands)).toBeUndefined();
    }
  });

  test("wait while a turn runs, but for /clear, and wait for the visitor's key where they call the model", () => {
    const at = (running: boolean, noKey: boolean) =>
      [...["compact", "clear", "undo", "redo"].map((name) => slashCommandOf(`/${name}`, [])), slashCommandOf("/filters", SKILLS)].map((command) =>
        command === undefined ? undefined : waits(command, { running, noKey }),
      );

    expect(at(false, false)).toEqual([false, false, false, false, false]);
    expect(at(true, false)).toEqual([true, false, true, true, true]);
    expect(at(false, true)).toEqual([true, false, false, false, true]);
  });
});
