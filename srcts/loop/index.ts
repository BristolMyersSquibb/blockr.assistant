// The loop, the one module through which the plugin reaches pi, which runs a
// turn with the tools and the hooks, so that a move to the AI SDK rewrites
// this module alone (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4#proposal).
// Its catalogs give the model of each call and the thinking levels that the
// model takes.

export { createCatalogs, loadCatalogs, PROVIDER } from "./catalogs.ts";
export type { CallModel, CatalogParts, Catalogs, ModelAt } from "./catalogs.ts";
export { createLoop, loadLoop } from "./loop.ts";
export type { Call, CallAnswer, Connection, Handlers, Loop, ModelCall, ModelReply, Pi, Streamed, Turn } from "./loop.ts";
export { ENDED, STOPPED, SUMMARY_PREFIX, SUMMARY_SUFFIX } from "./messages.ts";
export type { Answered, CarriedFile } from "./messages.ts";
