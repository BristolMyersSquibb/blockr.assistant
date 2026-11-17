// The links in the chat's text, which open in a tab of their own, so that the
// page, which may hold a board that is not saved, stays as it is.
// A link that leads to another site opens only after a dialog, as in today's
// chat (shinychat's ExternalLinkDialog.tsx at 6cb1417)
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-message-field-and-a-turn):
// - "Open Link" opens it, and "Cancel" leaves it.
// - "Always open external links" opens it, and every later one without the
//   dialog, until the page reloads.
// The dialog opens in the browser's top layer, through showModal(), and sits
// in the chat's element, as the panel's contract asks
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.2.4#a-plugins-panel).

import { useEffect, useRef } from "react";
import type { ReactElement, ReactNode } from "react";
import { useChatActions } from "./context.ts";

// Whether the user chose to open every link without the dialog, which holds
// until the page reloads.
let always = false;

// Whether a link leads to a site other than the page's own.
export function leavesSite(href: string, page: string): boolean {
  try {
    const url = new URL(href, page);
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin !== new URL(page).origin;
  } catch {
    return false;
  }
}

// A link in the chat's text, as Markdown gives it.
export function TextLink({ href, title, children }: { readonly href?: string | undefined; readonly title?: string | undefined; readonly children?: ReactNode }): ReactElement {
  const { openLink } = useChatActions();
  return (
    <a
      href={href}
      title={title}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => {
        if (href === undefined || always || !leavesSite(href, globalThis.location.href)) return;
        event.preventDefault();
        openLink(href);
      }}
    >
      {children}
    </a>
  );
}

// The dialog before a link opens another site, open while `url` names the
// link, which calls onClose() as it closes.
export function LinkDialog({ url, onClose }: { readonly url: string | undefined; readonly onClose: () => void }): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);

  // The dialog focuses "Open Link" as it opens, as today's does. React
  // focuses an element with autoFocus as it mounts, while the dialog is
  // closed, so the dialog focuses the button itself.
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (url !== undefined && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLButtonElement>(".blockr-assistant-dialog-open")?.focus();
    }
    if (url === undefined && dialog.open) dialog.close();
  }, [url]);

  const open = (remember: boolean): void => {
    if (remember) always = true;
    if (url !== undefined) globalThis.open(url, "_blank", "noopener,noreferrer");
    onClose();
  };

  return (
    <dialog ref={ref} className="blockr-assistant-dialog" aria-labelledby="blockr-assistant-dialog-title" onClose={onClose}>
      <h2 id="blockr-assistant-dialog-title">External Link</h2>
      <p>This link will take you to an external website:</p>
      <p className="blockr-assistant-dialog-url">{url}</p>
      <div className="blockr-assistant-dialog-buttons">
        <button
          type="button"
          className="blockr-assistant-dialog-always"
          onClick={() => {
            open(true);
          }}
        >
          Always open external links
        </button>
        <button
          type="button"
          className="blockr-assistant-dialog-open"
          onClick={() => {
            open(false);
          }}
        >
          Open Link
        </button>
        <button type="button" className="blockr-assistant-dialog-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}
