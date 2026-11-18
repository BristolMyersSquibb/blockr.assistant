// The script of the page that the login calls back, ./login.html, which the
// build writes beside the plugin's module, where R serves it with the module
// (../build). The service of the login sends the login's window to this page,
// with the code and the state in its query, once the visitor has authorized
// the app (./login.ts).
// The script posts the code and the state on the channel of ./channel.ts,
// where the page that started the login takes them, and then closes the
// window. Where the window stays open, the page says that the visitor can
// close it.
// Where the query holds no code, as after the visitor denied the app, the
// script posts nothing. The page then says that the login did not finish.
// The page holds no inline script, so that it works under a content security
// policy that allows only the scripts of the app's own origin.

import { CHANNEL } from "./channel.ts";
import type { Callback } from "./channel.ts";

const query = new URLSearchParams(location.search);
const code = query.get("code");
const state = query.get("state");
const note = document.getElementById("note");

if (code !== null && code !== "" && state !== null && state !== "") {
  new BroadcastChannel(CHANNEL).postMessage({ code, state } satisfies Callback);
  if (note !== null) note.textContent = "The assistant finishes the login. You can close this window.";
  window.close();
} else if (note !== null) {
  note.textContent = "The login did not finish. You can close this window, and log in again from the app.";
}
