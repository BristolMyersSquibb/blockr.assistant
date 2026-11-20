// The links in the chat's text, which open in a tab of their own, so that the
// page, which may hold a board that is not saved, stays as it is.
// A link that leads to another site opens only after a dialog, as in today's
// chat (shinychat's ExternalLinkDialog.tsx at 6cb1417)
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-message-field-and-a-turn):
// - "Open Link" opens it, and "Cancel" leaves it.
// - "Always open external links" opens it, and every later one without the
//   dialog, until the page reloads.
// The dialog is the modal of core's React SDK, which React Aria draws in a
// portal at the end of the page's body, as every overlay of the chat is
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.2.4#a-plugins-panel).
// It takes the focus to "Open Link" as it opens, as today's dialog does, and
// gives the focus back to where it was as it closes.
// It closes on Escape, which stops no turn, since the modal takes the key
// (./chat.tsx).

import type { ReactElement, ReactNode } from "react";
import { Button, Dialog, Heading, Modal } from "@blockr/core/react";
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
export function LinkDialog({ url, onClose }: { readonly url: string | undefined; readonly onClose: () => void }): ReactElement | null {
  if (url === undefined) return null;

  const open = (remember: boolean): void => {
    if (remember) always = true;
    globalThis.open(url, "_blank", "noopener,noreferrer");
    onClose();
  };

  return (
    <Modal
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      className="blockr-assistant-overlay blockr-assistant-dialog"
    >
      <Dialog>
        <Heading slot="title" level={2}>
          External Link
        </Heading>
        <p>This link will take you to an external website:</p>
        <p className="blockr-assistant-dialog-url">{url}</p>
        <div className="blockr-assistant-dialog-buttons">
          <Button
            variant="quiet"
            className="blockr-assistant-dialog-always"
            onPress={() => {
              open(true);
            }}
          >
            Always open external links
          </Button>
          <Button
            variant="primary"
            className="blockr-assistant-dialog-open"
            autoFocus
            onPress={() => {
              open(false);
            }}
          >
            Open Link
          </Button>
          <Button variant="secondary" className="blockr-assistant-dialog-cancel" onPress={onClose}>
            Cancel
          </Button>
        </div>
      </Dialog>
    </Modal>
  );
}
