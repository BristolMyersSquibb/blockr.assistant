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
//   authenticates, it asks with the visitor's own key, and asks for no list
//   until the visitor gives one (../visitor-key).
//
// The assistant asks for the list in these steps:
// 1. It asks as the board opens.
// 2. Where the visitor authenticates, it asks again once the visitor gives a
//    key other than the one that it last asked with. So the chat learns of a
//    refused key before the visitor sends anything. A key that the base URL
//    refused counts as new when the visitor gives it again.
// 3. Where the last list offered no model, it asks again as the user tries to
//    send, through offered(), so that a list that failed for a moment comes
//    back. The next board asks anew.
// 4. A list that the base URL refuses for its key raises the error
//    assistant_call_failed, as a refused key does for a call, and drops the
//    visitor's key, so that the chat asks for a key again. A list that fails
//    otherwise, or that leaves no model to offer, raises the error
//    assistant_models_failed, which the models withdraw once a list offers a
//    model (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#what-fails).
//    A list that the base URL gives for the visitor's key tells the key that
//    the base URL took it.
// 5. Once the next board opens, they raise nothing more, and abort the
//    request for the list that they wait for.
// A list for a key that the visitor has replaced while the request ran says
// nothing, since the list for the new key follows.
//
// The turns have the models check a key through check(), which asks the base
// URL for its list with that key. The turns do so where a call with the
// visitor's key got no answer that the page could read, to tell a refused key
// from a lost connection
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-credential).

import type { CoreApi } from "@blockr/core";
import type { Deployment } from "../deployment/index.ts";
import type { ListedSettings } from "../model-settings/index.ts";
import { heldError } from "../notifications/index.ts";
import type { HeldError } from "../notifications/index.ts";
import { keyOf } from "../visitor-key/index.ts";
import type { VisitorKey } from "../visitor-key/index.ts";
import { askList } from "./list.ts";
import type { Fetch, Listed } from "./list.ts";

// The models that the assistant offers, the default first, and why it offers
// none, where it offers none.
export interface Offered {
  readonly models: readonly string[];
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
  // Asks the base URL for its list of models with the key given, and resolves
  // with what the base URL answered: the list, a refusal of the key, or a
  // failure. It never rejects.
  check(key: string): Promise<Listed>;
}

export interface ModelsOptions {
  // What the deployment chose, which the assistant reads as the board opens.
  readonly deployment: Promise<Deployment>;
  // The error assistant_call_failed, which the turns raise as well.
  readonly callFailed: HeldError;
  // The visitor's own key, with which the models ask for the list where the
  // visitor authenticates.
  readonly key: VisitorKey;
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

const NONE: Asked = { offered: { models: [] }, again: false };

export function createModels(core: { readonly notifications: Pick<CoreApi["notifications"], "notify"> }, signal: AbortSignal, options: ModelsOptions): Models {
  const modelsFailed = heldError(core, signal, "assistant_models_failed");
  const fetch: Fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const visitor = options.key;
  // Whether the visitor authenticates, which the models know once they have
  // read the deployment.
  let visitorAuthenticates = false;
  // The visitor's key that the models last asked with. A key that the base
  // URL refused leaves it unset.
  let askedWith: string | undefined;

  async function ask(): Promise<Asked> {
    let deployment: Deployment;
    try {
      deployment = await options.deployment;
    } catch {
      return NONE;
    }
    if (deployment.models !== undefined) return { offered: { models: deployment.models }, again: false };
    const { credential } = deployment;
    let key: string | undefined;
    if (credential.kind === "visitor") {
      visitorAuthenticates = true;
      key = keyOf(visitor.current());
      // The models ask once the visitor gives a key.
      if (key === undefined) return NONE;
      askedWith = key;
    } else if (credential.kind === "deployment") {
      key = credential.key;
    }
    const visitorKey = credential.kind === "visitor" ? key : undefined;

    const listed = await askList(deployment, key, fetch, signal);
    if (signal.aborted || (visitorKey !== undefined && keyOf(visitor.current()) !== visitorKey)) return NONE;
    switch (listed.kind) {
      case "listed": {
        modelsFailed.withdraw();
        if (visitorKey !== undefined) visitor.took(visitorKey);
        const { models, settings } = listed;
        return { offered: { models, ...(settings.size === 0 ? {} : { settings }) }, again: false };
      }
      case "refused":
        modelsFailed.withdraw();
        options.callFailed.raise(listed.message);
        if (visitorKey !== undefined) {
          if (askedWith === visitorKey) askedWith = undefined;
          visitor.refused(visitorKey);
        }
        return { offered: { models: [], failure: listed.message }, again: true };
      case "failed":
        modelsFailed.raise(listed.message);
        return { offered: { models: [], failure: listed.message }, again: true };
    }
  }

  let last = ask();
  const unsubscribe = visitor.subscribe(() => {
    const key = keyOf(visitor.current());
    if (!visitorAuthenticates || signal.aborted || key === undefined || key === askedWith) return;
    last = ask();
  });
  signal.addEventListener("abort", unsubscribe, { once: true });

  return {
    offered() {
      last = last.then((asked) => (asked.again && !signal.aborted ? ask() : asked));
      return last.then((asked) => asked.offered);
    },
    async check(key) {
      let deployment: Deployment;
      try {
        deployment = await options.deployment;
      } catch (error) {
        return { kind: "failed", message: `The assistant cannot call a model: ${error instanceof Error ? error.message : String(error)}` };
      }
      return askList(deployment, key, fetch, signal);
    },
  };
}
