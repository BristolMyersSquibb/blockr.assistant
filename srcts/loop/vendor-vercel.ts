// Pi's catalog of the models of Vercel's AI Gateway, which the catalogs read
// where the base URL is the gateway's (./catalogs.ts).
// The build bundles it, minified, into a file of its own,
// catalog-vercel-<hash>.js, which the page imports only where the base URL is
// the gateway's (../build/build.ts).

export { VERCEL_AI_GATEWAY_MODELS } from "@earendil-works/pi-ai/providers/vercel-ai-gateway.models";
