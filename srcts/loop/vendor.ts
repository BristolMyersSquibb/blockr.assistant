// The parts of pi that the loop uses (./loop.ts): the agent loop of
// pi-agent-core, the models and providers of pi-ai, the three APIs that the
// assistant speaks, pi's catalogs of OpenAI's and Anthropic's models, and
// pi-ai's test of whether a call failed as the conversation outgrew the
// model's context window.
// The build bundles them, minified, into a file of their own, pi-<hash>.js,
// which the loop imports by that name as the page prepares its first call
// (../turns/prepare.ts, ../build/build.ts).
// So the assistant's own bundle holds the plugin's code alone, and a page
// that prepares no call loads no pi
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4#proposal).
// The models come through the subpath that pi names for bundles, since pi's
// root entry point breaks a bundle with "ModelsImpl is not a constructor".

export { runAgentLoopContinue } from "@earendil-works/pi-agent-core";
export { createModels, createProvider } from "@earendil-works/pi-ai/models";
export * as anthropicMessages from "@earendil-works/pi-ai/api/anthropic-messages";
export * as openaiCompletions from "@earendil-works/pi-ai/api/openai-completions";
export * as openaiResponses from "@earendil-works/pi-ai/api/openai-responses";
export { ANTHROPIC_MODELS } from "@earendil-works/pi-ai/providers/anthropic.models";
export { OPENAI_MODELS } from "@earendil-works/pi-ai/providers/openai.models";
export { isContextOverflow } from "@earendil-works/pi-ai/utils/overflow";
