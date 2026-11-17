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
// 4. As the message is sent, the adapter copies each file's bytes, which go
//    into the plugin's memory with the message (./send.ts), so that the file
//    stays attached once the user deletes or edits it on disk.
// The chat adds the files one at a time, in the order given, so that each
// file meets the bound with every file staged before it.

import type { Attachment, AttachmentAdapter, CompleteAttachment, PendingAttachment } from "@assistant-ui/react";
import { ACCEPT, attachedFile, copiedFile, kindOf, MAX_BYTES, mediaTypeOf, namesOf, sizeOf } from "../attachments/index.ts";
import { newId } from "../state/index.ts";
import type { Attached } from "./send.ts";

// The message field, as the chat adds files to it.
export interface Field {
  getState(): { readonly attachments: readonly Attachment[] };
  addAttachment(file: File): Promise<void>;
}

// The adapter through which assistant-ui's message field stages the files
// that the chat hands it, and copies their bytes as the message is sent. The
// copy takes the place of the file, and the chat reads nothing else of the
// attachment, so its content stays empty.
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
      const complete: CompleteAttachment = { ...attachment, file: await copiedFile(attachment.file), status: { type: "complete" }, content: [] };
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
// the chat, each with the copy of its bytes that the plugin's memory keeps.
export function attachedOf(attachments: readonly CompleteAttachment[]): Attached[] {
  return attachments.flatMap((attachment): Attached[] => {
    const { file } = attachment;
    return file === undefined ? [] : [{ name: attachment.name, mediaType: attachment.contentType ?? file.type, kept: { blob: file } }];
  });
}

// The bytes of the files that the message field stages.
function stagedBytes(field: Field): number {
  return field.getState().attachments.reduce((sum, attachment) => sum + (attachment.file?.size ?? 0), 0);
}

