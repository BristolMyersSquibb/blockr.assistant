// Pi's catalog of OpenRouter's models, which the catalogs read where the base
// URL is OpenRouter's (./catalogs.ts).
// The build bundles it, minified, into a file of its own,
// catalog-openrouter-<hash>.js, which the page imports only where the base
// URL is OpenRouter's (../build/build.ts).

export { OPENROUTER_MODELS } from "@earendil-works/pi-ai/providers/openrouter.models";
