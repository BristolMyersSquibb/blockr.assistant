// What the chat's buttons give their element beside what core's React SDK
// draws, as blockr.dock's buttons do (srcts/modules/dock/attributes.tsx of
// blockr.dock at 4348cc6).
// The SDK's Button is React Aria's, which leaves out of its element every
// attribute that it does not know, such as `title`, and the SDK's Button
// takes no ref.
// React Aria's `render` draws the element in its place, with the title and
// the ref.
// The chat's buttons keep the browser's tooltip, `title`, until the chat draws
// the SDK's tooltips (BristolMyersSquibb/blockr.assistant#295).
// The footer's button for the drawer takes a ref, since the focus goes back
// to it once the drawer closes (./drawer.tsx).

import type { ComponentProps, ReactElement, Ref, RefCallback, RefObject } from "react";

export interface ButtonAttributes {
  readonly title?: string | undefined;
  // What takes the element, as a ref does.
  readonly ref?: RefObject<HTMLButtonElement | null>;
}

// The `render` of the SDK's Button that draws its element with the title
// given, and hands the element to React Aria's ref and to the ref given.
// A component makes it once where it gives a ref, so that React hands the
// element over once, rather than each time React Aria draws the button again,
// as on a hover.
export function withAttributes({ ref, ...attributes }: ButtonAttributes): (props: ComponentProps<"button">) => ReactElement {
  if (ref === undefined) return (props) => <button {...props} {...attributes} />;
  // The callback that hands the element to both refs, for the ref that React
  // Aria gave last.
  let merged: { readonly own: Ref<HTMLButtonElement> | undefined; readonly set: RefCallback<HTMLButtonElement> } | undefined;
  return ({ ref: own, ...props }) => {
    const set =
      merged !== undefined && merged.own === own
        ? merged.set
        : (el: HTMLButtonElement | null) => {
            const detach = attach(own, el);
            ref.current = el;
            return () => {
              detach();
              ref.current = null;
            };
          };
    merged = { own, set };
    return <button {...props} {...attributes} ref={set} />;
  };
}

// Hands the element to the ref, and returns what takes it back, as React does
// for a ref.
function attach<T>(ref: Ref<T> | undefined, el: T | null): () => void {
  if (typeof ref === "function") {
    const cleanup = ref(el);
    return typeof cleanup === "function"
      ? cleanup
      : () => {
          ref(null);
        };
  }
  if (ref === undefined || ref === null) return () => undefined;
  ref.current = el;
  return () => {
    ref.current = null;
  };
}
