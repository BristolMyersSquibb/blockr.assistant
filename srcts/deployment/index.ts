// What a deployment chooses through the assistant's blockr options: where the
// calls go, how they are authenticated, which models it offers, and whether
// the browser keeps the visitor's key, and for whom.

export { readDeployment } from "./deployment.ts";
export type { Credential, Deployment, Keeping, KeyScope } from "./deployment.ts";
