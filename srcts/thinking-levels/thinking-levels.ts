// The thinking levels that the chat's footer offers for the next turn of a
// conversation, and the level at which that turn's calls reason
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-model).
// The class's start makes them as each board opens, and they last until the
// next board opens, as the signal aborts. They read what the calls read
// (../turns/prepare.ts):
// 1. The chat has them load as it first mounts, through load(), rather than
//    as the board opens. They read the deployment, and load pi's catalogs for
//    its base URL, which the calls load too (../loop). The chat draws once
//    load() has resolved, which it does once the catalogs have loaded, or
//    failed to.
// 2. Once the catalogs have loaded, they have the model settings check that
//    each like names a model of the catalogs, as the calls have them check it
//    (../model-settings).
// 3. Once the model settings are in, current() gives the levels of each
//    model, and they call whoever follows them through subscribe().
// So the footer offers no pick of the level until it knows the levels of the
// model, and never offers one that it then takes back.
// Where the deployment's options or the catalogs fail, current() gives
// nothing, and the turns report why as each turn starts. Catalogs that failed
// to load load again as load() is next called.

import type { Deployment } from "../deployment/index.ts";
import type { Catalogs } from "../loop/index.ts";
import type { ListedSettings, ModelSettingsFile } from "../model-settings/index.ts";
import type { ThinkingLevel } from "../state/index.ts";

// The levels that a conversation may pick for its next turn on a model, from
// none to the most, which the footer offers where they are two or more, and
// the level at which that turn's calls reason, given the conversation's pick.
export interface LevelsOfModel {
  readonly levels: readonly ThinkingLevel[];
  readonly level: ThinkingLevel;
}

// The levels of the model of the id given, with the settings that the base
// URL's list gives it, given the conversation's pick of the level.
export type LevelsOf = (model: string, picked: ThinkingLevel | undefined, listed: ListedSettings | undefined) => LevelsOfModel;

export interface ThinkingLevels {
  // Starts to load what the levels read, once, and resolves once the catalogs
  // have loaded, or failed to. It never rejects.
  load(): Promise<void>;
  // The levels of each model, or undefined until the catalogs and the model
  // settings are in. It gives the same function until they change.
  current(): LevelsOf | undefined;
  // Calls the listener whenever what current() gives changes, until the
  // function that it returns is called.
  subscribe(listener: () => void): () => void;
}

export interface ThinkingLevelsOptions {
  // What the deployment chose through the assistant's blockr options.
  readonly deployment: Promise<Deployment>;
  // The settings that the deployment gives its models.
  readonly settings: Pick<ModelSettingsFile, "checked">;
  // Loads pi's catalogs for the calls to the base URL given.
  readonly catalogs: (baseUrl: string) => Promise<Catalogs>;
}

export function createThinkingLevels(signal: AbortSignal, options: ThinkingLevelsOptions): ThinkingLevels {
  const listeners = new Set<() => void>();
  let current: LevelsOf | undefined;
  let loading: Promise<void> | undefined;

  async function load(): Promise<void> {
    let deployment: Deployment;
    let catalogs: Catalogs;
    try {
      deployment = await options.deployment;
      catalogs = await options.catalogs(deployment.baseUrl);
    } catch {
      loading = undefined;
      return;
    }
    void options.settings.checked((id) => catalogs.inCatalog(id)).then((settings) => {
      if (signal.aborted) return;
      const connection = { baseUrl: deployment.baseUrl, api: deployment.api };
      current = (model, picked, listed) => {
        const called = { connection, model, settings: settings.get(model), listed, thinkingLevel: picked };
        return { levels: catalogs.thinkingLevels(called), level: catalogs.thinkingLevel(called) };
      };
      for (const listener of listeners) listener();
    });
  }

  return {
    load() {
      loading ??= load();
      return loading;
    },
    current: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
