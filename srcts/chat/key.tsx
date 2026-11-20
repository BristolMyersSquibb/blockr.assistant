// The field for the visitor's own key, which the chat shows above the message
// field where the deployment leaves the blockr option assistant_api_key unset
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-credential):
// - Until the visitor gives a key, the field shows, and the message field
//   sends nothing.
// - Where the base URL refused the key, the field shows again, empty, and says
//   so.
// - Where a call got no answer that the page could read, and neither did the
//   base URL's list of models, the field shows again, holding the key, and
//   says that the connection was lost and that the key may be wrong. The
//   message field sends with the key meanwhile, so that the visitor can change
//   the key or send again.
// The field names the host of the base URL, so that the visitor knows whose
// key it takes, and shows the key as dots. The browser takes it for a login
// form, with the host as the user name and the key as the password, so that
// its password manager can save the key, where the visitor lets it, and fill
// it in after a reload or in another tab. The plugin keeps the key in its
// memory, as the visitor gives it. Where the deployment sets the blockr option
// assistant_key_secret, the browser keeps the key as well, and the field's
// note says so, and whether for this app alone or for the apps on the host of
// the app's page (../visitor-key).
//
// Where the base URL is OpenRouter's, the field offers OpenRouter's login, in
// a button above the key (../openrouter):
// - A click opens the login in a window of its own.
// - While the login exchanges the code that OpenRouter sent for the key, the
//   button says so, and takes no click.
// - Where the browser blocked the login's window, or the exchange failed, the
//   note says why, until the visitor clicks again.
// - Once the login gives the key, the field goes, as for a typed key.

import { useId } from "react";
import type { ReactElement, SubmitEvent } from "react";
import type { KeyScope } from "../deployment/index.ts";
import type { OpenRouterLoginState } from "../openrouter/index.ts";
import { useChat, useChatActions } from "./context.ts";
import type { KeyField } from "./context.ts";

export function KeyForm(): ReactElement | null {
  const { keyField } = useChat();
  if (keyField === undefined) return null;
  // The form starts afresh as the reason for asking changes, so that a key
  // that the base URL refused leaves the field empty.
  return <Field key={keyField.state.kind} field={keyField} />;
}

function Field({ field }: { readonly field: KeyField }): ReactElement {
  const { giveKey } = useChatActions();
  const note = useId();
  const { state, openRouterLogin } = field;

  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const given = new FormData(event.currentTarget).get("key");
    const key = typeof given === "string" ? given.trim() : "";
    if (key !== "") giveKey(key);
  };

  return (
    <form className="blockr-assistant-key" data-asks={state.kind} data-openrouter={openRouterLogin?.kind} onSubmit={submit}>
      <p id={note} className="blockr-assistant-key-note" role={alerts(field) ? "alert" : undefined}>
        {noteOf(field)}
      </p>
      {openRouterLogin === undefined ? null : <OpenRouterButton login={openRouterLogin} />}
      <div className="blockr-assistant-key-field">
        <input type="text" name="username" value={field.host} autoComplete="username" readOnly hidden />
        <input
          type="password"
          name="key"
          defaultValue={state.kind === "lost" ? state.key : ""}
          placeholder="API key"
          aria-label="Your API key"
          aria-describedby={note}
          autoComplete="current-password"
          spellCheck={false}
        />
        <button type="submit">Use key</button>
      </div>
    </form>
  );
}

function OpenRouterButton({ login }: { readonly login: OpenRouterLoginState }): ReactElement {
  const { logInWithOpenRouter } = useChatActions();
  const exchanging = login.kind === "exchanging";
  return (
    <button type="button" className="blockr-assistant-openrouter" disabled={exchanging} onClick={logInWithOpenRouter}>
      {exchanging ? "Logging in…" : "Log in with OpenRouter"}
    </button>
  );
}

// Whether the note says that something failed, so that a screen reader reads
// it at once.
function alerts({ state, openRouterLogin }: KeyField): boolean {
  return state.kind !== "missing" || openRouterLogin?.kind === "blocked" || openRouterLogin?.kind === "failed";
}

// What the field says of why the chat asks for a key, or of why OpenRouter's
// login failed.
export function noteOf({ state, host, kept, appHost, openRouterLogin }: KeyField): string {
  if (openRouterLogin?.kind === "blocked") return "The browser blocked the login's window. Allow pop-ups for this page, or enter your API key.";
  if (openRouterLogin?.kind === "failed") return `${openRouterLogin.reason} Log in again, or enter your API key.`;
  switch (state.kind) {
    case "missing":
      return openRouterLogin === undefined
        ? `Enter your API key for ${host}. ${keepsOf(kept, appHost, "it")}`
        : `Log in with OpenRouter, or enter your API key for ${host}. ${keepsOf(kept, appHost, "the key")}`;
    case "refused":
      return openRouterLogin === undefined
        ? `The server at ${host} refused your key. Enter another one.`
        : `The server at ${host} refused your key. Log in with OpenRouter, or enter another key.`;
    case "lost":
      return `The connection to ${host} was lost, and your key may be wrong. Change it, or send your message again.`;
  }
}

// What the note says of who keeps the key, which it names by the words given.
function keepsOf(kept: KeyScope | undefined, appHost: string, key: string): string {
  if (kept === undefined) return `The assistant keeps ${key} only until the page reloads.`;
  return kept === "app" ? `The browser keeps ${key} for this app.` : `The browser keeps ${key} for the apps on ${appHost}.`;
}
