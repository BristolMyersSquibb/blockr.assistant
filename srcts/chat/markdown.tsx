// Text in the chat as Markdown, with tables, and with code blocks that a button
// copies, as in today's chat
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#the-message-field-and-a-turn).
// The button that copies a code block is a Button of blockr.ui.
// A reply's text draws through it, and so do a reply's reasoning and a summary,
// inside TextMessagePartProvider, which hands assistant-ui's Markdown the text.
// - The text shows as it streams, as today's does, without assistant-ui's
//   animation, which would hold the text back.
// - A table scrolls on its own where it is wider than the panel.
// - A link opens in a tab of its own (./links.tsx).

import { useEffect, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import type { MarkdownTextPrimitiveProps } from "@assistant-ui/react-markdown";
import { Button } from "@blockr/ui";
import { libraries } from "./libraries.ts";
import { TextLink } from "./links.tsx";

// How long a code block's button says that it copied.
const COPIED_MS = 2000;

const COMPONENTS: NonNullable<MarkdownTextPrimitiveProps["components"]> = {
  a: TextLink,
  table: Table,
  CodeHeader,
};

// The plugins of the Markdown, made once the libraries have loaded, so that
// each draw passes the same array.
let plugins: MarkdownTextPrimitiveProps["remarkPlugins"];

// The text of the part that assistant-ui's context holds, as Markdown.
export function MarkdownText(): ReactElement {
  const { MarkdownTextPrimitive, remarkGfm } = libraries();
  plugins ??= [remarkGfm];
  return <MarkdownTextPrimitive className="blockr-assistant-markdown" remarkPlugins={plugins} smooth={false} components={COMPONENTS} />;
}

// Text that no part holds, as a reply's reasoning or a summary, as Markdown.
export function Markdown({ text, running = false }: { readonly text: string; readonly running?: boolean }): ReactElement {
  const { TextMessagePartProvider } = libraries();
  return (
    <TextMessagePartProvider text={text} isRunning={running}>
      <MarkdownText />
    </TextMessagePartProvider>
  );
}

function Table({ children }: { readonly children?: ReactNode }): ReactElement {
  return (
    <div className="blockr-assistant-table">
      <table>{children}</table>
    </div>
  );
}

// The bar above a code block, with its language and the button that copies it.
function CodeHeader({ language, code }: { readonly language: string | undefined; readonly code: string }): ReactElement {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => {
      setCopied(false);
    }, COPIED_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [copied]);

  return (
    <div className="blockr-assistant-code-header">
      <span>{language ?? ""}</span>
      <Button
        variant="quiet"
        className="blockr-assistant-copy"
        onPress={() => {
          // A page outside a secure context has no clipboard, so the button
          // copies nothing there.
          const clipboard = (globalThis.navigator as { clipboard?: Clipboard | undefined } | undefined)?.clipboard;
          void clipboard?.writeText(code).then(
            () => {
              setCopied(true);
            },
            () => undefined,
          );
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
