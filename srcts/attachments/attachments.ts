// The files that the chat's message field takes, as today's chat takes them
// (shinychat's js/src/chat/attachment-types.json and attachments.ts at
// 6cb1417) (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#attachments):
// - It takes images in PNG, JPEG, GIF and WebP, PDFs, and text files of 26
//   extensions, such as .csv, .md and .R.
// - A file's media type is the one that the browser gives an image or a PDF,
//   and otherwise the one that the file's extension names. Browsers give the
//   type of a text file unreliably, often as "" or "text/plain". A file
//   without an extension, as the file that a long paste makes, keeps a text
//   type that the browser gives it.
// - The files of one message take up to 30 MiB together, today's default.
//   Today, shinychat's environment variable SHINYCHAT_MAX_ATTACHMENT_SIZE
//   sets the bound. The plugin sets it itself, since that variable goes with
//   shinychat, and no app in the workspace sets it.
// - An image whose longer side passes 1568 pixels is scaled down to that
//   size before it is attached, as today (./read.ts). So its bytes stay below
//   what a provider takes of an image, such as Anthropic's 5 MB.
// - A paste of more than 1,000 characters becomes a text file named
//   "Pasted Text", as today.

// What the loop and the chat do with a file: send and show an image as an
// image, a PDF as a PDF, and a text file as its text.
export type FileKind = "image" | "pdf" | "text";

export const PDF = "application/pdf";

const IMAGES: readonly string[] = ["image/png", "image/jpeg", "image/gif", "image/webp"];

// The media type of each extension of a text file, without its dot.
const TEXT_EXTENSIONS: Readonly<Record<string, string>> = {
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  py: "text/x-python",
  js: "text/javascript",
  ts: "text/typescript",
  r: "text/x-r",
  yaml: "text/yaml",
  yml: "text/yaml",
  toml: "text/x-toml",
  qmd: "text/markdown",
  rmd: "text/markdown",
  ipynb: "application/x-ipynb+json",
  rst: "text/x-rst",
  tex: "text/x-tex",
  sql: "text/x-sql",
  sh: "text/x-sh",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  xml: "application/xml",
  ini: "text/x-ini",
  cfg: "text/x-ini",
  log: "text/plain",
};

const TEXTS: ReadonlySet<string> = new Set(Object.values(TEXT_EXTENSIONS));

// The bound on the bytes of the files of one message: 30 MiB.
export const MAX_BYTES = 30 * 1024 * 1024;

// The longest side, in pixels, of an image that the message field attaches.
export const MAX_EDGE = 1568;

// The length of a paste, in characters, past which the paste becomes a file.
export const PASTE_AS_FILE = 1000;

// The name of the file that a long paste becomes.
export const PASTED_TEXT = "Pasted Text";

// What the loop and the chat do with a file of the media type given, or
// undefined for a type that the message field does not take.
export function kindOf(mediaType: string): FileKind | undefined {
  if (IMAGES.includes(mediaType)) return "image";
  if (mediaType === PDF) return "pdf";
  return TEXTS.has(mediaType) ? "text" : undefined;
}

// The media type of a file that the message field takes, or undefined for a
// file that it does not take.
export function mediaTypeOf(file: { readonly name: string; readonly type: string }): string | undefined {
  if (IMAGES.includes(file.type) || file.type === PDF) return file.type;
  const extension = extensionOf(file.name);
  if (extension !== "") return Object.hasOwn(TEXT_EXTENSIONS, extension) ? TEXT_EXTENSIONS[extension] : undefined;
  return TEXTS.has(file.type) ? file.type : undefined;
}

// The accept attribute of the field's file input: the media types that it
// takes, with the extensions of the text files, since a system's file picker
// does not filter text files by their media type alone.
export const ACCEPT = [...IMAGES, PDF, ...TEXTS, ...Object.keys(TEXT_EXTENSIONS).map((extension) => `.${extension}`)].join(",");

// The size, in pixels, to which an image of the width and the height given is
// scaled down, keeping its proportions, or undefined where its longer side
// does not pass the bound.
export function scaledSize(width: number, height: number, bound = MAX_EDGE): { readonly width: number; readonly height: number } | undefined {
  const longer = Math.max(width, height);
  if (longer <= bound) return undefined;
  const scale = bound / longer;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// The names of files, each in quotes, as a list in prose, such as "a.png",
// "b.pdf" and "c.csv".
export function namesOf(names: readonly string[]): string {
  const quoted = names.map((name) => `"${name}"`);
  return quoted.length <= 1 ? quoted.join("") : `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1) ?? ""}`;
}

// The file that a long paste becomes.
export function pastedFile(text: string): File {
  return new File([text], PASTED_TEXT, { type: "text/plain" });
}

// A size in bytes, as the field names it, such as "30 MB".
export function sizeOf(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))} KB`;
  return `${String(Math.round(bytes / (1024 * 1024)))} MB`;
}

// The extension of a file's name, in lower case and without its dot, or "".
function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}
