// The base URL's list of models, which the assistant asks for where the
// deployment names no models, and the models of it that take tools
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.1#who-picks-the-model).
// - The list is where the SDK of each API finds it. For OpenAI's two APIs, it
//   is at /models after the base URL, as at https://api.openai.com/v1/models.
//   For Anthropic's, it is at /v1/models, as at
//   https://api.anthropic.com/v1/models, since Anthropic's SDK appends /v1
//   itself. A request to Anthropic's list asks for up to 1,000 models,
//   Anthropic's most, and carries the header by which a page opts in.
// - The key goes as the calls of the API carry it: in Authorization for
//   OpenAI's APIs, and in x-api-key for Anthropic's. Without a key, the
//   request carries neither header.
// - The list keeps its order, so that the first model kept is the default.
//
// A model of the list takes tools where the list says so, in these steps:
// 1. An entry whose type names a kind of model that takes no tools, as
//    Vercel's "embedding" or "realtime" do, drops its model.
// 2. An entry whose endpoints name no path of the calls' API, as those of
//    OpenRouter's models whose ids end in ":batch" do, drops its model. A path
//    names the API where it ends in the API's own path, such as
//    /api/v1/chat/completions for Chat Completions, so that a proxy that
//    passes OpenRouter's list on under a path of its own keeps its models.
// 3. An entry that names its supported_parameters or its tags, as
//    OpenRouter's and Vercel's do, keeps its model only where the parameters
//    hold "tools" or the tags hold "tool-use".
// 4. An entry that says nothing of what its model takes, as OpenAI's,
//    Anthropic's or a proxy's, keeps its model unless a word of the model's
//    id names a kind of model that takes no tools, as "tts" does in
//    "gpt-4o-mini-tts". Anthropic's capabilities name no tool use, since
//    every model of Anthropic's API takes tools.

import type { Deployment } from "../deployment/index.ts";

// The words that name a kind of model that takes no tools, in a model's id or
// in the type of its entry.
const NO_TOOLS: ReadonlySet<string> = new Set([
  "audio",
  "babbage",
  "dall",
  "davinci",
  "embedding",
  "evaluation",
  "image",
  "instruct",
  "live",
  "moderation",
  "realtime",
  "reranking",
  "search",
  "sora",
  "speech",
  "transcribe",
  "transcription",
  "tts",
  "video",
  "whisper",
]);

// The path of each API's calls, as its SDK appends it to the base URL.
const CALLS: Readonly<Record<string, string>> = {
  "openai-responses": "/responses",
  "openai-completions": "/chat/completions",
  "anthropic-messages": "/v1/messages",
};

// The answer to the request for the list: the models of the list that take
// tools, or why the assistant offers none. A list that the base URL refuses
// for its key is refused, and any other answer that leaves no model to offer
// failed.
type Listed = { readonly kind: "listed"; readonly models: readonly string[] } | { readonly kind: "refused" | "failed"; readonly message: string };

export type Fetch = (input: string, init: RequestInit) => Promise<Response>;

// Asks the base URL for its list of models, with the key given, or with none.
// It never rejects: where the signal aborts, it resolves as the list failed.
export async function askList(deployment: Deployment, key: string | undefined, fetch: Fetch, signal: AbortSignal): Promise<Listed> {
  const url = listUrl(deployment);
  const none = (why: string): Listed => ({ kind: "failed", message: `The assistant offers no model, since ${why}` });

  let response: Response;
  try {
    response = await fetch(url, { headers: listHeaders(deployment.api, key), signal });
  } catch (error) {
    return none(`it could not reach the list of models at ${url}: ${messageOf(error)}`);
  }

  if (response.status === 401 || response.status === 403) {
    return { kind: "refused", message: `The base URL refused the assistant's key for its list of models at ${url}: it answered ${await answerOf(response)}.` };
  }
  if (!response.ok) {
    return none(`the base URL gives no list of models at ${url}: it answered ${await answerOf(response)}. An app on such a base URL names its models in the blockr option assistant_models.`);
  }

  let entries: unknown;
  try {
    const body: unknown = await response.json();
    entries = isRecord(body) ? body.data : undefined;
  } catch (error) {
    return none(`the answer at ${url} is no list of models: ${messageOf(error)}`);
  }
  if (!Array.isArray(entries)) {
    return none(`the answer at ${url} holds no list of models in its data. An app on such a base URL names its models in the blockr option assistant_models.`);
  }

  const models = toolModels(entries, deployment.api);
  if (models.length === 0) {
    return none(`the list of models at ${url} holds none that takes tools. An app on such a base URL names its models in the blockr option assistant_models.`);
  }
  return { kind: "listed", models };
}

// The ids of the models of the list's entries that take tools, in the list's
// order, where the calls speak the API given.
export function toolModels(entries: readonly unknown[], api: string): string[] {
  const kept = new Set<string>();
  for (const entry of entries) {
    if (isRecord(entry) && typeof entry.id === "string" && entry.id !== "" && takesTools(entry, entry.id, api)) kept.add(entry.id);
  }
  return [...kept];
}

function takesTools(entry: Readonly<Record<string, unknown>>, id: string, api: string): boolean {
  if (typeof entry.type === "string" && NO_TOOLS.has(entry.type)) return false;
  const path = CALLS[api] ?? "";
  if (Array.isArray(entry.endpoints) && !entry.endpoints.some((endpoint) => typeof endpoint === "string" && endpoint.endsWith(path))) return false;
  const parameters = Array.isArray(entry.supported_parameters) ? entry.supported_parameters : undefined;
  const tags = Array.isArray(entry.tags) ? entry.tags : undefined;
  if (parameters !== undefined || tags !== undefined) {
    return (parameters?.includes("tools") ?? false) || (tags?.includes("tool-use") ?? false);
  }
  return !id
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((word) => NO_TOOLS.has(word));
}

// Where the base URL gives its list of models, as the SDK of its API finds it.
export function listUrl(deployment: Pick<Deployment, "baseUrl" | "api">): string {
  return deployment.api === "anthropic-messages" ? `${deployment.baseUrl}/v1/models?limit=1000` : `${deployment.baseUrl}/models`;
}

function listHeaders(api: string, key: string | undefined): Record<string, string> {
  if (api === "anthropic-messages") {
    return {
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      ...(key === undefined ? {} : { "x-api-key": key }),
    };
  }
  return key === undefined ? {} : { authorization: `Bearer ${key}` };
}

// The status of a response that failed, with the message of the error that
// its body gives, as OpenAI's, Anthropic's and OpenRouter's give it in
// error.message.
async function answerOf(response: Response): Promise<string> {
  let message: unknown;
  try {
    const body: unknown = await response.json();
    message = isRecord(body) && isRecord(body.error) ? body.error.message : undefined;
  } catch {
    message = undefined;
  }
  return typeof message === "string" && message !== "" ? `${String(response.status)}, "${message}"` : String(response.status);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
