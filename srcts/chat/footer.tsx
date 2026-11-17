// The chat's footer, one row under the message field, as today's footer
// (R/ext-server.R#L164-L207 at fcbdb27), with three things:
// - The button that opens the drawer of conversations over the chat
//   (./drawer.tsx).
// - The model that the open conversation's next turn talks to, beside the
//   meter (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-model).
//   It shows where the deployment names several models or names none, as a
//   select whose list of the models offered the browser opens over the page,
//   and a pick goes to the chat (./chat.tsx). Where the conversation's pick is
//   a model that the deployment does not offer, the footer names the pick
//   beside the model that the calls go to, even where the deployment offers
//   one model and so no pick.
// - The meter: the tokens that the open conversation has spent, input and
//   output, from its usage, without the cached input, as today's meter shows
//   them (R/ext-server.R#L1281-L1309 at fcbdb27), and none on the greeting
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-meter).
//   The usage counts the tokens of the conversation's titles and summaries
//   too.

import type { ReactElement, RefObject } from "react";
import { resolveModel } from "../models/index.ts";
import type { Offered } from "../models/index.ts";
import type { Usage } from "../state/index.ts";

export interface FooterProps {
  // The usage of the open conversation, or undefined on the greeting.
  readonly usage: Usage | undefined;
  // The pick of the model for the next turn: the open conversation's, or the
  // one that the chat keeps for the next conversation that it adds.
  readonly pick: string | null;
  // The models offered, or undefined until the first answer comes.
  readonly offered: Offered | undefined;
  readonly onPick: (model: string) => void;
  // The button that opens the drawer, which takes the focus back once the
  // drawer closes.
  readonly opener: RefObject<HTMLButtonElement | null>;
  readonly onDrawer: () => void;
}

export function Footer({ usage, pick, offered, onPick, opener, onDrawer }: FooterProps): ReactElement {
  return (
    <div className="blockr-assistant-footer">
      <button ref={opener} type="button" className="blockr-assistant-footer-button" title="Conversations" aria-label="Conversations" onClick={onDrawer}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 3v3h3" />
          <path d="M2.75 6A5.5 5.5 0 1 1 3 9.6" />
          <path d="M8 5v3.2l2.2 1.3" />
        </svg>
      </button>
      {offered === undefined ? null : <Model pick={pick} offered={offered} onPick={onPick} />}
      <Meter usage={usage} />
    </div>
  );
}

function Model({ pick, offered, onPick }: { readonly pick: string | null; readonly offered: Offered; readonly onPick: (model: string) => void }): ReactElement | null {
  const next = resolveModel(offered, pick);
  const unoffered = pick !== null && pick !== next ? pick : undefined;
  const choosable = !offered.named || offered.models.length > 1;
  if (next === undefined || (!choosable && unoffered === undefined)) return null;

  return (
    <div className="blockr-assistant-model">
      {unoffered === undefined ? null : (
        <span className="blockr-assistant-model-unoffered" title={`The app does not offer ${unoffered}, so the calls go to ${next}.`}>
          <s>{unoffered}</s>
          <span className="blockr-assistant-hidden">, which the app does not offer, so the calls go to</span>
        </span>
      )}
      {choosable ? (
        <select
          className="blockr-assistant-model-select"
          aria-label="Model"
          title="The model that the next turn talks to"
          value={next}
          onChange={(event) => {
            onPick(event.currentTarget.value);
          }}
        >
          {offered.models.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      ) : (
        <span className="blockr-assistant-model-name">{next}</span>
      )}
    </div>
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
