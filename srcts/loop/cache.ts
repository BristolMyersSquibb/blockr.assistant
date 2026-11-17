// Where a call to one of Anthropic's models marks the end of what Anthropic's
// cache keeps, on Anthropic's Messages API and on OpenRouter's Chat
// Completions (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.5#what-a-call-sends-and-in-which-order).
// Anthropic's cache keeps the start of a call only up to a block that the
// call marks with cache_control.
// Of a call's messages, pi marks the last one, which is the message of the
// app's where the loop adds one.
// That message holds the board as it is when the call goes out, so a call
// that marked it would keep a start that no later call repeats.
// So the loop moves pi's mark to the end of the conversation, before the
// message of the app's.
// It does so through pi's onPayload, whose return replaces the request's
// params.
// The next call of the turn then repeats that start and reads it from the
// cache.
// The mark goes to the nearest message before the message of the app's, on
// the last of its blocks that the API lets a call mark.
// On Chat Completions, those are its texts alone, since pi marks only a text
// there, and OpenRouter's guide shows a mark only on a text.
// Where a tool's result holds images, pi sends them in a message of the role
// user, after a line of text.
// The mark then goes on that line, so the next call reads the images anew
// rather than from the cache.
// It moves the mark only where the request's last message of the role user is
// the message of the app's and carries pi's mark, and it leaves the request
// as it is otherwise.
// Behind that message, pi may add a message of the role system, which
// carries the effort of the reply and holds no block.

// The text of pi's messages as pi sends it: without the halves of a surrogate
// pair that stand alone, which pi takes out of every text, as its
// sanitizeSurrogates() does.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

// The types of the blocks that a call may mark, by pi's name for the API.
const MARKABLE: ReadonlyMap<string, ReadonlySet<unknown>> = new Map([
  ["anthropic-messages", new Set(["text", "image", "document", "tool_use", "tool_result"])],
  ["openai-completions", new Set(["text"])],
]);

type Block = Readonly<Record<string, unknown>>;

interface Param {
  readonly role?: unknown;
  readonly content?: unknown;
}

// The request of the API given, by pi's name for it, with pi's mark moved
// from the message of the app's, whose text is given, to the end of the
// conversation before it, or undefined where the request has no such mark to
// move.
export function markBeforeAppMessage(payload: unknown, text: string, api: string): unknown {
  const markable = MARKABLE.get(api);
  if (markable === undefined || !isRecord(payload) || !Array.isArray(payload.messages)) return undefined;
  const messages = payload.messages as readonly unknown[];
  let at = messages.length - 1;
  while (at >= 0 && !(isRecord(messages[at]) && (messages[at] as Param).role === "user")) at -= 1;
  const app = blocksOf(messages[at]);
  const marked = app?.length === 1 ? app[0] : undefined;
  if (marked?.type !== "text" || marked.text !== text.replace(LONE_SURROGATE, "") || marked.cache_control === undefined) {
    return undefined;
  }

  for (let before = at - 1; before >= 0; before -= 1) {
    const blocks = blocksOf(messages[before]);
    if (blocks === undefined || blocks.length === 0) continue;
    let last = blocks.length - 1;
    while (last >= 0 && !markable.has(blocks[last]?.type)) last -= 1;
    if (last < 0) return undefined;
    const { cache_control: mark, ...unmarked } = marked;
    const content = [...blocks];
    content[last] = { ...content[last], cache_control: mark };
    const moved = [...messages];
    moved[before] = { ...(messages[before] as Param), content };
    moved[at] = { ...(messages[at] as Param), content: [unmarked] };
    return { ...payload, messages: moved };
  }
  return undefined;
}

// The blocks of a message, those of a text in place of the text, or undefined
// for what is no message.
function blocksOf(message: unknown): readonly Block[] | undefined {
  if (!isRecord(message)) return undefined;
  const { content } = message as Param;
  if (typeof content === "string") return [{ type: "text", text: content }];
  return Array.isArray(content) && content.every(isRecord) ? content : undefined;
}

function isRecord(value: unknown): value is Block {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
