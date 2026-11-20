// The APIs: pi's code for each of the three APIs that the assistant speaks,
// by pi's name for each, which the loop's calls take
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.1#where-the-calls-go).
// A deployment sends every call to one base URL, in the one API that the
// blockr option assistant_api names. So the code of each API loads in a file
// of its own (./vendor-anthropic-messages.ts, ./vendor-openai-completions.ts,
// ./vendor-openai-responses.ts), and the page loads that of the deployment's
// API alone (blockr.assistant#299).
// The chat has the page start to import the code of the deployment's API once
// the assistant has read the deployment, so that the first call need not wait
// for it (../chat/panel.tsx). The calls take it from there (./loop.ts), since
// the browser imports each file once for the page, and an import of a file
// that is still loading waits for that load.

import type { ProviderStreams } from "@earendil-works/pi-ai";

// The import of pi's code for each API that the assistant speaks, by pi's
// name for the API.
const APIS: ReadonlyMap<string, () => Promise<ProviderStreams>> = new Map<string, () => Promise<ProviderStreams>>([
  ["anthropic-messages", () => import("./vendor-anthropic-messages.ts")],
  ["openai-completions", () => import("./vendor-openai-completions.ts")],
  ["openai-responses", () => import("./vendor-openai-responses.ts")],
]);

// Pi's code for the API, by pi's name for it. It rejects for an API that the
// assistant does not speak.
export function loadApi(api: string): Promise<ProviderStreams> {
  const load = APIS.get(api);
  return load === undefined ? Promise.reject(new Error(`The assistant speaks no API named ${JSON.stringify(api)}.`)) : load();
}

// Has the page start to import pi's code for the API, which the calls then
// take. Where it fails, the calls fail as they load it.
export function preloadApi(api: string): void {
  loadApi(api).catch(() => undefined);
}
