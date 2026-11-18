// The parts of pi that the catalogs read (./catalogs.ts): pi's catalogs of
// OpenAI's and of Anthropic's models, and pi-ai's two functions of the
// thinking levels that a model takes.
// The build bundles them, minified, into a file of their own,
// catalogs-<hash>.js, which a few KB hold, where pi's bundle takes 179 KB
// gzipped (../build/build.ts). The chat imports the file as it first mounts,
// so that the footer knows the levels of each model as it first draws, and
// the page imports it as it prepares its first call.

export { clampThinkingLevel, getSupportedThinkingLevels } from "@earendil-works/pi-ai/models";
export { ANTHROPIC_MODELS } from "@earendil-works/pi-ai/providers/anthropic.models";
export { OPENAI_MODELS } from "@earendil-works/pi-ai/providers/openai.models";
