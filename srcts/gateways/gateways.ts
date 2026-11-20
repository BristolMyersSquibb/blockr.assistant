// What the assistant knows of the answer of a gateway to a page's preflight,
// beside pi's catalogs of the gateways' models (../loop/catalogs.ts).
// Vercel's AI Gateway answers a page's preflight with the headers that it
// allows, and the browser sends no request that carries another
// (blockr.assistant#299). The gateway does not allow these headers:
// - Those by which the SDKs that pi calls describe themselves, whose names
//   start with x-stainless-.
// - The User-Agent that pi and Anthropic's SDK set, which Firefox sends,
//   while Chrome drops it.
// - Anthropic's opt-in header, anthropic-dangerous-direct-browser-access.
// So each request to the gateway leaves them out: the loop's calls (../loop)
// and the plugin's own request for the list of models (../models).
// Anthropic's own API needs its opt-in header from a page, and the answers of
// OpenAI, Anthropic and OpenRouter allow the other headers, so each request
// to another base URL keeps them.

// The host of Vercel's AI Gateway, whose base URL for OpenAI's APIs is
// https://ai-gateway.vercel.sh/v1, and for Anthropic's
// https://ai-gateway.vercel.sh.
const VERCEL_AI_GATEWAY = "ai-gateway.vercel.sh";

// The headers that the gateway's answer to a page's preflight does not allow,
// by their names in lower case, besides those whose names start with
// x-stainless-.
const REFUSED: ReadonlySet<string> = new Set(["anthropic-dangerous-direct-browser-access", "user-agent"]);

// Whether the answer of the base URL to a page's preflight refuses the header
// of the name given, so that a page's request there leaves it out. It
// compares names in lower case, as HTTP does, since Anthropic's SDK writes
// X-Stainless-OS where OpenAI's writes x-stainless-os.
export function refusesHeader(baseUrl: string, name: string): boolean {
  if (hostOf(baseUrl) !== VERCEL_AI_GATEWAY) return false;
  const lower = name.toLowerCase();
  return lower.startsWith("x-stainless-") || REFUSED.has(lower);
}

// The host of the base URL, or undefined where it is no URL.
function hostOf(baseUrl: string): string | undefined {
  try {
    return new URL(baseUrl).host;
  } catch {
    return undefined;
  }
}
