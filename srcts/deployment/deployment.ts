// What a deployment chooses through the assistant's four blockr options:
// where the calls go, how they are authenticated and which models it offers
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.1#the-blockr-options).
// A fifth blockr option says whether the browser keeps the visitor's own key.
// The assistant reads all five through CoreApi.blockrOption(), which asks R
// once per page, as each board opens.
// - The blockr option assistant_base_url gives the base URL that every call
//   goes to, which is OpenAI's API where it is unset.
// - The blockr option assistant_api gives the API that the base URL speaks,
//   by pi's name for it, which is "openai-responses" where it is unset. The
//   assistant hands it to pi unchanged, and does not work out which API a
//   base URL speaks.
// - The blockr option assistant_api_key gives the deployment's key, or "none"
//   for a base URL that needs no key. Where it is unset, the visitor
//   authenticates. The assistant reads a key from this option alone, never
//   from a variable that a provider's own clients read, such as
//   OPENAI_API_KEY, so that a key set for code in R reaches no browser unless
//   the deployment hands it over
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.1#how-a-call-is-authenticated).
// - The blockr option assistant_models gives the models offered, the first
//   being the default. The assistant takes an array as it is, and splits a
//   string at its commas, since an environment variable gives a string, as
//   does an R option that names one model. Where it is unset, the base URL's
//   list gives the models (../models).
// - The blockr option assistant_key_secret gives the secret with which the
//   browser keeps the visitor's own key in its local storage, where the
//   visitor authenticates. Where it is unset, the page keeps the key in its
//   memory alone (../visitor-key). A deployment sets it as an environment
//   variable, so that every R process of the app hands the page the same
//   secret.
// A value that an option does not take fails the read, with a message that
// names the option and the value as R sent it. The messages of the key and of
// the secret leave the value out, since it may be a key or the secret.

import type { CoreApi, Json } from "@blockr/core";

// OpenAI's API, where the calls go unless the deployment names a base URL.
const OPENAI = "https://api.openai.com/v1";

// The APIs that the assistant speaks, by pi's names for them.
const APIS: readonly string[] = ["openai-responses", "openai-completions", "anthropic-messages"];

// How the calls are authenticated: with the deployment's key, which every
// call carries, with no key, for a base URL that needs none, or with the
// visitor's own key. The visitor's key holds the secret with which the
// browser keeps the key, where the deployment sets one.
export type Credential =
  | { readonly kind: "deployment"; readonly key: string }
  | { readonly kind: "none" }
  | { readonly kind: "visitor"; readonly keySecret?: string };

export interface Deployment {
  // The base URL that every call goes to, without a slash at its end.
  readonly baseUrl: string;
  // The API that the base URL speaks, one of APIS.
  readonly api: string;
  readonly credential: Credential;
  // The models that the deployment names, the first being the default, or
  // undefined where it names none.
  readonly models: readonly string[] | undefined;
}

export async function readDeployment(core: Pick<CoreApi, "blockrOption">): Promise<Deployment> {
  const [baseUrl, api, key, models, keySecret] = await Promise.all([
    core.blockrOption("assistant_base_url"),
    core.blockrOption("assistant_api"),
    core.blockrOption("assistant_api_key"),
    core.blockrOption("assistant_models"),
    core.blockrOption("assistant_key_secret"),
  ]);
  return { baseUrl: baseUrlOf(baseUrl), api: apiOf(api), credential: credentialOf(key, keySecretOf(keySecret)), models: modelsOf(models) };
}

function baseUrlOf(sent: Json | undefined): string {
  if (sent === undefined) return OPENAI;
  const url = typeof sent === "string" ? sent.trim() : "";
  if (!isWebUrl(url)) {
    throw new TypeError(`The blockr option assistant_base_url is ${JSON.stringify(sent)}, where it takes the URL that the assistant's calls go to, such as "${OPENAI}".`);
  }
  return url.replace(/\/+$/, "");
}

function apiOf(sent: Json | undefined): string {
  if (sent === undefined) return "openai-responses";
  const api = typeof sent === "string" ? sent.trim() : "";
  if (!APIS.includes(api)) {
    throw new TypeError(
      `The blockr option assistant_api is ${JSON.stringify(sent)}, where it takes the API that the base URL speaks: "openai-responses", "openai-completions" or "anthropic-messages".`,
    );
  }
  return api;
}

function credentialOf(sent: Json | undefined, keySecret: string | undefined): Credential {
  if (sent === undefined) return keySecret === undefined ? { kind: "visitor" } : { kind: "visitor", keySecret };
  const key = typeof sent === "string" ? sent.trim() : "";
  if (key === "") {
    throw new TypeError(
      `The blockr option assistant_api_key holds ${kindOf(sent)}, where it takes the deployment's key as a string, or "none" for a base URL that needs no key.`,
    );
  }
  return key === "none" ? { kind: "none" } : { kind: "deployment", key };
}

// A secret that the option does not take fails the read even where the
// deployment sets a key, which leaves the secret unused.
function keySecretOf(sent: Json | undefined): string | undefined {
  if (sent === undefined) return undefined;
  const secret = typeof sent === "string" ? sent.trim() : "";
  if (secret === "") {
    throw new TypeError(
      `The blockr option assistant_key_secret holds ${kindOf(sent)}, where it takes the secret with which the browser keeps a visitor's key, as a string.`,
    );
  }
  return secret;
}

function modelsOf(sent: Json | undefined): readonly string[] | undefined {
  if (sent === undefined) return undefined;
  const ids = typeof sent === "string" ? sent.split(",") : Array.isArray(sent) && sent.every((id) => typeof id === "string") ? sent : [];
  const named = [...new Set(ids.map((id) => id.trim()).filter((id) => id !== ""))];
  if (named.length === 0) {
    throw new TypeError(
      `The blockr option assistant_models is ${JSON.stringify(sent)}, where it takes the ids of the models offered, the first being the default, as an array of strings or as one string that separates them by commas, such as "gpt-5.4,gpt-5.4-nano".`,
    );
  }
  return named;
}

// Whether the text is the URL of a page on the web, over HTTPS or HTTP.
function isWebUrl(text: string): boolean {
  try {
    const { protocol } = new URL(text);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

// What a value that R sent is, without the value itself.
function kindOf(sent: Json): string {
  if (sent === null) return "null";
  if (typeof sent === "string") return "an empty string";
  if (typeof sent === "boolean") return "true or false";
  if (typeof sent === "number") return "a number";
  return Array.isArray(sent) ? "an array" : "an object";
}
