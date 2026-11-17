// The files that the user attaches in the message field, through
// assistant-ui's adapter for attachments, as the notes of the page have it
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#attachments).
// A file enters the message field in these steps:
// 1. The user picks files with the field's button, drops them on the chat or
//    pastes them into the field. A paste of a long text becomes a file too
//    (../attachments).
// 2. The chat leaves out a file that the field does not take, and a file that
//    would take the files of the message past the bound, and says why under
//    the field. It scales an image down where it is larger than the bound for
//    images.
// 3. The chat hands each file that it keeps to assistant-ui's message field,
//    whose adapter stages it, so that the field shows it until the user sends
//    the message or removes the file.
// 4. As the message is sent, the adapter reads each file's content, which
//    goes into the plugin's memory with the message (./send.ts).
// The chat adds the files one at a time, in the order given, so that each
// file meets the bound with every file staged before it.

import type { Attachment, AttachmentAdapter, CompleteAttachment, PendingAttachment, ThreadUserMessagePart } from "@assistant-ui/react";
import { ACCEPT, attachedFile, keptFile, kindOf, MAX_BYTES, mediaTypeOf, namesOf, PDF, sizeOf } from "../attachments/index.ts";
import type { KeptFile } from "../conversations/index.ts";
import { newId } from "../state/index.ts";
import type { Attached } from "./send.ts";

// The message field, as the chat adds files to it.
export interface Field {
  getState(): { readonly attachments: readonly Attachment[] };
  addAttachment(file: File): Promise<void>;
}

// The adapter through which assistant-ui's message field stages the files
// that the chat hands it, and reads their content as the message is sent.
export function attachmentAdapter(): AttachmentAdapter {
  return {
    accept: ACCEPT,
    add({ file }) {
      const mediaType = mediaTypeOf(file);
      if (mediaType === undefined) return Promise.reject(new Error(`The chat takes no file "${file.name}".`));
      const pending: PendingAttachment = {
        id: newId(),
        type: kindOf(mediaType) === "image" ? "image" : "document",
        name: file.name,
        contentType: mediaType,
        file,
        status: { type: "requires-action", reason: "composer-send" },
      };
      return Promise.resolve(pending);
    },
    async send(attachment) {
      const mediaType = attachment.contentType ?? attachment.file.type;
      const kept = await keptFile(attachment.file, mediaType);
      const complete: CompleteAttachment = { ...attachment, status: { type: "complete" }, content: [partOf(kept, attachment.name, mediaType)] };
      return complete;
    },
    remove() {
      return Promise.resolve();
    },
  };
}

// Adds the files to the message field, in order, and resolves with what the
// chat says of the files that it left out, or undefined where it left out
// none.
export async function addFiles(field: Field, files: readonly File[]): Promise<string | undefined> {
  const untaken: string[] = [];
  const tooLarge: string[] = [];
  for (const file of files) {
    const mediaType = mediaTypeOf(file);
    if (mediaType === undefined) {
      untaken.push(file.name);
      continue;
    }
    const attached = await attachedFile(file, mediaType);
    if (stagedBytes(field) + attached.size > MAX_BYTES) {
      tooLarge.push(file.name);
      continue;
    }
    await field.addAttachment(attached);
  }
  const said = [
    ...(untaken.length === 0 ? [] : [`The chat takes images, PDFs and text files, so it left out ${namesOf(untaken)}.`]),
    ...(tooLarge.length === 0 ? [] : [`The files of a message take up to ${sizeOf(MAX_BYTES)} together, so the chat left out ${namesOf(tooLarge)}.`]),
  ];
  return said.length === 0 ? undefined : said.join(" ");
}

// The files of a message that the user sends, as assistant-ui hands them to
// the chat, each with its content as the plugin's memory keeps it.
export function attachedOf(attachments: readonly CompleteAttachment[]): Attached[] {
  return attachments.flatMap((attachment): Attached[] => {
    const kept = keptOf(attachment.content);
    const mediaType = attachment.contentType ?? (attachment.type === "image" ? "image/png" : PDF);
    return kept === undefined ? [] : [{ name: attachment.name, mediaType, kept }];
  });
}

// The bytes of the files that the message field stages.
function stagedBytes(field: Field): number {
  return field.getState().attachments.reduce((sum, attachment) => sum + (attachment.file?.size ?? 0), 0);
}

// The content of a file as a part of assistant-ui's message: a text file's
// text, an image's data URL, and a PDF's bytes as base64.
function partOf(kept: KeptFile, name: string, mediaType: string): ThreadUserMessagePart {
  if ("text" in kept) return { type: "text", text: kept.text };
  if ("data" in kept && kindOf(mediaType) === "image") return { type: "image", image: `data:${mediaType};base64,${kept.data}`, filename: name };
  return { type: "file", filename: name, data: "data" in kept ? kept.data : "", mimeType: mediaType };
}

// A file's content as the plugin's memory keeps it, from the parts that
// partOf() gave.
function keptOf(content: readonly ThreadUserMessagePart[]): KeptFile | undefined {
  const [part] = content;
  switch (part?.type) {
    case "text":
      return { text: part.text };
    case "image":
      return { data: part.image.slice(part.image.indexOf(",") + 1) };
    case "file":
      return { data: part.data };
    default:
      return undefined;
  }
}
