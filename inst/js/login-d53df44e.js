// srcts/login/channel.ts
var CHANNEL = "blockr.assistant-login";

// srcts/login/callback.ts
var query = new URLSearchParams(location.search);
var code = query.get("code");
var state = query.get("state");
var note = document.getElementById("note");
if (code !== null && code !== "" && state !== null && state !== "") {
  new BroadcastChannel(CHANNEL).postMessage({ code, state });
  if (note !== null) note.textContent = "The assistant finishes the login. You can close this window.";
  window.close();
} else if (note !== null) {
  note.textContent = "The login did not finish. You can close this window, and log in again from the app.";
}
