// The chat's footer, one row under the message field, as today's footer
// (R/ext-server.R#L164-L207 at fcbdb27), with four things:
// - The button that opens the drawer of conversations over the chat
//   (./drawer.tsx), which is a Button of blockr.ui.
// - The model that the open conversation's next turn talks to, beside the
//   meter (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-model).
//   It shows where the deployment names several models or names none, as a
//   select of the models offered, and a pick goes to the chat (./chat.tsx).
//   Where the conversation's pick is a model that the deployment does not
//   offer, the footer names the pick beside the model that the calls go to,
//   even where the deployment offers one model and so no pick.
// - The thinking level at which the next turn's calls reason, beside the
//   model, as a select of the levels that the model takes, and a pick goes to
//   the chat. It shows where the model takes two levels or more, and where the
//   conversation's pick applies to the model, once the footer knows the
//   levels (../thinking-levels). Where the conversation picked a level that
//   the model does not take, the select shows the level that the calls take.
// - The meter: the tokens that the open conversation has spent, input and
//   output, from its usage, without the cached input, as today's meter shows
//   them (R/ext-server.R#L1281-L1309 at fcbdb27), and none on the greeting
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-meter).
//   The usage counts the tokens of the conversation's titles and summaries
//   too.
// Both selects are blockr.ui's, whose list opens over the page, where no
// panel clips it (BristolMyersSquibb/blockr.core#684). Neither offers to clear
// its pick.

import type { ReactElement, RefObject } from "react";
import { Button, ComboBox, ComboBoxItem } from "@blockr/ui";
import type { Picks } from "../conversations/index.ts";
import { resolveModel } from "../models/index.ts";
import type { Offered } from "../models/index.ts";
import type { ThinkingLevel, Usage } from "../state/index.ts";
import type { LevelsOf, LevelsOfModel } from "../thinking-levels/index.ts";

export interface FooterProps {
  // The usage of the open conversation, or undefined on the greeting.
  readonly usage: Usage | undefined;
  // The picks for the next turn: the open conversation's, or those that the
  // chat keeps for the next conversation that it adds.
  readonly picks: Picks;
  // The models offered, or undefined until the first answer comes.
  readonly offered: Offered | undefined;
  // The levels of each model, or undefined until the footer knows them.
  readonly levelsOf: LevelsOf | undefined;
  readonly onPick: (model: string) => void;
  readonly onPickLevel: (level: ThinkingLevel) => void;
  // The button that opens the drawer, which takes the focus back once the
  // drawer closes.
  readonly opener: RefObject<HTMLButtonElement | null>;
  readonly onDrawer: () => void;
}

export function Footer({ usage, picks, offered, levelsOf, onPick, onPickLevel, opener, onDrawer }: FooterProps): ReactElement {
  const next = offered === undefined ? undefined : resolveModel(offered, picks.model);
  return (
    <div className="blockr-assistant-footer">
      <Button variant="quiet" className="blockr-assistant-footer-button" aria-label="Conversations" ref={opener} onPress={onDrawer}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 3v3h3" />
          <path d="M2.75 6A5.5 5.5 0 1 1 3 9.6" />
          <path d="M8 5v3.2l2.2 1.3" />
        </svg>
      </Button>
      {offered === undefined || next === undefined ? null : <Model pick={picks.model} next={next} offered={offered} onPick={onPick} />}
      {next === undefined || levelsOf === undefined ? null : (
        <Level levels={levelsOf(next, picks.thinkingLevel, offered?.settings?.get(next))} onPick={onPickLevel} />
      )}
      <Meter usage={usage} />
    </div>
  );
}

// An option of a select: a model or a level, by its id.
interface Option {
  readonly id: string;
}

function Model({
  pick,
  next,
  offered,
  onPick,
}: {
  readonly pick: string | null;
  readonly next: string;
  readonly offered: Offered;
  readonly onPick: (model: string) => void;
}): ReactElement | null {
  const unoffered = pick !== null && pick !== next ? pick : undefined;
  const choosable = !offered.named || offered.models.length > 1;
  if (!choosable && unoffered === undefined) return null;

  return (
    <div className="blockr-assistant-model">
      {unoffered === undefined ? null : (
        <span className="blockr-assistant-model-unoffered" title={`The app does not offer ${unoffered}, so the calls go to ${next}.`}>
          <s>{unoffered}</s>
          <span className="blockr-assistant-hidden">, which the app does not offer, so the calls go to</span>
        </span>
      )}
      {choosable ? (
        <ComboBox<Option>
          aria-label="Model"
          isRequired
          className="blockr-assistant-pick blockr-assistant-pick-model"
          value={next}
          onChange={(key) => {
            if (key !== null) onPick(String(key));
          }}
          defaultItems={offered.models.map((id) => ({ id }))}
        >
          {(option) => <ComboBoxItem id={option.id}>{option.id}</ComboBoxItem>}
        </ComboBox>
      ) : (
        <span className="blockr-assistant-model-name">{next}</span>
      )}
    </div>
  );
}

function Level({ levels, onPick }: { readonly levels: LevelsOfModel; readonly onPick: (level: ThinkingLevel) => void }): ReactElement | null {
  if (levels.levels.length < 2) return null;
  return (
    <ComboBox<Option>
      aria-label="Thinking level"
      isRequired
      className="blockr-assistant-pick blockr-assistant-pick-level"
      value={levels.level}
      onChange={(key) => {
        const level = levels.levels.find((taken) => taken === key);
        if (level !== undefined) onPick(level);
      }}
      defaultItems={levels.levels.map((id) => ({ id }))}
    >
      {(option) => <ComboBoxItem id={option.id}>{option.id}</ComboBoxItem>}
    </ComboBox>
  );
}

function Meter({ usage }: { readonly usage: Usage | undefined }): ReactElement {
  const input = (usage?.input ?? 0).toLocaleString();
  const output = (usage?.output ?? 0).toLocaleString();
  return (
    <p className="blockr-assistant-meter">
      <span title={`Input tokens (this conversation): ${input}`}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 12.5v-9M4.5 7 8 3.5 11.5 7" />
        </svg>
        <span className="blockr-assistant-hidden">Input tokens: </span>
        {input}
      </span>
      <span title={`Output tokens (this conversation): ${output}`}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 3.5v9M4.5 9 8 12.5 11.5 9" />
        </svg>
        <span className="blockr-assistant-hidden">Output tokens: </span>
        {output}
      </span>
    </p>
  );
}
