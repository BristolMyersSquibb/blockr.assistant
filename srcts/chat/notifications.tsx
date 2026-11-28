// The notifications about the plugin that hold, which the chat shows above
// the message field, so that the user reads why where they would send
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#what-fails):
// - The chat shows every notification about the plugin, whoever raised it.
//   Those are what the plugin raises from start, such as
//   assistant_call_failed (../notifications), and what core and R raise about
//   the plugin. The chat reads them through the React SDK's useNotified(),
//   given the plugin
//   (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.1.14#where-a-notification-shows).
// - They show in the order they came, each until core withdraws it.
// - Each shows its message as text, without the ANSI escapes that a
//   condition's message holds where R runs with colours on, as cli styles it
//   there.
// - A screen reader reads each notification as it comes.
// A failure that ends a turn shows at that turn in the transcript too
// (./transcript.tsx). The frontend tells the user that a notification holds
// while the chat is collapsed or hidden, as the dock does with a dot on the
// panel's tab, so the chat draws nothing for that.

import type { CoreApi } from "@blockr/core";
import { useNotified } from "@blockr/core/react";
import type { ReactElement } from "react";
import { assistantClassId } from "../state/index.ts";

export function Notifications({ core }: { readonly core: CoreApi }): ReactElement {
  // Core gives the same id of the class each time, which useNotified()
  // compares by ===.
  const notifications = useNotified(core, { plugin: assistantClassId(core) });
  // The region stays in the page while no notification holds, so that a
  // screen reader hears the first one that comes.
  return (
    <div className="blockr-assistant-notifications" aria-live="polite">
      {notifications.length === 0 ? null : (
        <ul aria-label="Notifications">
          {notifications.map(({ id, severity, message }) => (
            <li key={id} className="blockr-assistant-notification" data-severity={severity}>
              {plainText(message)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The ANSI escapes that a message may hold:
// - Control sequences, which open with ESC and "[" or with the one-byte CSI,
//   as cli's colours and styles do.
// - Operating system commands, which open with ESC and "]" and end with BEL or
//   with ESC and "\", as cli's hyperlinks do.
// eslint-disable-next-line no-control-regex -- ANSI escapes open with the control characters ESC and CSI.
const ANSI = /(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;

// A message as the chat shows it: the text alone, without ANSI escapes.
function plainText(message: string): string {
  return message.replace(ANSI, "");
}
