// The PDFs that a call carries, in the request that pi writes for the call
// (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.4#attachments).
// Pi's messages hold text and images alone, so the loop hands pi each PDF as
// an image of the type application/pdf (./messages.ts). Pi writes it into the
// request as an image, which the APIs refuse, as Anthropic's Messages API
// does with "media_type: Input should be 'image/jpeg', 'image/png',
// 'image/gif' or 'image/webp'".
// So the loop turns each such image into the block of the call's API for a
// file, through pi's onPayload, whose return replaces the request:
// - On Anthropic's Messages API, a block of the type document, which holds the
//   PDF's bytes as base64 and takes the PDF's name as its title. A cache mark
//   that pi put on the image stays on the block.
// - On OpenAI's Responses API, a part of the type input_file, which holds the
//   PDF's name and its bytes as a data URL.
// - On Chat Completions, a part of the type file, which holds the same.
// The user messages of the request hold the PDFs in the order of pi's
// messages, so the first PDF of the request takes the first name that the
// loop noted, and so on. The loop leaves a request that holds no PDF as it
// is.

import { PDF } from "../attachments/index.ts";

type Block = Readonly<Record<string, unknown>>;

// The start of the data URL of a PDF, as pi writes it for OpenAI's APIs.
const PDF_URL = `data:${PDF};base64,`;

// The name of a PDF that the loop noted no name for.
const UNNAMED = "document.pdf";

// The request with each PDF in the block of the API given for a file, named
// by the names given in order, or undefined where the request holds no PDF.
export function withFiles(api: string, payload: unknown, names: readonly string[]): unknown {
  if (!isRecord(payload)) return undefined;
  let next = 0;
  const name = (): string => names[next++] ?? UNNAMED;
  switch (api) {
    case "anthropic-messages":
      return withBlocks(payload, "messages", (block) => anthropicDocument(block, name));
    case "openai-responses":
      return withBlocks(payload, "input", (block) => responsesFile(block, name));
    case "openai-completions":
      return withBlocks(payload, "messages", (block) => completionsFile(block, name));
    default:
      return undefined;
  }
}

// The request with each block of its user messages under `key` that holds a
// PDF in the block that `filed` gives in its place, or undefined where
// `filed` gives none.
function withBlocks(payload: Block, key: string, filed: (block: Block) => Block | undefined): unknown {
  const items = payload[key];
  if (!Array.isArray(items)) return undefined;
  const given = items as readonly unknown[];
  const next = given.map((item) => {
    if (!isRecord(item) || item.role !== "user" || !Array.isArray(item.content)) return item;
    const blocks = item.content as readonly unknown[];
    const content = blocks.map((block) => (isRecord(block) ? (filed(block) ?? block) : block));
    return content.some((block, index) => block !== blocks[index]) ? { ...item, content } : item;
  });
  return next.some((item, index) => item !== given[index]) ? { ...payload, [key]: next } : undefined;
}

function anthropicDocument(block: Block, name: () => string): Block | undefined {
  const source = block.source;
  if (block.type !== "image" || !isRecord(source) || source.type !== "base64" || source.media_type !== PDF) return undefined;
  const mark = block.cache_control;
  return { type: "document", source: { type: "base64", media_type: PDF, data: source.data }, title: name(), ...(mark === undefined ? {} : { cache_control: mark }) };
}

function responsesFile(block: Block, name: () => string): Block | undefined {
  const url = block.image_url;
  if (block.type !== "input_image" || typeof url !== "string" || !url.startsWith(PDF_URL)) return undefined;
  return { type: "input_file", filename: name(), file_data: url };
}

function completionsFile(block: Block, name: () => string): Block | undefined {
  const image = block.image_url;
  const url = isRecord(image) ? image.url : undefined;
  if (block.type !== "image_url" || typeof url !== "string" || !url.startsWith(PDF_URL)) return undefined;
  return { type: "file", file: { filename: name(), file_data: url } };
}

function isRecord(value: unknown): value is Block {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
