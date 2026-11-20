// The panel of the assistant's chat, which the class's `ui` renders in the
// element that a frontend gives mountPlugin(), in React, on the one copy of
// React that core puts on the page, in a root of its own
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-panel):
// 1. The panel draws its root before render() returns. The root fills the
//    element, and the chat sizes itself from it, as a container.
// 2. It waits for the assistant of the open board, which the class's start
//    opens, and for the chat's libraries, which the page imports as the chat
//    first mounts (./libraries.ts).
// 3. It has the page start to import pi's bundle as it draws its root, beside
//    the libraries, since the bundle holds pi's catalogs (../loop). Once the
//    assistant has read the deployment's base URL, it has the assistant load
//    the catalogs, and waits until they have loaded, or failed to, so that the
//    footer knows the thinking levels of each model as it first draws
//    (../thinking-levels).
// 4. Once the assistant has read the deployment, the panel also has the page
//    start to import pi's code for the deployment's API, which the calls
//    take, so that the first call need not wait for it. The panel does not
//    wait for that code.
// 5. Then it draws the chat. As the next board opens, it draws the chat again
//    for that board's assistant.
// Where the libraries fail to load, the panel says so and logs why.

import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { CoreApi } from "@blockr/core";
import { assistantOf, nextAssistant } from "../assistant/index.ts";
import type { Assistant } from "../assistant/index.ts";
import { preloadApi, preloadCatalogs } from "../loop/index.ts";
import { Chat } from "./chat.tsx";
import { librariesLoaded, loadLibraries } from "./libraries.ts";

// Draws the chat in the element, and gives the function that removes it.
export function renderChat({ el, core }: { readonly el: HTMLElement; readonly core: CoreApi }): () => void {
  preloadCatalogs();
  const root = createRoot(el);
  flushSync(() => {
    root.render(<Panel core={core} />);
  });
  return () => {
    root.unmount();
  };
}

function Panel({ core }: { readonly core: CoreApi }): ReactElement {
  const assistant = useAssistant(core);
  const loaded = useLibraries(core);
  const levels = useThinkingLevels(assistant);
  usePreloadedApi(assistant);
  return (
    <div className="blockr-assistant">
      {loaded === "failed" ? (
        <p className="blockr-assistant-unloaded">The chat could not load. Reload the page to try again.</p>
      ) : loaded && levels && assistant !== undefined ? (
        <Chat key={assistantKey(assistant)} core={core} assistant={assistant} />
      ) : null}
    </div>
  );
}

// The assistant of the board that the CoreApi has open, once the class's
// start has opened it, and undefined while the panel waits for it.
function useAssistant(core: CoreApi): Assistant | undefined {
  const [assistant, setAssistant] = useState(() => open(assistantOf(core)));

  useEffect(() => {
    if (assistant !== undefined && !assistant.signal.aborted) {
      const closed = (): void => {
        setAssistant(undefined);
      };
      assistant.signal.addEventListener("abort", closed, { once: true });
      return () => {
        assistant.signal.removeEventListener("abort", closed);
      };
    }
    let live = true;
    void nextAssistant(core).then((next) => {
      if (live) setAssistant(next);
    });
    return () => {
      live = false;
    };
  }, [assistant, core]);

  return open(assistant);
}

// Whether the chat's libraries have loaded, or "failed".
function useLibraries(core: CoreApi): boolean | "failed" {
  const [loaded, setLoaded] = useState<boolean | "failed">(librariesLoaded);

  useEffect(() => {
    if (loaded !== false) return;
    let live = true;
    loadLibraries().then(
      () => {
        if (live) setLoaded(true);
      },
      (error: unknown) => {
        core.log("blockr.assistant").error(new Error(`The assistant's chat could not load its libraries: ${String(error)}`, { cause: error }));
        if (live) setLoaded("failed");
      },
    );
    return () => {
      live = false;
    };
  }, [core, loaded]);

  return loaded;
}

// Whether the thinking levels of the assistant given have loaded the catalogs,
// or failed to.
function useThinkingLevels(assistant: Assistant | undefined): boolean {
  const [, setLoaded] = useState<Assistant | undefined>(undefined);
  const done = assistant !== undefined && levelsLoaded.has(assistant);

  useEffect(() => {
    if (assistant === undefined || done) return;
    let live = true;
    void assistant.thinkingLevels.load().then(() => {
      levelsLoaded.add(assistant);
      if (live) setLoaded(assistant);
    });
    return () => {
      live = false;
    };
  }, [assistant, done]);

  return done;
}

// The assistants whose thinking levels have loaded the catalogs, or failed to,
// so that a mount of the chat again draws it at once.
const levelsLoaded = new WeakSet<Assistant>();

// Has the page start to import pi's code for the API of the assistant's
// deployment, once the assistant has read the deployment. Where the
// deployment's options cannot be read, the turns report why as each starts.
function usePreloadedApi(assistant: Assistant | undefined): void {
  useEffect(() => {
    if (assistant === undefined) return;
    assistant.deployment.then(
      (deployment) => {
        preloadApi(deployment.api);
      },
      () => undefined,
    );
  }, [assistant]);
}

// The assistant, where its board is open.
function open(assistant: Assistant | undefined): Assistant | undefined {
  return assistant?.signal.aborted === false ? assistant : undefined;
}

// A key that tells the assistants of two boards apart, so that the chat of the
// next board starts afresh.
const keys = new WeakMap<Assistant, string>();
let drawn = 0;
function assistantKey(assistant: Assistant): string {
  let key = keys.get(assistant);
  if (key === undefined) {
    drawn += 1;
    key = String(drawn);
    keys.set(assistant, key);
  }
  return key;
}
