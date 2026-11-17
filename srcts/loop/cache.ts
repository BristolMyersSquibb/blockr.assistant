// Where a call to Anthropic's Messages API marks the end of what its cache
// keeps (https://github.com/BristolMyersSquibb/blockr/wiki/Rewrite-1.4.5#what-a-call-sends-and-in-which-order).
// Anthropic's cache keeps the start of a call only up to a block that the
// call marks with cache_control. Of a call's messages, pi marks the last block
// of the last one, which is the message of the app's where the loop adds one.
// That message holds the board as it is when the call goes out, so a call
// that marked it would keep a start that no later call repeats.
// So the loop moves pi's mark to the block before the message of the app's,
// which ends the conversation, through pi's onPayload, whose return replaces
// the request's params. The next call of the turn then repeats that start and
// reads it from the cache.
// It moves the mark only where the request's last message of the role user is
// the message of the app's and carries pi's mark, and it leaves the request
// as it is otherwise. Behind that message, pi may add a message of the role
// system, which carries the effort of the reply and holds no block.

// The text of pi's messages as pi sends it: without the halves of a surrogate
// pair that stand alone, which pi takes out of every text, as its
// sanitizeSurrogates() does.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

// The types of the blocks that Anthropic lets a call mark.
const MARKABLE: ReadonlySet<unknown> = new Set(["text", "image", "document", "tool_use", "tool_result"]);

type Block = Readonly<Record<string, unknown>>;

interface Param {
  readonly role?: unknown;
  readonly content?: unknown;
}

// The request with pi's mark moved from the message of the app's, whose text
// is given, to the block before it, or undefined where the request has no
// such mark to move.
export function markBeforeAppMessage(payload: unknown, text: string): unknown {
  if (!isRecord(payload) || !Array.isArray(payload.messages)) return undefined;
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
    const last = blocks.at(-1);
    if (last === undefined || !MARKABLE.has(last.type)) return undefined;
    const { cache_control: mark, ...unmarked } = marked;
    const moved = [...messages];
    moved[before] = { ...(messages[before] as Param), content: [...blocks.slice(0, -1), { ...last, cache_control: mark }] };
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
