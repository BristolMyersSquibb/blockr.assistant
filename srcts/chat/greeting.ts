// The greeting, which a conversation with no message shows, as today's chat
// does (R/ext-skin.R#L24-L62 at fcbdb27): a lead, a note and three
// suggestions, each of which sends itself as the user's message
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-message-field-and-a-turn).
// A board that holds no block gets three others, which start something.

import type { Board } from "@blockr/core";

export interface Greeting {
  readonly lead: string;
  readonly note: string;
  readonly suggestions: readonly string[];
}

const EMPTY: Greeting = {
  lead: "What do you want to build?",
  note: "I can add blocks from the installed types and wire them together",
  suggestions: ["Load a dataset and show me what is in it", "Build a chart from one of the built-in datasets", "Set up a filtered table I can explore"],
};

const FILLED: Greeting = {
  lead: "What do you want to see?",
  note: "I can read what these blocks produce, change and rewire them",
  suggestions: ["Summarize what is on this board", "Add a chart of the data on this board", "Check this board for problems"],
};

// The greeting for the board.
export function greetingOf(board: Board): Greeting {
  return Object.keys(board.blocks).length === 0 ? EMPTY : FILLED;
}
