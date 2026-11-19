// The parts of pi that the loop uses (./loop.ts): the agent loop of
// pi-agent-core, the models and providers of pi-ai, the three APIs that the
// assistant speaks, pi's catalogs of OpenAI's and Anthropic's models with
// pi-ai's two functions of the thinking levels that a model takes, and
// pi-ai's test of whether a call failed as the conversation outgrew the
// model's context window.
// The build bundles them, minified, into a file of their own, pi-<hash>.js
// (../build/build.ts), which the browser imports once, as the chat first
// mounts, so that the footer knows the levels of each model as it first draws
// (./catalogs.ts). The calls take it from there (../turns/prepare.ts).
// So the assistant's own bundle holds the plugin's code alone, and a page
// that never shows the chat loads no pi
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4#proposal).
// The catalogs of the gateways' models load in files of their own, where the
// base URL is the gateway's (./vendor-openrouter.ts, ./vendor-vercel.ts).
// The models come through the subpath that pi names for bundles, since pi's
// root entry point breaks a bundle with "ModelsImpl is not a constructor".

export { runAgentLoopContinue } from "@earendil-works/pi-agent-core";
export { clampThinkingLevel, createModels, createProvider, getSupportedThinkingLevels } from "@earendil-works/pi-ai/models";
export * as anthropicMessages from "@earendil-works/pi-ai/api/anthropic-messages";
export * as openaiCompletions from "@earendil-works/pi-ai/api/openai-completions";
export * as openaiResponses from "@earendil-works/pi-ai/api/openai-responses";
export { ANTHROPIC_MODELS } from "@earendil-works/pi-ai/providers/anthropic.models";
export { OPENAI_MODELS } from "@earendil-works/pi-ai/providers/openai.models";
export { isContextOverflow } from "@earendil-works/pi-ai/utils/overflow";
