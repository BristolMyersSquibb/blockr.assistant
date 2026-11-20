// Pi's code for Anthropic's Messages API, with Anthropic's SDK, which the
// loop's calls take where the deployment's API is "anthropic-messages"
// (./apis.ts).
// The build bundles it, minified, into a file of its own,
// api-anthropic-messages-<hash>.js, which the page imports only for that API
// (../build/build.ts).

export { stream, streamSimple } from "@earendil-works/pi-ai/api/anthropic-messages";
