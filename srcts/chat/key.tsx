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
// key it takes. It shows the key as dots, and asks the browser to fill in
// nothing. The key goes to the plugin's memory alone, as the visitor gives it
// (../visitor-key).

import { useId } from "react";
import type { ReactElement, SubmitEvent } from "react";
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
  const { state } = field;

  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const given = new FormData(event.currentTarget).get("key");
    const key = typeof given === "string" ? given.trim() : "";
    if (key !== "") giveKey(key);
  };

  return (
    <form className="blockr-assistant-key" data-asks={state.kind} onSubmit={submit}>
      <p id={note} className="blockr-assistant-key-note" role={state.kind === "missing" ? undefined : "alert"}>
        {noteOf(field)}
      </p>
      <div className="blockr-assistant-key-field">
        <input
          type="password"
          name="key"
          defaultValue={state.kind === "lost" ? state.key : ""}
          placeholder="API key"
          aria-label="Your API key"
          aria-describedby={note}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit">Use key</button>
      </div>
    </form>
  );
}

// What the field says of why the chat asks for a key.
export function noteOf({ state, host }: KeyField): string {
  switch (state.kind) {
    case "missing":
      return `Enter your API key for ${host}. The assistant keeps it only until the page reloads.`;
    case "refused":
      return `The server at ${host} refused your key. Enter another one.`;
    case "lost":
      return `The connection to ${host} was lost, and your key may be wrong. Change it, or send your message again.`;
  }
}
