// How the assistant prepares a call to the model of a conversation. Each turn
// prepares its calls so, compaction prepares the call that writes a summary
// so (../compaction), and the titles the call that titles a conversation
// (../titles), so that all of them talk to the same model in the same way:
// 1. The call goes to the deployment's base URL, in the API that the base URL
//    speaks, with the deployment's key, or with no key where the key is
//    "none" (../deployment).
// 2. It talks to the model that the conversation picked, where the deployment
//    offers it, and to the default otherwise, while the pick stays in the
//    state, so that the conversation talks to its model again under a
//    deployment that offers it
//    (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.1#who-picks-the-model).
//    Where the deployment names no models, the models ask for the base URL's
//    list again, where the last list offered none (../models).
// 3. The loop and its provider code load with a dynamic import, which the
//    browser does once, as the page prepares its first call: as the board's
//    first turn starts, or as the user asks for a summary (../compaction). So
//    a page where nobody asks the assistant anything never loads them.
// 4. The model takes the settings that the deployment's model settings give
//    it, and those that the base URL's list gives it, where either gives any
//    (../model-settings). Once the loop has loaded, which holds pi's catalogs,
//    the model settings check that each like names a model of the catalogs.
// No call can go out where a blockr option of the deployment holds a value
// that it does not take, where the deployment sets no key, where the
// deployment offers no model, or where the loop's code fails to load.

import type { Deployment } from "../deployment/index.ts";
import type { CallModel, Connection, Loop } from "../loop/index.ts";
import type { ModelSettingsFile } from "../model-settings/index.ts";
import { resolveModel } from "../models/index.ts";
import type { Models } from "../models/index.ts";

// What preparing a call reads, which the assistant opens as the board opens.
export interface CallOptions {
  // What the deployment chose through the assistant's blockr options, which
  // the assistant reads as the board opens. It rejects where an option holds
  // a value that it does not take.
  readonly deployment: Promise<Deployment>;
  // The models that the deployment offers.
  readonly models: Pick<Models, "offered">;
  // The settings that the deployment gives its models, in the file that the
  // blockr option assistant_model_settings names.
  readonly settings: Pick<ModelSettingsFile, "checked">;
  // Loads the loop, which imports pi's bundle.
  readonly load: () => Promise<Loop>;
}

// A call that is prepared: the loop that makes it, and the model that it
// talks to.
export interface PreparedCall {
  readonly loop: Loop;
  readonly model: CallModel;
}

// A call that is prepared. Or why no call can go out, and whether to raise
// that, since the models raised already why the deployment offers no model.
// Or that the preparation stopped, as where the board closed meanwhile.
export type Prepared =
  | ({ readonly kind: "prepared" } & PreparedCall)
  | { readonly kind: "failed"; readonly why: string; readonly raise: boolean }
  | { readonly kind: "stopped" };

const NO_KEY = "The assistant has no key for its calls, since the app sets none in the blockr option assistant_api_key.";
const NO_MODEL = "The assistant has no model to talk to, since the app offers none.";

const STOPPED: Prepared = { kind: "stopped" };

// Prepares a call, given the conversation's pick of the model, which it reads
// once the models offered are known, and whether to stop, which it asks after
// each step that waits.
export async function prepareCall(options: CallOptions, picked: () => string | null, stopped: () => boolean): Promise<Prepared> {
  let deployment: Deployment;
  try {
    deployment = await options.deployment;
  } catch (error) {
    return failed(`The assistant cannot call a model: ${messageOf(error)}`);
  }
  if (deployment.credential.kind === "visitor") return failed(NO_KEY);

  const offered = await options.models.offered();
  if (stopped()) return STOPPED;
  const model = resolveModel(offered, picked());
  if (model === undefined) return { kind: "failed", why: offered.failure ?? NO_MODEL, raise: false };

  let loop: Loop;
  try {
    loop = await options.load();
  } catch (error) {
    return failed(`The assistant could not load the code that runs its turns: ${messageOf(error)}`);
  }
  if (stopped()) return STOPPED;
  const settings = await options.settings.checked((id) => loop.inCatalog(id));
  if (stopped()) return STOPPED;

  return {
    kind: "prepared",
    loop,
    model: { connection: connectionOf(deployment), model, settings: settings.get(model), listed: offered.settings?.get(model) },
  };
}

function failed(why: string): Prepared {
  return { kind: "failed", why, raise: true };
}

// Where the calls go, and the key that each carries: the deployment's, or
// none.
function connectionOf(deployment: Deployment): Connection {
  const { credential } = deployment;
  const key = credential.kind === "deployment" ? credential.key : undefined;
  return { baseUrl: deployment.baseUrl, api: deployment.api, apiKey: () => Promise.resolve(key) };
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
