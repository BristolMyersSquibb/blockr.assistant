// Pi's code for OpenAI's Chat Completions API, with OpenAI's SDK, which the
// loop's calls take where the deployment's API is "openai-completions"
// (./apis.ts).
// The build bundles it, minified, into a file of its own,
// api-openai-completions-<hash>.js, which the page imports only for that API
// (../build/build.ts).

export { stream, streamSimple } from "@earendil-works/pi-ai/api/openai-completions";
