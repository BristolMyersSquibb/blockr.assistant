// An error, or a warning, that the assistant raises from start through
// notify(), naming its class's id, so that it holds once the panel closes,
// which holds one notification of its code at a time
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#what-fails).
// Core gives each notification that a plugin raises an id of its own, so two
// raises of one code would be two notifications. Each raise therefore
// withdraws the notification that the one before raised.
// Core withdraws the notification as the next board opens, after which the
// error raises nothing more.

import type { CoreApi } from "@blockr/core";
import { assistantClassId } from "../state/index.ts";

export interface HeldError {
  // Raises the error with the message given, in place of the one that it
  // raised before.
  raise(message: string): void;
  // Withdraws the error, where it holds one.
  withdraw(): void;
}

export function heldError(
  core: { readonly notifications: Pick<CoreApi["notifications"], "notify">; readonly id: CoreApi["id"] },
  signal: AbortSignal,
  code: string,
  severity: "error" | "warning" = "error",
): HeldError {
  let withdraw: (() => void) | undefined;
  signal.addEventListener(
    "abort",
    () => {
      withdraw = undefined;
    },
    { once: true },
  );

  return {
    raise(message) {
      if (signal.aborted) return;
      withdraw?.();
      withdraw = core.notifications.notify(assistantClassId(core), { severity, code, message });
    },
    withdraw() {
      withdraw?.();
      withdraw = undefined;
    },
  };
}
