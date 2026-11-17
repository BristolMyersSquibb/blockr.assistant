// Reading a file that the user attaches, in the browser:
// 1. As the file is attached, an image whose longer side passes MAX_EDGE is
//    scaled down to it, through a canvas that sits outside the page, so that
//    the chat draws nowhere but in its element
//    (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.2.4#a-plugins-panel).
//    A GIF that is scaled down becomes a PNG of its first frame, since a canvas
//    writes no GIF, as today's chat has it. Where the browser cannot read the
//    image, as on happy-dom, the file stays as it is.
// 2. As the message is sent, the plugin copies the file's bytes into its
//    memory (../conversations), as binary. A file that the user picked or
//    dropped is the browser's handle on the file on disk, which the browser
//    can no longer read once the user deletes, moves or edits the file. The
//    copy keeps the file attached, as the user expects, and costs no more
//    than the file's size, while base64 would cost a third more.
// 3. As a turn's first call goes out, the loop encodes each file of the
//    conversation once (../loop): an image's or a PDF's bytes as base64, and
//    a text file's text, read as UTF-8, with each byte that is no UTF-8
//    replaced.

import { kindOf, scaledSize } from "./attachments.ts";

// A file's content as a call sends it: an image's or a PDF's bytes as base64,
// or a text file's text.
export type Encoded = { readonly data: string } | { readonly text: string };

// The file as the message field attaches it, with the media type given: an
// image scaled down where it is larger than the bound, and any other file as
// it is.
export async function attachedFile(file: File, mediaType: string): Promise<File> {
  const typed = file.type === mediaType ? file : new File([file], file.name, { type: mediaType });
  return kindOf(mediaType) === "image" ? scaledDown(typed) : typed;
}

// A copy of the file's bytes in memory, with the file's name and media type.
export async function copiedFile(file: File): Promise<File> {
  return new File([await file.arrayBuffer()], file.name, { type: file.type });
}

// The content of a file of the media type given, as a call sends it.
export async function encodedFile(file: Blob, mediaType: string): Promise<Encoded> {
  if (kindOf(mediaType) === "text") return { text: await file.text() };
  return { data: await base64Of(file) };
}

// The bytes of a file as base64.
function base64Of(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : "";
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("The browser could not read the file."));
    };
    reader.readAsDataURL(file);
  });
}

async function scaledDown(file: File): Promise<File> {
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const size = scaledSize(bitmap.width, bitmap.height);
    if (size === undefined) return file;
    const canvas = new OffscreenCanvas(size.width, size.height);
    const context = canvas.getContext("2d");
    if (context === null) return file;
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await canvas.convertToBlob({ type: file.type === "image/gif" ? "image/png" : file.type });
    return new File([blob], file.name, { type: blob.type });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
