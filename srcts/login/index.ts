// The login with a service that offers one to a web page, OpenRouter, which
// gives the visitor's key.

export { authUrlOf, challengeOf, createLogin, loginOf, OPENROUTER } from "./login.ts";
export type { Login, LoginOptions, LoginService, LoginState, OpenWindow } from "./login.ts";
export { CHANNEL } from "./channel.ts";
export type { Callback } from "./channel.ts";
