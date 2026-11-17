// The files that the user attaches to a message in the chat's message field:
// which files the field takes, the bound on their bytes, how the browser
// copies them into the plugin's memory, and how a call encodes them.

export { ACCEPT, kindOf, MAX_BYTES, mediaTypeOf, namesOf, PASTE_AS_FILE, PASTED_TEXT, pastedFile, PDF, scaledSize, sizeOf } from "./attachments.ts";
export type { FileKind } from "./attachments.ts";
export { attachedFile, copiedFile, encodedFile } from "./read.ts";
export type { Encoded } from "./read.ts";
