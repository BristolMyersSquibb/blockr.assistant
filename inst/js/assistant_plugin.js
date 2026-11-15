// srcts/modules/assistant_plugin/index.tsx
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { jsx } from "react/jsx-runtime";
var api = 1;
var ui = {
  render({ el }) {
    const root = createRoot(el);
    flushSync(() => {
      root.render(/* @__PURE__ */ jsx("div", {}));
    });
    return () => {
      root.unmount();
    };
  }
};
var assistant_plugin_default = { ui };
export {
  api,
  assistant_plugin_default as default
};
