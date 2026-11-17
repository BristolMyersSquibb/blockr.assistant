// The models that the assistant offers on the open board, the first being the
// default (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.1#who-picks-the-model).
// The class's start makes them as each board opens, and they last until the
// next board opens, as the signal aborts.
// - Where the deployment names models in the blockr option assistant_models,
//   the assistant offers those (../deployment).
// - Where it names none, the assistant offers the models of the base URL's
//   list that take tools, with the settings that the list gives each, such as
//   its context window (./list.ts). It asks for the list with the
//   deployment's key, or with none where the key is "none". Where the visitor
//   authenticates, it asks for no list, since it holds no key of the
//   visitor's.
//
// The assistant asks for the list in these steps:
// 1. It asks as the board opens.
// 2. Where that list offers no model, it asks again as the user tries to
//    send, through offered(), so that a list that failed for a moment comes
//    back. The next board asks anew.
// 3. A list that the base URL refuses for its key raises the error
//    assistant_call_failed, as a refused key does for a call. A list that
//    fails otherwise, or that leaves no model to offer, raises the error
//    assistant_models_failed, which the models withdraw once a list offers a
//    model (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#what-fails).
// 4. Once the next board opens, they raise nothing more, and abort the
//    request for the list that they wait for.
//
// The chat's footer shows the models that the last list gave, without asking
// for the list again, through current() and subscribe()
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-model).

import type { CoreApi } from "@blockr/core";
import type { Deployment } from "../deployment/index.ts";
import type { ListedSettings } from "../model-settings/index.ts";
import { heldError } from "../notifications/index.ts";
import type { HeldError } from "../notifications/index.ts";
import { askList } from "./list.ts";
import type { Fetch } from "./list.ts";

// The models that the assistant offers, the default first, and why it offers
// none, where it offers none.
export interface Offered {
  readonly models: readonly string[];
  // Whether the deployment names the models, rather than the base URL's list
  // giving them. The chat offers a pick of the model where the deployment
  // names several models or none.
  readonly named: boolean;
  // The settings that the base URL's list gives each model offered, by the
  // model's id, where the models come from the list and it gives any.
  readonly settings?: ReadonlyMap<string, ListedSettings>;
  readonly failure?: string;
}

export interface Models {
  // Resolves with the models offered. Where the last list offered no model,
  // it asks the base URL for its list again first. It never rejects, and
  // resolves with no model where the deployment's blockr options cannot be
  // read, which the turns report.
  offered(): Promise<Offered>;
  // The models offered, as the last answer gave them, without asking again,
  // or undefined until the first answer comes. It gives the same object until
  // another answer comes, as React's useSyncExternalStore() asks of a
  // snapshot.
  current(): Offered | undefined;
  // Calls the listener whenever what current() gives changes, until the
  // function that it returns is called.
  subscribe(listener: () => void): () => void;
}

export interface ModelsOptions {
  // What the deployment chose, which the assistant reads as the board opens.
  readonly deployment: Promise<Deployment>;
  // The error assistant_call_failed, which the turns raise as well.
  readonly callFailed: HeldError;
  // How the assistant asks for the list, through the page's fetch unless
  // given.
  readonly fetch?: Fetch | undefined;
}

// What one request for the list gave, and whether the next offered() asks
// again.
interface Asked {
  readonly offered: Offered;
  readonly again: boolean;
}

const NONE: Asked = { offered: { models: [], named: false }, again: false };

// The model that a conversation with the pick given talks to: its pick, where
// the models offered hold it, and the default otherwise, or undefined where
// none is offered. The pick stays in the state, so that the conversation
// talks to its model again under a deployment that offers it
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.1#who-picks-the-model).
export function talksTo(offered: Offered, pick: string | null): string | undefined {
  return pick !== null && offered.models.includes(pick) ? pick : offered.models[0];
}

export function createModels(core: { readonly notifications: Pick<CoreApi["notifications"], "notify"> }, signal: AbortSignal, options: ModelsOptions): Models {
  const modelsFailed = heldError(core, signal, "assistant_models_failed");
  const fetch: Fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));

  async function ask(): Promise<Asked> {
    let deployment: Deployment;
    try {
      deployment = await options.deployment;
    } catch {
      return NONE;
    }
    if (deployment.models !== undefined) return { offered: { models: deployment.models, named: true }, again: false };
    const { credential } = deployment;
    if (credential.kind === "visitor") return NONE;

    const listed = await askList(deployment, credential.kind === "deployment" ? credential.key : undefined, fetch, signal);
    if (signal.aborted) return NONE;
    switch (listed.kind) {
      case "listed": {
        modelsFailed.withdraw();
        const { models, settings } = listed;
        return { offered: { models, named: false, ...(settings.size === 0 ? {} : { settings }) }, again: false };
      }
      case "refused":
        modelsFailed.withdraw();
        options.callFailed.raise(listed.message);
        return { offered: { models: [], named: false, failure: listed.message }, again: true };
      case "failed":
        modelsFailed.raise(listed.message);
        return { offered: { models: [], named: false, failure: listed.message }, again: true };
    }
  }

  const listeners = new Set<() => void>();
  let current: Offered | undefined;
  signal.addEventListener(
    "abort",
    () => {
      listeners.clear();
    },
    { once: true },
  );

  // Keeps what an answer offers as what current() gives, and tells whoever
  // follows the models.
  function answered(asking: Promise<Asked>): Promise<Asked> {
    return asking.then((asked) => {
      if (asked.offered !== current) {
        current = asked.offered;
        for (const listener of listeners) listener();
      }
      return asked;
    });
  }

  let last = answered(ask());
  return {
    offered() {
      last = last.then((asked) => (asked.again && !signal.aborted ? answered(ask()) : asked));
      return last.then((asked) => asked.offered);
    },

    current() {
      return current;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
