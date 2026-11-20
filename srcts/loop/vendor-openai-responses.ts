// Pi's code for OpenAI's Responses API, with OpenAI's SDK, which the loop's
// calls take where the deployment's API is "openai-responses" (./apis.ts).
// The build bundles it, minified, into a file of its own,
// api-openai-responses-<hash>.js, which the page imports only for that API
// (../build/build.ts).

export { stream, streamSimple } from "@earendil-works/pi-ai/api/openai-responses";
