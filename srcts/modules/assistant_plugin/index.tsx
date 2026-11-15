// The module of the assistant's plugin class,
// blockr.assistant-assistant_plugin, which blockr.assistant lists in R with
// the class's id. Its default export is the class without its id
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.1.12#a-plugin).
// The class has a `ui`, which every frontend places for the assistant, and
// which draws an empty panel. It draws in React, on the one copy of React that
// core puts on the page, in a root of its own.
// The class keeps no state, so a board holds nothing for the assistant.

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { PluginClass, PluginModule } from "@blockr/core";

export const api = 1;

const ui = {
  render({ el }) {
    const root = createRoot(el);
    // React draws the panel before render() returns.
    flushSync(() => {
      root.render(<div />);
    });
    return () => {
      root.unmount();
    };
  },
} satisfies PluginModule;

export default { ui } satisfies Omit<PluginClass, "id">;
