// The files that the user attaches, as the chat draws them
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#attachments):
// - The message field shows each file that it stages, an image as a
//   thumbnail and any other file by its name, with a button that removes it.
// - A message that the user sent shows each of its files in the same way.
//   A click opens the file large in a dialog, as today's chat does
//   (shinychat's AttachmentLightbox.tsx at 6cb1417): an image at its own
//   size, a PDF in the browser's viewer for PDFs, and a text file as its
//   text.
// - A file whose content the memory lacks, as once the board opens again,
//   shows by its name and opens nothing, and so does a file that the provider
//   refused, which says so.
// The chat shows a file from the copy of its bytes that the memory keeps,
// through an object URL, which it releases once it no longer shows the file.
// The dialog is the modal of core's React SDK, in a portal at the end of the
// page's body, as the dialog before a link is (./links.tsx). It closes on
// Escape, on its close button and on a press outside the dialog.
// It keeps today's size, up to 960 pixels wide and the window's height less
// 32 pixels, which is larger than the SDK's modal is otherwise.
// A sent file whose content the chat holds is a Button of the SDK, which
// opens the file.

import { memo, useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import type { Attachment } from "@assistant-ui/react";
import { Button, Dialog, Heading, Modal } from "@blockr/core/react";
import { kindOf, PDF } from "../attachments/index.ts";
import type { KeptFile } from "../conversations/index.ts";
import { withAttributes } from "./attributes.tsx";
import { useChatActions } from "./context.ts";
import { libraries } from "./libraries.ts";
import type { SentFile } from "./messages.ts";

// The files that the message field stages.
export function StagedFiles(): ReactElement | null {
  const { ComposerPrimitive, useAuiState } = libraries();
  const staged = useAuiState(({ composer }) => composer.attachments.length);
  if (staged === 0) return null;
  return (
    <div className="blockr-assistant-staged">
      <ComposerPrimitive.Attachments>{({ attachment }) => <StagedFile attachment={attachment} />}</ComposerPrimitive.Attachments>
    </div>
  );
}

function StagedFile({ attachment }: { readonly attachment: Attachment }): ReactElement {
  const { AttachmentPrimitive } = libraries();
  const mediaType = attachment.contentType ?? attachment.file?.type ?? "";
  const url = useObjectUrl(kindOf(mediaType) === "image" ? attachment.file : undefined);
  return (
    <AttachmentPrimitive.Root className="blockr-assistant-file" title={attachment.name}>
      <FileMark name={attachment.name} mediaType={mediaType} url={url} />
      <span className="blockr-assistant-file-name">{attachment.name}</span>
      <AttachmentPrimitive.Remove className="blockr-assistant-file-remove" title={`Remove ${attachment.name}`} aria-label={`Remove ${attachment.name}`}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
        </svg>
      </AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  );
}

// The files of a message that the user sent.
export function SentFiles({ files }: { readonly files: readonly SentFile[] }): ReactElement {
  return (
    <ul className="blockr-assistant-files">
      {files.map((file, index) => (
        <li key={index}>
          <Sent file={file} />
        </li>
      ))}
    </ul>
  );
}

function Sent({ file }: { readonly file: SentFile }): ReactElement {
  const { openFile } = useChatActions();
  const content = file.file !== undefined && !("refused" in file.file) ? file.file : undefined;
  const url = useObjectUrl(content !== undefined && kindOf(file.media_type) === "image" ? content.blob : undefined);
  const mark = <FileMark name={file.name} mediaType={file.media_type} url={url} />;
  const name = <span className="blockr-assistant-file-name">{file.name}</span>;

  if (content === undefined) {
    const refused = file.file !== undefined && "refused" in file.file;
    return (
      <span
        className="blockr-assistant-file"
        data-refused={refused ? "" : undefined}
        title={refused ? `The provider refused ${file.name}, so the conversation goes on without it.` : `The board keeps only the name of ${file.name}.`}
      >
        {mark}
        {name}
        {refused ? <span className="blockr-assistant-file-note">Refused</span> : null}
      </span>
    );
  }
  return (
    <Button
      variant="secondary"
      className="blockr-assistant-file"
      render={withAttributes({ title: `Open ${file.name}` })}
      onPress={() => {
        openFile({ name: file.name, mediaType: file.media_type, content });
      }}
    >
      {mark}
      {name}
    </Button>
  );
}

// A file's thumbnail, where it is an image whose content the chat holds, and
// otherwise a badge with its extension.
function FileMark({ name, mediaType, url }: { readonly name: string; readonly mediaType: string; readonly url: string | undefined }): ReactElement {
  if (url !== undefined) return <img className="blockr-assistant-file-thumb" src={url} alt="" />;
  return <span className="blockr-assistant-file-badge">{badgeOf(name, mediaType)}</span>;
}

// A file that the dialog opens, with its content.
export interface OpenedFile {
  readonly name: string;
  readonly mediaType: string;
  readonly content: Exclude<KeptFile, { readonly refused: true }>;
}

// The dialog that shows a file large, open while `file` names one, which
// calls onClose() as it closes. The chat draws again as each token of a reply
// streams, so the dialog draws again only as its file changes.
export const FileDialog = memo(function FileDialog({ file, onClose }: { readonly file: OpenedFile | undefined; readonly onClose: () => void }): ReactElement | null {
  const url = useObjectUrl(file === undefined || kindOf(file.mediaType) === "text" ? undefined : file.content.blob);
  if (file === undefined) return null;

  return (
    <Modal
      isOpen
      isDismissable
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      className="blockr-assistant-overlay blockr-assistant-file-dialog"
    >
      <Dialog className="blockr-assistant-file-view">
        <div className="blockr-assistant-file-view-head">
          <Heading slot="title" level={2}>
            {file.name}
          </Heading>
          <Button variant="quiet" className="blockr-assistant-file-view-close" aria-label="Close" render={withAttributes({ title: "Close" })} onPress={onClose}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
            </svg>
          </Button>
        </div>
        <div className="blockr-assistant-file-view-body">
          <FileView file={file} url={url} />
        </div>
      </Dialog>
    </Modal>
  );
});

// A file in the dialog: an image as itself, a PDF in the browser's viewer for
// PDFs, under the media type of its copy, and a text file as its text.
function FileView({ file, url }: { readonly file: OpenedFile; readonly url: string | undefined }): ReactElement | null {
  const kind = kindOf(file.mediaType);
  if (kind === "text") return <FileText file={file.content.blob} />;
  if (url === undefined) return null;
  if (kind === "image") return <img className="blockr-assistant-file-image" src={url} alt={file.name} />;
  return <iframe className="blockr-assistant-file-pdf" src={url} title={file.name} />;
}

// A text file's text, which shows once the browser has read the copy.
function FileText({ file }: { readonly file: Blob }): ReactElement | null {
  const [read, setRead] = useState<{ readonly file: Blob; readonly text: string } | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void file.text().then((text) => {
      if (live) setRead({ file, text });
    });
    return () => {
      live = false;
    };
  }, [file]);

  if (read?.file !== file) return null;
  return <pre className="blockr-assistant-file-text">{read.text === "" ? "(The file is empty.)" : read.text}</pre>;
}

// An object URL of the blob given, while the component shows it. The browser
// releases it once the blob changes or the component goes.
function useObjectUrl(blob: Blob | undefined): string | undefined {
  const url = useMemo(() => (blob === undefined || typeof URL.createObjectURL !== "function" ? undefined : URL.createObjectURL(blob)), [blob]);
  useEffect(
    () => () => {
      if (url !== undefined) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url;
}

// A badge for a file: its extension, as "CSV", or else "PDF" or "TXT".
function badgeOf(name: string, mediaType: string): string {
  const dot = name.lastIndexOf(".");
  if (dot > 0 && dot < name.length - 1) return name.slice(dot + 1, dot + 5).toUpperCase();
  return mediaType === PDF ? "PDF" : "TXT";
}
