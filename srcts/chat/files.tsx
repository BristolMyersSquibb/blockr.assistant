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
// The dialog opens in the browser's top layer, through showModal(), and sits
// in the chat's element, as the dialog before a link does (./links.tsx).

import { memo, useEffect, useMemo, useRef } from "react";
import type { ReactElement } from "react";
import type { Attachment } from "@assistant-ui/react";
import { kindOf, PDF } from "../attachments/index.ts";
import type { KeptFile } from "../conversations/index.ts";
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
  const url = content !== undefined && "data" in content && kindOf(file.media_type) === "image" ? dataUrlOf(file.media_type, content) : undefined;
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
    <button
      type="button"
      className="blockr-assistant-file"
      title={`Open ${file.name}`}
      onClick={() => {
        openFile({ name: file.name, mediaType: file.media_type, content });
      }}
    >
      {mark}
      {name}
    </button>
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
// streams, so the dialog draws again only as its file changes, and reads a
// PDF's bytes once.
export const FileDialog = memo(function FileDialog({ file, onClose }: { readonly file: OpenedFile | undefined; readonly onClose: () => void }): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const pdf = file?.mediaType === PDF && "data" in file.content ? file.content.data : undefined;
  const blob = useMemo(() => (pdf === undefined ? undefined : new Blob([bytesOf(pdf)], { type: PDF })), [pdf]);
  const pdfUrl = useObjectUrl(blob);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (file !== undefined && !dialog.open) dialog.showModal();
    if (file === undefined && dialog.open) dialog.close();
  }, [file]);

  return (
    <dialog
      ref={ref}
      className="blockr-assistant-dialog blockr-assistant-file-dialog"
      aria-label={file?.name ?? "File"}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog itself, whose content
        // fills it.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {file === undefined ? null : (
        <div className="blockr-assistant-file-view">
          <div className="blockr-assistant-file-view-head">
            <h2>{file.name}</h2>
            <button type="button" className="blockr-assistant-file-view-close" title="Close" aria-label="Close" onClick={onClose}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
              </svg>
            </button>
          </div>
          <div className="blockr-assistant-file-view-body">
            <FileView file={file} pdfUrl={pdfUrl} />
          </div>
        </div>
      )}
    </dialog>
  );
});

function FileView({ file, pdfUrl }: { readonly file: OpenedFile; readonly pdfUrl: string | undefined }): ReactElement | null {
  const { content } = file;
  if ("text" in content) return <pre className="blockr-assistant-file-text">{content.text === "" ? "(The file is empty.)" : content.text}</pre>;
  if (kindOf(file.mediaType) === "image") return <img className="blockr-assistant-file-image" src={dataUrlOf(file.mediaType, content)} alt={file.name} />;
  return pdfUrl === undefined ? null : <iframe className="blockr-assistant-file-pdf" src={pdfUrl} title={file.name} />;
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

// The data URL of an image's content, which the chat makes once for each
// content that the memory keeps, so that the chat hands React the same string
// each time it draws.
const urls = new WeakMap<object, string>();
function dataUrlOf(mediaType: string, content: { readonly data: string }): string {
  let url = urls.get(content);
  if (url === undefined) {
    url = `data:${mediaType};base64,${content.data}`;
    urls.set(content, url);
  }
  return url;
}

// The bytes that base64 gives.
function bytesOf(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
