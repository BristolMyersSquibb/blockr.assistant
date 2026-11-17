// inst/js/assistant_plugin.schema.json
var assistant_plugin_schema_default = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    conversations: {
      type: "object",
      additionalProperties: {
        $ref: "#/definitions/Conversation"
      },
      description: "Every conversation, by its id."
    }
  },
  required: [
    "conversations"
  ],
  additionalProperties: false,
  description: "The assistant's conversations.",
  definitions: {
    Conversation: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "The title of the conversation."
        },
        updated: {
          type: "string",
          description: "When the conversation was added, or when its last message entered it, by which the conversations are ordered.",
          format: "date-time"
        },
        messages: {
          type: "array",
          items: {
            $ref: "#/definitions/Message"
          },
          description: "The messages that the state keeps, in the order in which they entered the conversation."
        },
        usage: {
          $ref: "#/definitions/Usage",
          description: "The tokens that the conversation's calls to the model spent."
        },
        model: {
          type: [
            "string",
            "null"
          ],
          description: `The conversation's pick of the model, such as "gpt-5.4", or null for the default.`
        }
      },
      required: [
        "title",
        "updated",
        "messages",
        "usage",
        "model"
      ],
      additionalProperties: false,
      description: "A conversation with the assistant."
    },
    Message: {
      type: "object",
      properties: {
        id: {
          $ref: "#/definitions/MessageId",
          description: "The id of the message."
        },
        role: {
          $ref: "#/definitions/Role",
          description: "Who the message is from."
        },
        parts: {
          type: "array",
          items: {
            $ref: "#/definitions/Part"
          },
          description: "What the message holds, in order."
        },
        created: {
          type: "string",
          description: "When the message was made.",
          format: "date-time"
        }
      },
      required: [
        "id",
        "role",
        "parts",
        "created"
      ],
      additionalProperties: false,
      description: "A message of a conversation, which never changes once it entered the conversation."
    },
    MessageId: {
      type: "string",
      description: "The id of a message, which no other message of its conversation has."
    },
    Role: {
      type: "string",
      enum: [
        "user",
        "assistant",
        "tool",
        "summary"
      ],
      description: "Who a message is from: the user, the model, the tools whose results it holds, or a summary of older messages that took their place."
    },
    Part: {
      anyOf: [
        {
          $ref: "#/definitions/TextPart"
        },
        {
          $ref: "#/definitions/ToolCallPart"
        },
        {
          $ref: "#/definitions/ToolResultPart"
        },
        {
          $ref: "#/definitions/AttachmentPart"
        },
        {
          $ref: "#/definitions/ChangesPart"
        },
        {
          $ref: "#/definitions/SkillPart"
        }
      ],
      description: "A part of a message."
    },
    TextPart: {
      type: "object",
      properties: {
        type: {
          type: "string",
          const: "text"
        },
        text: {
          type: "string"
        }
      },
      required: [
        "type",
        "text"
      ],
      additionalProperties: false,
      description: "Text that the message holds."
    },
    ToolCallPart: {
      type: "object",
      properties: {
        type: {
          type: "string",
          const: "tool_call"
        },
        id: {
          type: "string",
          description: "The id of the call, which its result names."
        },
        tool: {
          type: "string",
          description: "The name of the tool."
        },
        args: {
          type: "object",
          additionalProperties: {
            $ref: "#/definitions/Json"
          },
          description: "The args of the call."
        }
      },
      required: [
        "type",
        "id",
        "tool",
        "args"
      ],
      additionalProperties: false,
      description: "A call of a tool that the model asked for."
    },
    Json: {
      anyOf: [
        {
          type: "null"
        },
        {
          type: "boolean"
        },
        {
          type: "number"
        },
        {
          type: "string"
        },
        {
          type: "array",
          items: {
            $ref: "#/definitions/Json"
          }
        },
        {
          type: "object",
          additionalProperties: {
            $ref: "#/definitions/Json"
          }
        }
      ]
    },
    ToolResultPart: {
      type: "object",
      properties: {
        type: {
          type: "string",
          const: "tool_result"
        },
        id: {
          type: "string",
          description: "The id of the call."
        },
        text: {
          type: "string",
          description: "The text of the result."
        },
        error: {
          type: "boolean",
          description: "Whether the call failed."
        },
        images: {
          type: "integer",
          description: "How many images the result carried, which the state leaves out.",
          minimum: 0
        }
      },
      required: [
        "type",
        "id",
        "text"
      ],
      additionalProperties: false,
      description: "The result of a call of a tool."
    },
    AttachmentPart: {
      type: "object",
      properties: {
        type: {
          type: "string",
          const: "attachment"
        },
        name: {
          type: "string",
          description: "The name of the file."
        },
        media_type: {
          type: "string",
          description: 'The media type of the file, such as "image/png".'
        }
      },
      required: [
        "type",
        "name",
        "media_type"
      ],
      additionalProperties: false,
      description: "A file that the user attached, which the state leaves out but for its name and its media type."
    },
    ChangesPart: {
      type: "object",
      properties: {
        type: {
          type: "string",
          const: "changes"
        },
        text: {
          type: "string"
        }
      },
      required: [
        "type",
        "text"
      ],
      additionalProperties: false,
      description: "The note of what others changed in the board since the conversation's previous call, which the model read and the chat leaves out."
    },
    SkillPart: {
      type: "object",
      properties: {
        type: {
          type: "string",
          const: "skill"
        },
        name: {
          type: "string",
          description: "The name of the skill."
        },
        text: {
          type: "string",
          description: "The text of the skill."
        }
      },
      required: [
        "type",
        "name",
        "text"
      ],
      additionalProperties: false,
      description: "The text of a skill that the user called with /name, which the model gets with the message and the chat leaves out."
    },
    Usage: {
      type: "object",
      properties: {
        input: {
          type: "integer",
          description: "The input tokens of every call so far.",
          minimum: 0
        },
        output: {
          type: "integer",
          description: "The output tokens of every call so far.",
          minimum: 0
        },
        last: {
          type: "integer",
          description: "Every token of the last call, its cached input included.",
          minimum: 0
        }
      },
      required: [
        "input",
        "output",
        "last"
      ],
      additionalProperties: false,
      description: "The tokens that a conversation's calls to the model spent."
    }
  }
};

// srcts/blockr-options/numbers.ts
function sentNumber(sent2) {
  if (typeof sent2 === "number") return sent2;
  if (typeof sent2 !== "string" || sent2.trim() === "") return Number.NaN;
  return Number(sent2);
}

// srcts/conversations/cap.ts
async function readCap(core) {
  const sent2 = await core.blockrOption("chat_save_turns");
  if (sent2 === void 0) return 50;
  const value = sentNumber(sent2);
  if (value === -1) return Infinity;
  if (Number.isInteger(value) && value >= 0) return value;
  throw new RangeError(
    `The blockr option chat_save_turns is ${JSON.stringify(sent2)}, where it takes a whole number of 0 or more, or -1 for every message.`
  );
}

// srcts/state/state.ts
var ASSISTANT = "blockr.assistant-assistant_plugin";
function assistantState(board) {
  const state = board.plugins[ASSISTANT];
  return isObject(state) && isObject(state.conversations) ? state : void 0;
}
function findConversation(board, id) {
  const conversations = assistantState(board)?.conversations;
  return conversations !== void 0 && Object.hasOwn(conversations, id) ? conversations[id] : void 0;
}
function at(...segments) {
  return ["plugins", ASSISTANT, ...segments].map((segment) => `/${segment.replaceAll("~", "~0").replaceAll("/", "~1")}`).join("");
}
function newId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function newConversation(title2, model2) {
  return { title: title2, updated: (/* @__PURE__ */ new Date()).toISOString(), messages: [], usage: { input: 0, output: 0, last: 0 }, model: model2 };
}
function addedUsage(usage, input, output, total) {
  return { input: usage.input + input, output: usage.output + output, last: total };
}
function holdsMessage(conversation2, id) {
  return conversation2.messages.some((message2) => message2.id === id);
}
function canCompact(messages, summary2, from) {
  const index = messages.findIndex((message2) => message2.id === from);
  return index >= 0 && messages.slice(index).every((message2) => message2.id !== summary2.id);
}
function isNote(message2) {
  return message2.role === "user" && message2.parts.length > 0 && message2.parts.every((part) => part.type === "changes");
}
function messagesToDrop(messages, keep2) {
  let counted = 0;
  let fits;
  let last;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message2 = messages[i];
    if (message2 === void 0) continue;
    if (!isNote(message2)) counted += 1;
    if (opensExchange(message2)) {
      last ??= i;
      if (counted <= keep2) fits = i;
    }
  }
  if (counted <= keep2) return 0;
  return fits ?? last ?? 0;
}
function opensExchange(message2) {
  return message2.role === "summary" || message2.role === "user" && !isNote(message2);
}
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// srcts/conversations/conversations.ts
var ORIGIN = "assistant";
function createConversations(core, signal) {
  let cap;
  const memory = /* @__PURE__ */ new Map();
  const older = /* @__PURE__ */ new Map();
  const keptOf = /* @__PURE__ */ new Map();
  const listeners = /* @__PURE__ */ new Set();
  let changes = 0;
  let given2;
  const merged = /* @__PURE__ */ new Map();
  function notify() {
    for (const listener of listeners) listener();
  }
  function changed() {
    changes += 1;
    notify();
  }
  let state = assistantState(core.store.board());
  const stop = core.store.subscribe((_change, board) => {
    const now = assistantState(board);
    if (now === state) return;
    state = now;
    if (cap !== 0) {
      const held = now?.conversations ?? {};
      for (const id of older.keys()) {
        if (!Object.hasOwn(held, id)) older.delete(id);
      }
      for (const id of keptOf.keys()) {
        if (!Object.hasOwn(held, id)) keptOf.delete(id);
      }
      for (const id of merged.keys()) {
        if (!Object.hasOwn(held, id)) merged.delete(id);
      }
    }
    notify();
  });
  signal.addEventListener(
    "abort",
    () => {
      stop();
      listeners.clear();
    },
    { once: true }
  );
  const capped = readCap(core).then(async (read) => {
    cap = read;
    changed();
    await open2(read);
    return read;
  });
  function run(id, args) {
    return core.commands.run(id, args, ORIGIN);
  }
  async function open2(read) {
    const conversations = assistantState(core.store.board())?.conversations ?? {};
    if (read === 0) {
      for (const [id, conversation2] of Object.entries(conversations)) memory.set(id, conversation2);
      changed();
      await Promise.all(Object.keys(conversations).map((id) => run("blockr.assistant-remove_conversation", { conversation: id })));
      return;
    }
    if (!Object.values(conversations).some((conversation2) => messagesToDrop(conversation2.messages, read) > 0)) return;
    const done = run("blockr.assistant-trim_conversations", { keep: read });
    for (const [id, conversation2] of Object.entries(conversations)) keepCut(id, conversation2.messages);
    await done;
  }
  function keepCut(conversation2, before) {
    const after = findConversation(core.store.board(), conversation2);
    if (after === void 0) return;
    const kept = new Set(after.messages.map((message2) => message2.id));
    const cut = before.filter((message2) => !kept.has(message2.id));
    if (cut.length === 0) return;
    older.set(conversation2, [...older.get(conversation2) ?? [], ...cut]);
    changed();
  }
  function withOlder(id, held) {
    const cut = older.get(id);
    if (cut === void 0) return held;
    const last = merged.get(id);
    if (last?.held === held && last.cut === cut) return last.conversation;
    const conversation2 = { ...held, messages: [...cut, ...held.messages] };
    merged.set(id, { held, cut, conversation: conversation2 });
    return conversation2;
  }
  function change(conversation2, changing) {
    const held = memory.get(conversation2);
    if (held === void 0) throw new Error(`The plugin's memory holds no conversation "${conversation2}".`);
    memory.set(conversation2, changing(held));
    changed();
  }
  function get(conversation2) {
    if (cap === 0) return memory.get(conversation2);
    const held = findConversation(core.store.board(), conversation2);
    return held === void 0 ? void 0 : withOlder(conversation2, held);
  }
  function keep2(conversation2, message2, kept) {
    const held = keptOf.get(conversation2) ?? /* @__PURE__ */ new Map();
    held.set(message2, { ...held.get(message2), ...kept });
    keptOf.set(conversation2, held);
    changed();
  }
  function unkeep(conversation2, message2) {
    if (keptOf.get(conversation2)?.delete(message2) === true) changed();
  }
  function forget(conversation2) {
    const held = keptOf.get(conversation2);
    if (held === void 0) return;
    const ids = new Set(get(conversation2)?.messages.map((message2) => message2.id) ?? []);
    const gone = [...held.keys()].filter((id) => !ids.has(id));
    for (const id of gone) held.delete(id);
    if (gone.length > 0) changed();
  }
  return {
    opened: capped.then(() => void 0),
    all() {
      const now = cap === 0 ? void 0 : assistantState(core.store.board());
      if (given2 !== void 0 && given2.state === now && given2.changes === changes) return given2.all;
      const all = cap === 0 ? Object.fromEntries(memory) : Object.fromEntries(Object.entries(now?.conversations ?? {}).map(([id, conversation2]) => [id, withOlder(id, conversation2)]));
      given2 = { state: now, changes, all };
      return all;
    },
    get,
    kept(conversation2, message2) {
      return keptOf.get(conversation2)?.get(message2);
    },
    keep(conversation2, message2, kept) {
      if (get(conversation2)?.messages.some((held) => held.id === message2) !== true) {
        throw new Error(`The conversation "${conversation2}" holds no message "${message2}".`);
      }
      keep2(conversation2, message2, kept);
    },
    async addConversation(id, title2, model2 = null) {
      if (await capped !== 0) {
        await run("blockr.assistant-add_conversation", { id, title: title2, model: model2 });
        return;
      }
      if (memory.has(id)) throw new Error(`The plugin's memory holds a conversation "${id}" already.`);
      memory.set(id, newConversation(title2, model2));
      changed();
    },
    async renameConversation(conversation2, title2) {
      if (await capped !== 0) {
        await run("blockr.assistant-rename_conversation", { conversation: conversation2, title: title2 });
        return;
      }
      change(conversation2, (held) => ({ ...held, title: title2 }));
    },
    async removeConversation(conversation2) {
      if (await capped !== 0) {
        await run("blockr.assistant-remove_conversation", { conversation: conversation2 });
        return;
      }
      if (!memory.delete(conversation2)) throw new Error(`The plugin's memory holds no conversation "${conversation2}".`);
      keptOf.delete(conversation2);
      changed();
    },
    async addMessage(conversation2, message2, kept) {
      const read = await capped;
      if (kept !== void 0) keep2(conversation2, message2.id, kept);
      try {
        if (read !== 0) {
          const before = findConversation(core.store.board(), conversation2)?.messages ?? [];
          const done = run("blockr.assistant-add_message", { conversation: conversation2, message: message2, ...read === Infinity ? {} : { keep: read } });
          keepCut(conversation2, before);
          await done;
        } else {
          change(conversation2, (held) => {
            if (holdsMessage(held, message2.id)) {
              throw new Error(`The conversation "${conversation2}" holds a message "${message2.id}" already.`);
            }
            return { ...held, messages: [...held.messages, message2], updated: message2.created };
          });
        }
      } catch (error) {
        if (kept !== void 0) unkeep(conversation2, message2.id);
        throw error;
      }
    },
    async compactConversation(conversation2, summary2, from) {
      const read = await capped;
      const held = findConversation(core.store.board(), conversation2);
      if (read === 0) {
        change(conversation2, (inMemory) => ({ ...inMemory, messages: compacted(inMemory.messages, summary2, from, conversation2) }));
      } else if (held === void 0 || holdsMessage(held, from)) {
        await run("blockr.assistant-compact_conversation", { conversation: conversation2, summary: summary2, from });
        if (older.delete(conversation2)) changed();
      } else {
        const cut = older.get(conversation2) ?? [];
        const left = compacted([...cut, ...held.messages], summary2, from, conversation2);
        older.set(conversation2, left.slice(0, left.length - held.messages.length));
        changed();
      }
      forget(conversation2);
    },
    async addUsage(conversation2, input, output, total) {
      if (await capped !== 0) {
        await run("blockr.assistant-add_usage", { conversation: conversation2, input, output, total });
        return;
      }
      change(conversation2, (held) => ({ ...held, usage: addedUsage(held.usage, input, output, total) }));
    },
    async setModel(conversation2, model2) {
      if (await capped !== 0) {
        await run("blockr.assistant-set_model", { conversation: conversation2, model: model2 });
        return;
      }
      change(conversation2, (held) => ({ ...held, model: model2 }));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}
function compacted(messages, summary2, from, conversation2) {
  if (!canCompact(messages, summary2, from)) {
    throw new Error(
      `The conversation "${conversation2}" holds no message "${from}" for the summary to go before, or holds a message "${summary2.id}" from it on.`
    );
  }
  return [summary2, ...messages.slice(messages.findIndex((message2) => message2.id === from))];
}

// srcts/deployment/deployment.ts
var OPENAI = "https://api.openai.com/v1";
var APIS = ["openai-responses", "openai-completions", "anthropic-messages"];
async function readDeployment(core) {
  const [baseUrl, api2, key, models] = await Promise.all([
    core.blockrOption("assistant_base_url"),
    core.blockrOption("assistant_api"),
    core.blockrOption("assistant_api_key"),
    core.blockrOption("assistant_models")
  ]);
  return { baseUrl: baseUrlOf(baseUrl), api: apiOf(api2), credential: credentialOf(key), models: modelsOf(models) };
}
function baseUrlOf(sent2) {
  if (sent2 === void 0) return OPENAI;
  const url = typeof sent2 === "string" ? sent2.trim() : "";
  if (!isWebUrl(url)) {
    throw new TypeError(`The blockr option assistant_base_url is ${JSON.stringify(sent2)}, where it takes the URL that the assistant's calls go to, such as "${OPENAI}".`);
  }
  return url.replace(/\/+$/, "");
}
function apiOf(sent2) {
  if (sent2 === void 0) return "openai-responses";
  const api2 = typeof sent2 === "string" ? sent2.trim() : "";
  if (!APIS.includes(api2)) {
    throw new TypeError(
      `The blockr option assistant_api is ${JSON.stringify(sent2)}, where it takes the API that the base URL speaks: "openai-responses", "openai-completions" or "anthropic-messages".`
    );
  }
  return api2;
}
function credentialOf(sent2) {
  if (sent2 === void 0) return { kind: "visitor" };
  const key = typeof sent2 === "string" ? sent2.trim() : "";
  if (key === "") {
    throw new TypeError(
      `The blockr option assistant_api_key holds ${kindOf(sent2)}, where it takes the deployment's key as a string, or "none" for a base URL that needs no key.`
    );
  }
  return key === "none" ? { kind: "none" } : { kind: "deployment", key };
}
function modelsOf(sent2) {
  if (sent2 === void 0) return void 0;
  const ids = typeof sent2 === "string" ? sent2.split(",") : Array.isArray(sent2) && sent2.every((id) => typeof id === "string") ? sent2 : [];
  const named = [...new Set(ids.map((id) => id.trim()).filter((id) => id !== ""))];
  if (named.length === 0) {
    throw new TypeError(
      `The blockr option assistant_models is ${JSON.stringify(sent2)}, where it takes the ids of the models offered, the first being the default, as an array of strings or as one string that separates them by commas, such as "gpt-5.4,gpt-5.4-nano".`
    );
  }
  return named;
}
function isWebUrl(text3) {
  try {
    const { protocol } = new URL(text3);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}
function kindOf(sent2) {
  if (sent2 === null) return "null";
  if (typeof sent2 === "string") return "an empty string";
  if (typeof sent2 === "boolean") return "true or false";
  if (typeof sent2 === "number") return "a number";
  return Array.isArray(sent2) ? "an array" : "an object";
}

// srcts/loop/loop.ts
import { context as context2 } from "@opentelemetry/api";

// srcts/attachments/attachments.ts
var PDF = "application/pdf";
var IMAGES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
var TEXT_EXTENSIONS = {
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
  log: "text/plain"
};
var TEXTS = new Set(Object.values(TEXT_EXTENSIONS));
var MAX_BYTES = 30 * 1024 * 1024;
function kindOf2(mediaType) {
  if (IMAGES.includes(mediaType)) return "image";
  if (mediaType === PDF) return "pdf";
  return TEXTS.has(mediaType) ? "text" : void 0;
}
var ACCEPT = [...IMAGES, PDF, ...TEXTS, ...Object.keys(TEXT_EXTENSIONS).map((extension) => `.${extension}`)].join(",");
function namesOf(names) {
  const quoted = names.map((name) => `"${name}"`);
  return quoted.length <= 1 ? quoted.join("") : `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1) ?? ""}`;
}

// srcts/loop/files.ts
var PDF_URL = `data:${PDF};base64,`;
var UNNAMED = "document.pdf";
function withFiles(api2, payload, names) {
  if (!isRecord(payload)) return void 0;
  let next = 0;
  const name = () => names[next++] ?? UNNAMED;
  switch (api2) {
    case "anthropic-messages":
      return withBlocks(payload, "messages", (block) => anthropicDocument(block, name));
    case "openai-responses":
      return withBlocks(payload, "input", (block) => responsesFile(block, name));
    case "openai-completions":
      return withBlocks(payload, "messages", (block) => completionsFile(block, name));
    default:
      return void 0;
  }
}
function withBlocks(payload, key, filed) {
  const items = payload[key];
  if (!Array.isArray(items)) return void 0;
  const given2 = items;
  const next = given2.map((item) => {
    if (!isRecord(item) || item.role !== "user" || !Array.isArray(item.content)) return item;
    const blocks = item.content;
    const content = blocks.map((block) => isRecord(block) ? filed(block) ?? block : block);
    return content.some((block, index) => block !== blocks[index]) ? { ...item, content } : item;
  });
  return next.some((item, index) => item !== given2[index]) ? { ...payload, [key]: next } : void 0;
}
function anthropicDocument(block, name) {
  const source = block.source;
  if (block.type !== "image" || !isRecord(source) || source.type !== "base64" || source.media_type !== PDF) return void 0;
  const mark = block.cache_control;
  return { type: "document", source: { type: "base64", media_type: PDF, data: source.data }, title: name(), ...mark === void 0 ? {} : { cache_control: mark } };
}
function responsesFile(block, name) {
  const url = block.image_url;
  if (block.type !== "input_image" || typeof url !== "string" || !url.startsWith(PDF_URL)) return void 0;
  return { type: "input_file", filename: name(), file_data: url };
}
function completionsFile(block, name) {
  const image2 = block.image_url;
  const url = isRecord(image2) ? image2.url : void 0;
  if (block.type !== "image_url" || typeof url !== "string" || !url.startsWith(PDF_URL)) return void 0;
  return { type: "file", file: { filename: name(), file_data: url } };
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// srcts/loop/messages.ts
var ENDED = "The turn ended before this call returned.";
var STOPPED = "The user stopped the turn before this call returned.";
var SUMMARY_REQUEST = "Summarize our conversation so far.";
var FINISHED = /* @__PURE__ */ new Set(["stop", "toolUse", "length"]);
var NO_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
};
function callMessages(messages, kept, model2, tools, systemPrompt, carried) {
  return [systemMessage(systemPrompt, tools), ...piMessages(messages, kept, model2, carried)];
}
function systemMessage(prompt, tools) {
  const declared = tools.map((tool2) => ({ name: tool2.name, description: tool2.description, parameters: tool2.parameters }));
  return { role: "system", content: prompt, ...declared.length > 0 ? { toolsAdded: declared } : {}, timestamp: Date.now() };
}
function piMessages(messages, kept, model2, carried) {
  const out = [];
  for (let i = 0; i < messages.length; i += 1) {
    const message2 = messages[i];
    if (message2 === void 0) continue;
    const at2 = Date.parse(message2.created);
    if (message2.role === "user") {
      const content = userContent(message2, kept(message2.id)?.files ?? [], model2, carried);
      if (content.length > 0) out.push({ role: "user", content, timestamp: at2 });
    } else if (message2.role === "summary") {
      out.push({ role: "user", content: [text(SUMMARY_REQUEST)], timestamp: at2 }, otherReply(message2.parts, model2, at2));
    } else if (message2.role === "assistant") {
      out.push(asWritten(kept(message2.id)?.reply) ?? otherReply(message2.parts, model2, at2));
      const calls = message2.parts.filter(isToolCall);
      if (calls.length === 0) continue;
      const next = messages[i + 1];
      const results = next?.role === "tool" ? next : void 0;
      if (results !== void 0) i += 1;
      const images = results === void 0 ? void 0 : kept(results.id)?.images;
      out.push(...calls.map((call) => resultFor(call, results?.parts ?? [], images?.[call.id] ?? [], at2)));
    }
  }
  return out;
}
function userContent(message2, files, model2, carried) {
  let index = -1;
  return message2.parts.flatMap((part) => {
    switch (part.type) {
      case "text":
      case "changes":
      case "skill":
        return [text(part.text)];
      case "attachment":
        index += 1;
        return fileContent(part, files[index], { message: message2.id, index, name: part.name }, model2, carried);
      default:
        return [];
    }
  });
}
function fileContent(part, file, at2, model2, carried) {
  const attached = `The user attached the file "${part.name}", of the type ${part.media_type}`;
  if (file === void 0) return [text(`${attached}, whose content is no longer available.`)];
  if ("refused" in file) return [text(`${attached}, which the provider refused, so the conversation goes on without its content.`)];
  if ("text" in file) {
    note(file, at2, carried);
    return [text(`<file-attachment name="${attribute(part.name)}" type="${attribute(part.media_type)}">
${file.text}
</file-attachment>`)];
  }
  const kind = kindOf2(part.media_type);
  if (kind !== "image" && kind !== "pdf") return [text(`${attached}, which the app cannot send to the model.`)];
  if (!model2.input.includes("image")) return [text(`${attached}, which the app did not send, since the model takes no images.`)];
  note(file, at2, carried);
  if (kind === "pdf") carried?.pdfs.push(part.name);
  return [text(`${attached}.`), { type: "image", data: file.data, mimeType: part.media_type }];
}
function note(file, at2, carried) {
  if (!("taken" in file) || file.taken !== true) carried?.files.push(at2);
}
function attribute(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function asWritten(reply) {
  return typeof reply === "object" && reply !== null && reply.role === "assistant" ? reply : void 0;
}
function otherReply(parts, model2, at2) {
  const content = parts.flatMap((part) => {
    if (part.type === "text") return [text(part.text)];
    if (part.type === "tool_call") return [{ type: "toolCall", id: part.id, name: part.tool, arguments: { ...part.args } }];
    return [];
  });
  return {
    role: "assistant",
    content,
    api: model2.api,
    provider: model2.provider,
    model: "",
    usage: NO_USAGE,
    stopReason: content.some((block) => block.type === "toolCall") ? "toolUse" : "stop",
    timestamp: at2
  };
}
function resultFor(call, results, images, at2) {
  const result = results.find((part) => part.type === "tool_result" && part.id === call.id);
  if (result === void 0) return toolResult(call, [text(ENDED)], true, at2);
  const carried = result.images ?? 0;
  const said = images.length === 0 && carried > 0 ? `${result.text}

${imagesGone(carried)}` : result.text;
  return toolResult(call, [text(said), ...images.map(image)], result.error === true, at2);
}
function imagesGone(count) {
  const which = count === 1 ? "an image, which is" : `${String(count)} images, which are`;
  return `The result also held ${which} no longer available, since the board was opened again.`;
}
function toolResult(call, content, isError, at2) {
  return { role: "toolResult", toolCallId: call.id, toolName: call.tool, content, isError, timestamp: at2 };
}
function replyOf(reply) {
  const parts = partsOf(reply);
  if (parts.length === 0) return void 0;
  const reasoning = reasoningOf(reply);
  return {
    message: { id: newId(), role: "assistant", parts, created: new Date(reply.timestamp).toISOString() },
    kept: { ...reasoning.length > 0 ? { reasoning } : {}, ...FINISHED.has(reply.stopReason) ? { reply } : {} }
  };
}
function partsOf(reply) {
  return reply.content.flatMap((block) => {
    if (block.type === "text") return block.text.trim() === "" ? [] : [{ type: "text", text: block.text }];
    if (block.type === "toolCall") return [{ type: "tool_call", id: block.id, tool: block.name, args: block.arguments }];
    return [];
  });
}
function reasoningOf(reply) {
  return reply.content.flatMap((block) => block.type === "thinking" && block.redacted !== true && block.thinking.trim() !== "" ? [block.thinking] : []);
}
function resultsOf(calls, answered) {
  const answers = calls.map((call) => [call, answered(call)]);
  const parts = answers.map(([call, answer]) => ({
    type: "tool_result",
    id: call.id,
    text: answer.text,
    ...answer.isError ? { error: true } : {},
    ...answer.images.length > 0 ? { images: answer.images.length } : {}
  }));
  const images = Object.fromEntries(answers.filter(([, answer]) => answer.images.length > 0).map(([call, answer]) => [call.id, answer.images]));
  return {
    message: { id: newId(), role: "tool", parts, created: (/* @__PURE__ */ new Date()).toISOString() },
    kept: Object.keys(images).length > 0 ? { images } : {}
  };
}
function isToolCall(part) {
  return part.type === "tool_call";
}
function text(value) {
  return { type: "text", text: value };
}
function image(kept) {
  return { type: "image", data: kept.data, mimeType: kept.mimeType };
}

// srcts/loop/telemetry.ts
import { context, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
var SCOPE = "blockr.assistant";
var PI_CALL = "pi.ai.request";
var PROVIDERS = /* @__PURE__ */ new Map([
  ["anthropic-messages", "anthropic"],
  ["openai-completions", "openai"],
  ["openai-responses", "openai"]
]);
var RENAMED = /* @__PURE__ */ new Map([
  ["model", "gen_ai.request.model"],
  ["response.id", "gen_ai.response.id"],
  ["usage.output", "gen_ai.usage.output_tokens"]
]);
var INPUT = ["usage.input", "usage.cache_read", "usage.cache_write"];
var started = /* @__PURE__ */ new WeakMap();
function telemetryUnder(parent) {
  return { startSpan: (options, callback) => startSpan(parent, options, callback) };
}
function providerName(api2) {
  return PROVIDERS.get(api2) ?? api2;
}
function tracer() {
  return trace.getTracer(SCOPE);
}
function startSpan(parent, options, callback) {
  const naming = namingOf(options);
  const span = tracer().startSpan(naming.name, { kind: naming.kind, attributes: naming.attributes, links: linksOf(options.links ?? []) }, parent);
  const active = trace.setSpan(parent, span);
  let ended = false;
  let status;
  const given2 = {
    startSpan: (childOptions, childCallback) => ended ? startInert(childCallback) : startSpan(active, childOptions, childCallback),
    addLink(link) {
      const linked = ended ? void 0 : linkOf(link);
      if (linked !== void 0) span.addLink(linked);
    },
    addEvent(name, attributes) {
      if (!ended) span.addEvent(name, defined(attributes ?? {}));
    },
    setAttributes(attributes) {
      if (!ended) span.setAttributes(naming.set(attributes));
    },
    setStatus(set) {
      if (!ended) status = set;
    }
  };
  started.set(given2, span.spanContext());
  return settled(
    () => context.with(active, () => callback(given2)),
    (failure) => {
      ended = true;
      end(span, status ?? failure);
    }
  );
}
async function settled(run, end2) {
  let value;
  try {
    value = await run();
  } catch (error) {
    end2(failureOf(error));
    throw error;
  }
  end2();
  return value;
}
function failureOf(error) {
  return error instanceof Error ? { status: "error", error: { name: error.name, message: error.message } } : { status: "error" };
}
function end(span, status) {
  if (status?.status === "error") {
    const { error } = status;
    span.setStatus(error === void 0 ? { code: SpanStatusCode.ERROR } : { code: SpanStatusCode.ERROR, message: error.message });
    if (error !== void 0) span.setAttribute("error.type", error.name);
  }
  span.end();
}
var INERT = {
  startSpan: (_options, callback) => startInert(callback),
  addLink: () => void 0,
  addEvent: () => void 0,
  setAttributes: () => void 0,
  setStatus: () => void 0
};
async function startInert(callback) {
  return await callback(INERT);
}
function linkOf(link) {
  const linked = started.get(link.context);
  return linked === void 0 ? void 0 : { context: linked, attributes: defined(link.attributes ?? {}) };
}
function linksOf(links) {
  return links.flatMap((link) => linkOf(link) ?? []);
}
function defined(attributes) {
  const kept = {};
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== void 0) kept[name] = typeof value === "object" ? value.slice() : value;
  }
  return kept;
}
function namingOf(options) {
  const attributes = options.attributes ?? {};
  if (options.name !== PI_CALL) return { name: options.name, kind: SpanKind.INTERNAL, attributes: defined(attributes), set: defined };
  const set = callAttributes();
  return {
    name: typeof attributes.model === "string" ? `chat ${attributes.model}` : "chat",
    kind: SpanKind.CLIENT,
    attributes: { "gen_ai.operation.name": "chat", ...set(attributes) },
    set
  };
}
function callAttributes() {
  const input = /* @__PURE__ */ new Map();
  return (attributes) => {
    const given2 = defined(attributes);
    const named = {};
    for (const [name, value] of Object.entries(given2)) {
      if (name === "provider") continue;
      if (name === "api" && typeof value === "string") named["gen_ai.provider.name"] = providerName(value);
      if (isInput(name) && typeof value === "number") input.set(name, value);
      named[RENAMED.get(name) ?? name] = value;
    }
    if (INPUT.some((name) => Object.hasOwn(given2, name))) {
      named["gen_ai.usage.input_tokens"] = [...input.values()].reduce((sum, tokens3) => sum + tokens3, 0);
    }
    return named;
  };
}
function isInput(name) {
  return INPUT.includes(name);
}

// srcts/loop/loop.ts
var PROVIDER = "blockr.assistant";
var NO_KEY = "blockr-assistant-no-key";
function createLoop(pi, apis = {}) {
  const streams = {
    "anthropic-messages": pi.anthropicMessages,
    "openai-completions": pi.openaiCompletions,
    "openai-responses": pi.openaiResponses,
    ...apis
  };
  return { run: (turn) => runTurn(pi, streams, turn), inCatalog: (id) => catalogModel(pi, id) !== void 0 };
}
async function loadLoop() {
  return createLoop(await import("./pi-73d60f71.js"));
}
function runTurn(pi, streams, turn) {
  const attributes = {
    "gen_ai.operation.name": "invoke_agent",
    "gen_ai.provider.name": providerName(turn.connection.api),
    "gen_ai.request.model": turn.model
  };
  return telemetryUnder(context2.active()).startSpan({ name: "invoke_agent", attributes }, (span) => runAgent(pi, streams, turn, span));
}
async function runAgent(pi, streams, turn, span) {
  const model2 = modelOf(pi, turn.model, turn.connection, turn.settings, turn.listed);
  const models = pi.createModels();
  models.setProvider(
    pi.createProvider({
      id: PROVIDER,
      baseUrl: turn.connection.baseUrl,
      // The credential comes through getApiKey, so the provider takes none.
      auth: { apiKey: { name: "The assistant's credential", resolve: () => Promise.resolve({ auth: {} }) } },
      models: [model2],
      api: streams
    })
  );
  const given2 = /* @__PURE__ */ new Map();
  const answered = /* @__PURE__ */ new Map();
  const answer = (id) => given2.get(id) ?? answered.get(id) ?? { text: STOPPED, isError: true, images: [] };
  const tools = turn.tools.map((tool2) => agentTool(tool2, given2, span));
  const prompt = turn.systemPrompt ?? "";
  const kept = (message2) => turn.kept(message2);
  let carried = { files: [], pdfs: [] };
  let status;
  const config = {
    model: model2,
    reasoning: "medium",
    identity: { attribution: null },
    // The loop adds no messages of its own to pi's, so they go to the model
    // as they are.
    convertToLlm: (messages) => messages,
    transformContext: async (_messages, signal) => {
      const conversation2 = turn.messages();
      const transformed = turn.transformContext === void 0 ? conversation2 : await turn.transformContext(conversation2, signal ?? turn.signal);
      carried = { files: [], pdfs: [] };
      status = void 0;
      return callMessages(transformed, kept, model2, turn.tools, prompt, carried);
    },
    getApiKey: async () => await turn.connection.apiKey() ?? NO_KEY,
    fetch: async (input, init) => {
      const response = await keyless(input, init);
      status = response.status;
      return response;
    },
    onPayload: (payload) => {
      const filed = carried.pdfs.length === 0 ? void 0 : withFiles(model2.api, payload, carried.pdfs);
      if (turn.onPayload === void 0) return filed;
      return turn.onPayload(filed ?? payload) ?? filed;
    }
  };
  const emit = async (event) => {
    switch (event.type) {
      case "message_start":
      case "message_update":
        if (event.message.role === "assistant") turn.on.streaming({ parts: partsOf(event.message), reasoning: reasoningOf(event.message) });
        return;
      case "message_end":
        if (event.message.role === "assistant") await turn.on.called(callOf(event.message, carried, status));
        return;
      case "tool_execution_end":
        if (!given2.has(event.toolCallId) && !turn.signal.aborted) {
          answered.set(event.toolCallId, answeredOf(event.result, event.isError));
        }
        turn.on.returned(event.toolCallId, answer(event.toolCallId));
        return;
      case "turn_end": {
        if (event.message.role !== "assistant" || event.message.stopReason === "error") return;
        const calls = partsOf(event.message).filter(isToolCall);
        if (calls.length === 0) return;
        const results = resultsOf(calls, (call) => answer(call.id));
        await turn.on.results(results.message, results.kept);
        return;
      }
      default:
        return;
    }
  };
  const begun = { messages: callMessages(turn.messages(), kept, model2, turn.tools, prompt), tools };
  await pi.runAgentLoopContinue(
    begun,
    config,
    emit,
    turn.signal,
    (called, messages, options) => models.streamSimple(called, messages, { ...options, telemetry: span })
  );
}
function modelOf(pi, id, connection, given2 = {}, listed2 = {}) {
  const at2 = { id, api: connection.api, provider: PROVIDER, baseUrl: connection.baseUrl };
  const known = catalogModel(pi, given2.like ?? id);
  const base = known === void 0 ? {
    ...at2,
    name: id,
    reasoning: false,
    input: inputOf(["text", "image"], listed2.images),
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: listed2.contextWindow ?? 128e3,
    maxTokens: listed2.maxTokens ?? 16384
  } : { ...known, ...at2, headers: void 0, compat: known.api === connection.api ? known.compat : void 0 };
  return {
    ...base,
    reasoning: given2.reasoning ?? base.reasoning,
    input: inputOf(base.input, given2.images),
    contextWindow: given2.contextWindow ?? base.contextWindow,
    maxTokens: given2.maxTokens ?? base.maxTokens
  };
}
function inputOf(input, images) {
  if (images === void 0) return input;
  const others = input.filter((kind) => kind !== "image");
  return images ? [...others, "image"] : others;
}
function catalogModel(pi, id) {
  for (const catalog of [pi.ANTHROPIC_MODELS, pi.OPENAI_MODELS]) {
    if (Object.hasOwn(catalog, id)) return catalog[id];
  }
  return void 0;
}
function keyless(input, init) {
  const headers = new Headers(init?.headers);
  if (headers.get("authorization") === `Bearer ${NO_KEY}`) headers.delete("authorization");
  if (headers.get("x-api-key") === NO_KEY) headers.delete("x-api-key");
  return globalThis.fetch(input, { ...init, headers });
}
var REFUSED = /* @__PURE__ */ new Set([400, 413, 415, 422]);
function callOf(reply, carried, status) {
  const written = replyOf(reply);
  const failed = reply.stopReason === "error";
  return {
    ...written === void 0 ? {} : { reply: written },
    usage: { input: reply.usage.input, output: reply.usage.output, total: reply.usage.totalTokens },
    ...failed ? { failure: reply.errorMessage ?? "The provider gave no reason." } : {},
    files: carried.files,
    refused: failed && status !== void 0 && REFUSED.has(status)
  };
}
function agentTool(tool2, given2, turn) {
  return {
    name: tool2.name,
    label: tool2.name,
    description: tool2.description,
    parameters: tool2.parameters,
    executionMode: tool2.executionMode,
    async execute(id, args, signal) {
      const attributes = {
        "gen_ai.operation.name": "execute_tool",
        "gen_ai.tool.name": tool2.name,
        "gen_ai.tool.description": tool2.description,
        "gen_ai.tool.call.id": id
      };
      const result = await turn.startSpan(
        { name: `execute_tool ${tool2.name}`, attributes },
        () => tool2.execute(args, signal ?? new AbortController().signal)
      );
      given2.set(id, { text: result.text, isError: result.isError, images: result.images });
      const content = [{ type: "text", text: result.text }, ...result.images.map(image)];
      return { content, details: void 0, isError: result.isError };
    }
  };
}
function answeredOf(result, isError) {
  const text3 = result.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("\n");
  const images = result.content.flatMap((block) => block.type === "image" ? [{ data: block.data, mimeType: block.mimeType }] : []);
  return { text: text3, isError, images };
}

// srcts/notifications/notifications.ts
function heldError(core, signal, code) {
  let withdraw;
  signal.addEventListener(
    "abort",
    () => {
      withdraw = void 0;
    },
    { once: true }
  );
  return {
    raise(message2) {
      if (signal.aborted) return;
      withdraw?.();
      withdraw = core.notifications.notify(ASSISTANT, { severity: "error", code, message: message2 });
    },
    withdraw() {
      withdraw?.();
      withdraw = void 0;
    }
  };
}

// srcts/requests/requests.ts
async function sendRequest(core, name, args, opts = {}) {
  let conditions = [];
  const answer = await core.request(ASSISTANT, name, args, {
    ...opts,
    conditions: (given2) => {
      conditions = given2;
    }
  });
  return { answer, conditions };
}
async function sendUntilReplied(core, name, args, opts = {}) {
  for (; ; ) {
    try {
      return await sendRequest(core, name, args, opts);
    } catch (error) {
      if (!isSessionEnded(error) || opts.signal?.aborted === true) throw error;
    }
  }
}
function appPackages(core) {
  return Object.keys(core.store.packages());
}
function answeredText(answer, name) {
  if (isArray(answer) && answer.length === 1 && typeof answer[0] === "string") return answer[0];
  throw new TypeError(`R answered the request ${name} with ${shown(answer)}, where it writes one string.`);
}
function answeredTexts(answer, name) {
  if (answer !== void 0 && isArray(answer) && answer.every((value) => typeof value === "string")) return [...answer];
  throw new TypeError(`R answered the request ${name} with ${shown(answer ?? null)}, where it writes strings.`);
}
function answeredObject(answer, name) {
  if (answer !== null && typeof answer === "object" && !isArray(answer) && !(answer instanceof Blob)) return answer;
  throw new TypeError(`R answered the request ${name} with ${shown(answer)}, where it writes an object.`);
}
function isRequestError(error) {
  return error instanceof Error && error.name === "RequestError";
}
function isSessionEnded(error) {
  return error instanceof Error && error.name === "SessionEndedError";
}
function failureMessage(error) {
  if (isRequestError(error)) {
    const said = error.conditions.filter((condition) => condition.severity === "error").map((condition) => condition.message);
    if (said.length > 0) return said.join("\n");
  }
  return error instanceof Error ? error.message : String(error);
}
function isArray(value) {
  return Array.isArray(value);
}
function shown(answer) {
  return answer instanceof Blob ? "a file" : JSON.stringify(answer);
}

// srcts/model-settings/model-settings.ts
var NONE = /* @__PURE__ */ new Map();
var WITHOUT = "The assistant goes on without the deployment's model settings";
var FILE = "the file that the blockr option assistant_model_settings names";
var CATALOGS = "pi's catalogs of OpenAI's and Anthropic's models";
function createModelSettings(core, signal) {
  const failed = heldError(core, signal, "assistant_model_settings_failed");
  const read = readSettings(core, signal, failed);
  let checking;
  return {
    checked(inCatalog) {
      checking ??= read.then((settings) => {
        for (const [id, given2] of settings) {
          if (given2.like !== void 0 && !inCatalog(given2.like)) {
            failed.raise(`${WITHOUT}, since ${FILE} gives the model ${id} the like ${JSON.stringify(given2.like)}, which names no model of ${CATALOGS}.`);
            return NONE;
          }
        }
        return settings;
      });
      return checking;
    }
  };
}
async function readSettings(core, signal, failed) {
  let answer;
  try {
    ({ answer } = await sendUntilReplied(core, "read_model_settings", {}, { signal }));
  } catch (error) {
    if (!signal.aborted) failed.raise(`${WITHOUT}, since R could not read them: ${failureMessage(error)}`);
    return NONE;
  }
  try {
    return settingsOf(answer);
  } catch (error) {
    failed.raise(`${WITHOUT}, since ${error instanceof Error ? error.message : String(error)}`);
    return NONE;
  }
}
function settingsOf(reply) {
  if (reply === null) return NONE;
  if (!isObject2(reply)) throw new TypeError(`${FILE} gives ${shown2(reply)}, where it gives each model's settings by the model's id.`);
  return new Map(Object.entries(reply).map(([id, entry]) => [id, entryOf(id, entry)]));
}
function entryOf(id, entry) {
  if (entry === null) return {};
  if (!isObject2(entry)) {
    throw new TypeError(`${FILE} gives the model ${id} ${shown2(entry)}, where it gives the model's settings by their names, such as reasoning: true.`);
  }
  let settings = {};
  for (const [name, value] of Object.entries(entry)) {
    switch (name) {
      case "like":
        settings = { ...settings, like: text2(id, name, value) };
        break;
      case "reasoning":
        settings = { ...settings, reasoning: flag(id, name, value) };
        break;
      case "images":
        settings = { ...settings, images: flag(id, name, value) };
        break;
      case "context_window":
        settings = { ...settings, contextWindow: tokens(id, name, value) };
        break;
      case "max_tokens":
        settings = { ...settings, maxTokens: tokens(id, name, value) };
        break;
      default:
        throw new TypeError(
          `${FILE} gives the model ${id} the setting ${name}, which the assistant does not know. A model's settings are like, reasoning, images, context_window and max_tokens.`
        );
    }
  }
  return settings;
}
function one(value) {
  return Array.isArray(value) && value.length === 1 ? value[0] : void 0;
}
function text2(id, name, value) {
  const given2 = one(value);
  if (typeof given2 === "string" && given2 !== "") return given2;
  throw refused(id, name, value, `the id of a model of ${CATALOGS}, such as claude-sonnet-5-5`);
}
function flag(id, name, value) {
  const given2 = one(value);
  if (typeof given2 === "boolean") return given2;
  throw refused(id, name, value, "true or false");
}
function tokens(id, name, value) {
  const given2 = one(value);
  if (typeof given2 === "number" && Number.isSafeInteger(given2) && given2 > 0) return given2;
  throw refused(id, name, value, "a whole number of tokens above 0, such as 128000");
}
function refused(id, name, value, takes) {
  return new TypeError(`${FILE} gives the model ${id} the ${name} ${shown2(value)}, where ${name} takes ${takes}.`);
}
function isObject2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Blob);
}
function shown2(value) {
  if (value instanceof Blob) return "a file";
  return JSON.stringify(one(value) ?? value);
}

// srcts/models/list.ts
var NO_TOOLS = /* @__PURE__ */ new Set([
  "audio",
  "babbage",
  "dall",
  "davinci",
  "embedding",
  "evaluation",
  "image",
  "instruct",
  "live",
  "moderation",
  "realtime",
  "reranking",
  "search",
  "sora",
  "speech",
  "transcribe",
  "transcription",
  "tts",
  "video",
  "whisper"
]);
var CALLS = {
  "openai-responses": "/responses",
  "openai-completions": "/chat/completions",
  "anthropic-messages": "/v1/messages"
};
async function askList(deployment, key, fetch, signal) {
  const url = listUrl(deployment);
  const none = (why) => ({ kind: "failed", message: `The assistant offers no model, since ${why}` });
  let response;
  try {
    response = await fetch(url, { headers: listHeaders(deployment.api, key), signal });
  } catch (error) {
    return none(`it could not reach the list of models at ${url}: ${messageOf(error)}`);
  }
  if (response.status === 401 || response.status === 403) {
    return { kind: "refused", message: `The base URL refused the assistant's key for its list of models at ${url}: it answered ${await answerOf(response)}.` };
  }
  if (!response.ok) {
    return none(`the base URL gives no list of models at ${url}: it answered ${await answerOf(response)}. An app on such a base URL names its models in the blockr option assistant_models.`);
  }
  let entries;
  try {
    const body = await response.json();
    entries = isRecord2(body) ? body.data : void 0;
  } catch (error) {
    return none(`the answer at ${url} is no list of models: ${messageOf(error)}`);
  }
  if (!Array.isArray(entries)) {
    return none(`the answer at ${url} holds no list of models in its data. An app on such a base URL names its models in the blockr option assistant_models.`);
  }
  const models = toolModels(entries, deployment.api);
  if (models.length === 0) {
    return none(`the list of models at ${url} holds none that takes tools. An app on such a base URL names its models in the blockr option assistant_models.`);
  }
  return { kind: "listed", models, settings: listedSettings(entries, models) };
}
function listedSettings(entries, models) {
  const wanted = new Set(models);
  const settings = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    if (!isRecord2(entry) || typeof entry.id !== "string" || !wanted.has(entry.id)) continue;
    wanted.delete(entry.id);
    const given2 = settingsOf2(entry);
    if (Object.keys(given2).length > 0) settings.set(entry.id, given2);
  }
  return settings;
}
function settingsOf2(entry) {
  const contextWindow = tokensOf(entry.context_length) ?? tokensOf(entry.context_window) ?? tokensOf(entry.max_input_tokens);
  const maxTokens = tokensOf(fieldOf(entry.top_provider, "max_completion_tokens")) ?? tokensOf(entry.max_tokens);
  const images = imagesOf(fieldOf(entry.architecture, "input_modalities")) ?? imagesOf(fieldOf(entry.modalities, "input")) ?? flagOf(fieldOf(fieldOf(entry.capabilities, "image_input"), "supported"));
  return {
    ...contextWindow === void 0 ? {} : { contextWindow },
    ...maxTokens === void 0 ? {} : { maxTokens },
    ...images === void 0 ? {} : { images }
  };
}
function fieldOf(value, name) {
  return isRecord2(value) ? value[name] : void 0;
}
function tokensOf(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : void 0;
}
function imagesOf(value) {
  return Array.isArray(value) && value.every((input) => typeof input === "string") ? value.includes("image") : void 0;
}
function flagOf(value) {
  return typeof value === "boolean" ? value : void 0;
}
function toolModels(entries, api2) {
  const kept = /* @__PURE__ */ new Set();
  for (const entry of entries) {
    if (isRecord2(entry) && typeof entry.id === "string" && entry.id !== "" && takesTools(entry, entry.id, api2)) kept.add(entry.id);
  }
  return [...kept];
}
function takesTools(entry, id, api2) {
  if (typeof entry.type === "string" && NO_TOOLS.has(entry.type)) return false;
  const path = CALLS[api2] ?? "";
  if (Array.isArray(entry.endpoints) && !entry.endpoints.some((endpoint) => typeof endpoint === "string" && endpoint.endsWith(path))) return false;
  const parameters = Array.isArray(entry.supported_parameters) ? entry.supported_parameters : void 0;
  const tags = Array.isArray(entry.tags) ? entry.tags : void 0;
  if (parameters !== void 0 || tags !== void 0) {
    return (parameters?.includes("tools") ?? false) || (tags?.includes("tool-use") ?? false);
  }
  return !id.toLowerCase().split(/[^a-z0-9]+/).some((word) => NO_TOOLS.has(word));
}
function listUrl(deployment) {
  return deployment.api === "anthropic-messages" ? `${deployment.baseUrl}/v1/models?limit=1000` : `${deployment.baseUrl}/models`;
}
function listHeaders(api2, key) {
  if (api2 === "anthropic-messages") {
    return {
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      ...key === void 0 ? {} : { "x-api-key": key }
    };
  }
  return key === void 0 ? {} : { authorization: `Bearer ${key}` };
}
async function answerOf(response) {
  let message2;
  try {
    const body = await response.json();
    message2 = isRecord2(body) && isRecord2(body.error) ? body.error.message : void 0;
  } catch {
    message2 = void 0;
  }
  return typeof message2 === "string" && message2 !== "" ? `${String(response.status)}, "${message2}"` : String(response.status);
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

// srcts/models/models.ts
var NONE2 = { offered: { models: [] }, again: false };
function createModels(core, signal, options) {
  const modelsFailed = heldError(core, signal, "assistant_models_failed");
  const fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  async function ask() {
    let deployment;
    try {
      deployment = await options.deployment;
    } catch {
      return NONE2;
    }
    if (deployment.models !== void 0) return { offered: { models: deployment.models }, again: false };
    const { credential } = deployment;
    if (credential.kind === "visitor") return NONE2;
    const listed2 = await askList(deployment, credential.kind === "deployment" ? credential.key : void 0, fetch, signal);
    if (signal.aborted) return NONE2;
    switch (listed2.kind) {
      case "listed": {
        modelsFailed.withdraw();
        const { models, settings } = listed2;
        return { offered: { models, ...settings.size === 0 ? {} : { settings } }, again: false };
      }
      case "refused":
        modelsFailed.withdraw();
        options.callFailed.raise(listed2.message);
        return { offered: { models: [], failure: listed2.message }, again: true };
      case "failed":
        modelsFailed.raise(listed2.message);
        return { offered: { models: [], failure: listed2.message }, again: true };
    }
  }
  let last = ask();
  return {
    offered() {
      last = last.then((asked) => asked.again && !signal.aborted ? ask() : asked);
      return last.then((asked) => asked.offered);
    }
  };
}

// srcts/skills/skills.ts
function createSkills(core, signal) {
  const listed2 = listSkills(core, signal);
  return { list: () => listed2 };
}
async function listSkills(core, signal) {
  try {
    const { answer } = await sendUntilReplied(core, "list_skills", { packages: appPackages(core) }, { signal });
    return skillsOf(answer);
  } catch (error) {
    if (signal.aborted) return [];
    core.notifications.notify(ASSISTANT, {
      severity: "error",
      code: "assistant_skills_failed",
      message: `The assistant goes on without skills, since R could not list them: ${failureMessage(error)}`
    });
    return [];
  }
}
function skillsOf(reply) {
  if (!Array.isArray(reply)) throw new TypeError("R's reply to list_skills is not a list of skills.");
  return reply.map((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new TypeError(`R's reply to list_skills holds ${JSON.stringify(entry)}, where it holds a skill.`);
    }
    const fields = entry;
    return {
      name: one2(fields, "name"),
      description: one2(fields, "description"),
      blocks: answeredTexts(fields.blocks, "list_skills"),
      plugins: answeredTexts(fields.plugins, "list_skills"),
      userInvocable: flag2(fields, "user-invocable"),
      modelInvocable: !flag2(fields, "disable-model-invocation")
    };
  });
}
function one2(fields, name) {
  const [value, ...rest] = answeredTexts(fields[name], "list_skills");
  if (value === void 0 || rest.length > 0) {
    throw new TypeError(`R's reply to list_skills gives a skill's ${name} as ${JSON.stringify(fields[name] ?? null)}, where it gives one string.`);
  }
  return value;
}
function flag2(fields, name) {
  const value = fields[name];
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === "boolean") return value[0];
  throw new TypeError(`R's reply to list_skills gives a skill's ${name} as ${JSON.stringify(value ?? null)}, where it gives true or false.`);
}

// srcts/tools/edit.ts
import { context as context4 } from "@opentelemetry/api";

// srcts/commands/command.ts
function command(definition) {
  return {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    args: definition.args,
    undo: false,
    preflight: (board, args) => definition.preflight(board, args),
    run: (board, args) => definition.run(board, args)
  };
}

// srcts/commands/schemas.ts
var DEFINITIONS = JSON.parse(
  JSON.stringify(assistant_plugin_schema_default.definitions).replaceAll('"#/definitions/', '"#/$defs/')
);
function object(properties, required) {
  const defs = definitionsFor(properties);
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
    ...Object.keys(defs).length === 0 ? {} : { $defs: defs }
  };
}
var conversation = { type: "string", description: "The id of a conversation." };
var title = { type: "string", description: "The title of the conversation." };
var model = {
  type: ["string", "null"],
  description: `The conversation's pick of the model, such as "gpt-5.4", or null for the default.`
};
var message = {
  $ref: "#/$defs/Message",
  description: "The message, which no message of the conversation has the id of."
};
var summary = {
  allOf: [{ $ref: "#/$defs/Message" }, { type: "object", properties: { role: { const: "summary" } } }],
  description: "The summary, a message of the role summary, which takes the place of the messages that it summarizes. No message that the conversation keeps has its id."
};
function keep(description) {
  return { type: "integer", minimum: 1, description };
}
function tokens2(description) {
  return { type: "integer", minimum: 0, description };
}
function definitionsFor(value) {
  const picked = /* @__PURE__ */ new Map();
  const queue = referenced(value);
  for (let name = queue.pop(); name !== void 0; name = queue.pop()) {
    if (picked.has(name)) continue;
    const definition = DEFINITIONS[name];
    if (definition === void 0) throw new Error(`The schema of the assistant's state defines no "${name}".`);
    picked.set(name, definition);
    queue.push(...referenced(definition));
  }
  return Object.fromEntries([...picked].sort(([a], [b]) => a < b ? -1 : 1));
}
function referenced(value) {
  return [...JSON.stringify(value).matchAll(/"#\/\$defs\/([^"]+)"/g)].flatMap((match) => match.slice(1, 2));
}

// srcts/commands/commands.ts
function holds(board, conversation2) {
  return findConversation(board, conversation2) !== void 0;
}
function drops(conversation2, count) {
  return Array.from({ length: count }, () => ({ op: "remove", path: at("conversations", conversation2, "messages", "0") }));
}
var assistantCommands = [
  command({
    id: "blockr.assistant-add_conversation",
    label: "Add conversation",
    description: "Adds a conversation that holds no message, under the id given, with its title and its pick of the model, or null for the default where that is left out. It fails its preflight for an id that a conversation has already.",
    args: object(
      {
        id: { type: "string", minLength: 1, description: "The id of the new conversation." },
        title,
        model
      },
      ["id", "title"]
    ),
    preflight: (board, { id }) => {
      const state = assistantState(board);
      return state !== void 0 && !Object.hasOwn(state.conversations, id);
    },
    run: (_board, { id, title: title2, model: model2 }) => ({
      patches: [{ op: "add", path: at("conversations", id), value: newConversation(title2, model2 ?? null) }]
    })
  }),
  command({
    id: "blockr.assistant-rename_conversation",
    label: "Rename conversation",
    description: "Gives a conversation a new title.",
    args: object({ conversation, title }, ["conversation", "title"]),
    preflight: (board, { conversation: conversation2 }) => holds(board, conversation2),
    run: (_board, { conversation: conversation2, title: title2 }) => ({
      patches: [{ op: "replace", path: at("conversations", conversation2, "title"), value: title2 }]
    })
  }),
  command({
    id: "blockr.assistant-remove_conversation",
    label: "Remove conversation",
    description: "Removes a conversation with its messages.",
    args: object({ conversation }, ["conversation"]),
    preflight: (board, { conversation: conversation2 }) => holds(board, conversation2),
    run: (_board, { conversation: conversation2 }) => ({ patches: [{ op: "remove", path: at("conversations", conversation2) }] })
  }),
  command({
    id: "blockr.assistant-add_message",
    label: "Add message",
    description: "Adds a finished message at the end of a conversation, and sets the conversation's `updated` to the message's `created`. Where `keep` is given, it then drops the conversation's oldest exchanges until `keep` messages or fewer are left, counting no note of what others changed in the board. An exchange starts at a message that the user sent, or at a summary, and the last exchange is never dropped, however many messages it holds. It fails its preflight for a message whose id a message of the conversation has.",
    args: object(
      {
        conversation,
        message,
        keep: keep("How many messages the conversation keeps, every one where this is left out.")
      },
      ["conversation", "message"]
    ),
    preflight: (board, { conversation: conversation2, message: message2 }) => {
      const held = findConversation(board, conversation2);
      return held !== void 0 && !holdsMessage(held, message2.id);
    },
    run: (board, { conversation: conversation2, message: message2, keep: keep2 }) => {
      const messages = [...findConversation(board, conversation2)?.messages ?? [], message2];
      return {
        patches: [
          { op: "add", path: at("conversations", conversation2, "messages", "-"), value: message2 },
          ...drops(conversation2, keep2 === void 0 ? 0 : messagesToDrop(messages, keep2)),
          { op: "replace", path: at("conversations", conversation2, "updated"), value: message2.created }
        ]
      };
    }
  }),
  command({
    id: "blockr.assistant-trim_conversations",
    label: "Trim conversations",
    description: "Drops the oldest exchanges of every conversation until `keep` messages or fewer are left of each, as blockr.assistant-add_message drops them.",
    args: object({ keep: keep("How many messages each conversation keeps.") }, ["keep"]),
    preflight: (board) => assistantState(board) !== void 0,
    run: (board, { keep: keep2 }) => ({
      patches: Object.entries(assistantState(board)?.conversations ?? {}).flatMap(
        ([id, conversation2]) => drops(id, messagesToDrop(conversation2.messages, keep2))
      )
    })
  }),
  command({
    id: "blockr.assistant-compact_conversation",
    label: "Compact conversation",
    description: "Puts a summary in place of the messages of a conversation before `from`, the first message that it keeps. It fails its preflight where the conversation no longer holds `from`.",
    args: object(
      {
        conversation,
        summary,
        from: { type: "string", description: "The id of the first message that the conversation keeps after the summary." }
      },
      ["conversation", "summary", "from"]
    ),
    preflight: (board, { conversation: conversation2, summary: summary2, from }) => {
      const held = findConversation(board, conversation2);
      return held !== void 0 && canCompact(held.messages, summary2, from);
    },
    run: (board, { conversation: conversation2, summary: summary2, from }) => {
      const index = (findConversation(board, conversation2)?.messages ?? []).findIndex((message2) => message2.id === from);
      return {
        patches: [
          ...drops(conversation2, Math.max(index, 0)),
          { op: "add", path: at("conversations", conversation2, "messages", "0"), value: summary2 }
        ]
      };
    }
  }),
  command({
    id: "blockr.assistant-add_usage",
    label: "Add usage",
    description: "Adds a call's input and output tokens to a conversation's count, and keeps `total`, every token of the call, its cached input included, as the conversation's `last`.",
    args: object(
      {
        conversation,
        input: tokens2("The input tokens of the call."),
        output: tokens2("The output tokens of the call."),
        total: tokens2("Every token of the call, its cached input included.")
      },
      ["conversation", "input", "output", "total"]
    ),
    preflight: (board, { conversation: conversation2 }) => holds(board, conversation2),
    run: (board, { conversation: conversation2, input, output, total }) => {
      const usage = findConversation(board, conversation2)?.usage ?? { input: 0, output: 0, last: 0 };
      return {
        patches: [{ op: "replace", path: at("conversations", conversation2, "usage"), value: addedUsage(usage, input, output, total) }]
      };
    }
  }),
  command({
    id: "blockr.assistant-set_model",
    label: "Set model",
    description: "Sets a conversation's pick of the model, or removes it with null, after which the conversation talks to the default.",
    args: object({ conversation, model }, ["conversation", "model"]),
    preflight: (board, { conversation: conversation2 }) => holds(board, conversation2),
    run: (_board, { conversation: conversation2, model: model2 }) => ({
      patches: [{ op: "replace", path: at("conversations", conversation2, "model"), value: model2 }]
    })
  })
];

// srcts/tools/caps.ts
var DEFAULTS = {
  // What describe_block and describe_stack give, and what describe_result()
  // writes, which R cuts.
  assistant_summary_max_chars: 2e3,
  // What get_block_state and get_plugin_state give.
  assistant_state_max_chars: 2e4,
  // A value of the state that describe_block gives.
  assistant_state_value_max_chars: 128,
  // A description in a list: of a block class, a command or a plugin.
  assistant_description_max_chars: 1e3,
  // The description of a skill that names a class.
  assistant_skill_description_max_chars: 1024,
  // What the model's own R code prints, which R cuts, and the warnings and
  // messages of R's reply to a tool's request.
  assistant_eval_max_chars: 16e3,
  // The blocks that the review of an edit covers.
  assistant_review_max_blocks: 50
};
async function readToolCap(core, name) {
  const sent2 = await core.blockrOption(name);
  if (sent2 === void 0) return DEFAULTS[name];
  const value = sentNumber(sent2);
  if (Number.isInteger(value) && value >= 0) return value;
  throw new RangeError(`The blockr option ${name} is ${JSON.stringify(sent2)}, where it takes a whole number of 0 or more.`);
}

// srcts/tools/cut.ts
function cutText(text3, max, hint) {
  const chars = Array.from(text3);
  if (chars.length <= max) return text3;
  const marker = (lost) => `
... [+${String(lost)} chars truncated${hint === void 0 ? "" : ` -- ${hint}`}]`;
  const keep2 = Math.max(0, max - Array.from(marker(chars.length)).length);
  return chars.slice(0, keep2).join("") + marker(chars.length - keep2);
}
function leaveOutLong(value, max, hint) {
  if (typeof value === "string") {
    return Array.from(JSON.stringify(value)).length > max ? `[${String(Array.from(value).length)} chars omitted -- ${hint}]` : value;
  }
  if (Array.isArray(value)) return value.map((item) => leaveOutLong(item, max, hint));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, leaveOutLong(item, max, hint)]));
  }
  return value;
}
function bounded(value, max) {
  let budget = max;
  const spend = (text3) => {
    const kept = cutText(text3, Math.max(0, budget));
    budget -= Array.from(kept).length;
    return kept;
  };
  const walk = (item) => {
    if (typeof item === "string") return spend(item);
    if (Array.isArray(item)) return item.map(walk);
    if (item !== null && typeof item === "object") {
      return Object.fromEntries(Object.entries(item).map(([key, inner]) => [key, walk(inner)]));
    }
    const text3 = JSON.stringify(item);
    if (text3.length <= budget) {
      budget -= text3.length;
      return item;
    }
    return spend(text3);
  };
  return walk(value);
}
function skillBlurb(name, description, max) {
  return cutText(description.replace(/\s+/g, " ").trim(), max, `call read_skill("${name}") for the rest`);
}

// srcts/tools/context.ts
function own(record, key) {
  return Object.hasOwn(record, key) ? record[key] : void 0;
}
async function skillsNaming(context6, kind, id) {
  const [listed2, max] = await Promise.all([context6.skills.list(), readToolCap(context6.core, "assistant_skill_description_max_chars")]);
  return listed2.filter((skill) => skill.modelInvocable && skill[kind].includes(id)).map((skill) => ({ name: skill.name, description: skillBlurb(skill.name, skill.description, max) }));
}

// srcts/tools/changes.ts
var ORIGIN2 = "assistant";
var OWN_STATE = at();
function hear(core) {
  const heard = [];
  let last = core.store.board();
  const stop = core.store.subscribe((change, board) => {
    const before = last;
    last = board;
    if (!("delta" in change) || change.origin !== ORIGIN2 || ownStateOnly(change.delta)) return;
    heard.push({ delta: change.delta, before, after: board });
  });
  return { heard: () => heard, stop };
}
function changedBlocks(heard) {
  const changed = /* @__PURE__ */ new Set();
  const add = (id) => {
    if (id !== void 0) changed.add(id);
  };
  for (const { delta, before, after } of heard) {
    for (const id of Object.keys(delta.blocks?.add ?? {})) add(id);
    for (const [id, mod] of Object.entries(delta.blocks?.mod ?? {})) {
      if (mod.state !== void 0 || mod.unset !== void 0) add(id);
    }
    for (const link of Object.values(delta.links?.add ?? {})) add(link.to);
    for (const id of delta.links?.rm ?? []) add(own(before.links, id)?.to);
    for (const id of Object.keys(delta.links?.mod ?? {})) {
      add(own(before.links, id)?.to);
      add(own(after.links, id)?.to);
    }
  }
  return [...changed];
}
function addedAndRemoved(heard) {
  const first = heard[0];
  const last = heard.at(-1);
  if (first === void 0 || last === void 0) return { added: {}, removed: {} };
  return { added: missing(last.after, first.before), removed: missing(first.before, last.after) };
}
function setsOnlyOptions(heard) {
  return heard.every(({ delta }) => holds2(delta).every((part) => part === "options"));
}
function missing(board, other) {
  const ids = {};
  for (const kind of ["blocks", "links", "stacks"]) {
    const lacking = Object.keys(board[kind]).filter((id) => !Object.hasOwn(other[kind], id));
    if (lacking.length > 0) ids[kind] = lacking;
  }
  return ids;
}
function ownStateOnly(delta) {
  const patches = delta.patches ?? [];
  return holds2(delta).every((part) => part === "patches") && patches.length > 0 && patches.every(({ path }) => path === OWN_STATE || path.startsWith(`${OWN_STATE}/`));
}
function holds2(delta) {
  return Object.entries(delta).filter(([, part]) => holdsChange(part)).map(([key]) => key);
}
function holdsChange(part) {
  if (typeof part === "string") return true;
  if (Array.isArray(part)) return part.length > 0;
  if (part === null || typeof part !== "object") return false;
  return Object.values(part).some(
    (member) => Array.isArray(member) ? member.length > 0 : member !== null && typeof member === "object" && Object.keys(member).length > 0
  );
}

// srcts/tools/failures.ts
function failureText(error) {
  if (isSessionEnded(error)) {
    return "R's session ended before R answered, so the request was lost, and core does not send it to the new session. Call the tool again to send it there.";
  }
  if (isRequestError(error) && error.blocks.length > 0) return notReady(error.blocks);
  return failureMessage(error);
}
function notReady(blocks) {
  return [
    "The request did not go to R, since a block that it reads is not ready:",
    ...blocks.map(({ block, status }) => {
      const why = [status.reason, ...status.conditions.filter((c) => c.severity === "error").map((c) => c.message)];
      const said = why.filter((text3) => text3 !== null && text3 !== "");
      return `- Block "${block}" reads ${status.status}${said.length > 0 ? `: ${said.join(" ")}` : "."}`;
    })
  ].join("\n");
}
function noBlock(id) {
  return `The board holds no block "${id}". Call list_blocks for the blocks that it holds.`;
}
function noBlocks(ids) {
  if (ids.length === 1) return noBlock(ids[0] ?? "");
  return `The board holds no blocks ${ids.map((id) => `"${id}"`).join(", ")}. Call list_blocks for the blocks that it holds.`;
}
function noStack(id) {
  return `The board holds no stack "${id}". Call list_stacks for the stacks that it holds.`;
}
function noBlockType(id) {
  return `The app offers no block class "${id}". Call list_block_types for those that it offers.`;
}
function noCommand(id) {
  return `The app registers no command "${id}" that you may run. Call list_commands for those that it registers.`;
}
function noPlugin(id) {
  return `The app runs no plugin "${id}" that you may read. Call list_plugins for those that it runs.`;
}
function noSkill(name) {
  return `No skill named "${name}" is available here. The Skills section of the system prompt lists the skills that name no class, and describe_block_type, describe_block and get_plugin_state list those that name one.`;
}

// srcts/tools/review.ts
import { context as context3 } from "@opentelemetry/api";

// srcts/tools/conditions.ts
async function toolRequest(core, name, args, opts = {}) {
  try {
    return await sendRequest(core, name, args, opts);
  } catch (error) {
    if (!isRequestError(error) || !error.conditions.some(isWarningOrMessage)) throw error;
    throw new Error(await withConditions(core, failureMessage(error), error.conditions), { cause: error });
  }
}
async function withConditions(core, text3, conditions) {
  const lines = conditions.filter(isWarningOrMessage).map(({ severity, message: message2 }) => `${severity === "warning" ? "Warning" : "Message"}: ${message2}`);
  if (lines.length === 0) return text3;
  const listed2 = cutText(lines.join("\n"), await readToolCap(core, "assistant_eval_max_chars"));
  return text3 === "" ? listed2 : `${text3}

${listed2}`;
}
function isWarningOrMessage(condition) {
  return condition.severity !== "error";
}

// srcts/tools/statuses.ts
var NOTES = {
  unevaluated: "The block has not been evaluated yet, so it holds no result, conditions or summary. Core evaluates only what something needs, such as the blocks on screen. The tools get_block_result and inspect_results have the blocks that they read evaluated first.",
  stale: "Something that the block depends on has changed after its last evaluation, so its result, conditions and summary are out of date. Core evaluates only what something needs, such as the blocks on screen. The tools get_block_result and inspect_results have the blocks that they read evaluated first."
};
function statusNote(status) {
  return status === void 0 ? void 0 : NOTES[status.status];
}
function conditionList(conditions) {
  return conditions.map(({ severity, phase, message: message2 }) => ({ severity, ...phase === void 0 ? {} : { phase }, message: message2 }));
}
function conditionsBySeverity(conditions) {
  const grouped = {};
  for (const severity of ["error", "warning", "message"]) {
    const of = conditions.filter((condition) => condition.severity === severity);
    if (of.length > 0) grouped[severity] = of.map(({ phase, message: message2 }) => ({ ...phase === void 0 ? {} : { phase }, message: message2 }));
  }
  return grouped;
}

// srcts/tools/tool.ts
function tool(definition) {
  return {
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters,
    executionMode: definition.executionMode ?? "parallel",
    async execute(args, signal) {
      try {
        const result = await definition.run(args, signal);
        return typeof result === "string" ? { text: result, isError: false, images: [] } : result;
      } catch (error) {
        if (signal.aborted) throw signal.reason;
        return { text: failureText(error), isError: true, images: [] };
      }
    }
  };
}
function json(value) {
  return JSON.stringify(value);
}

// srcts/tools/review.ts
var STATE_HINT = "call get_block_state for the full argument values";
var UNVERIFIED = "You changed this block and it produced no result to check, so what you built here is UNVERIFIED. Do not report it as done: say what is unverified, or get the block into a state where it evaluates.";
var REMOVED = "The block left the board while the tool waited for its review.";
async function reviewCaps(core) {
  const [blocks, value, state] = await Promise.all([
    readToolCap(core, "assistant_review_max_blocks"),
    readToolCap(core, "assistant_state_value_max_chars"),
    readToolCap(core, "assistant_summary_max_chars")
  ]);
  return { blocks, value, state };
}
function conditionsNow(core) {
  return new Map(
    Object.keys(core.store.board().blocks).map((id) => [id, new Set((core.scheduler.status(id)?.conditions ?? []).map(conditionKey))])
  );
}
function stepResult(heard, head) {
  return withChanges(head, addedAndRemoved(heard));
}
function withChanges(head, { added, removed }) {
  return {
    ...head,
    ...Object.keys(added).length === 0 ? {} : { added },
    ...Object.keys(removed).length === 0 ? {} : { removed }
  };
}
async function reviewed(core, step, signals, active) {
  const changes = addedAndRemoved(step.heard);
  const result = withChanges(step.head, changes);
  const notes = [...step.notes ?? []];
  const done = () => notes.length === 0 ? result : { ...result, notes };
  const groups = reviewGroups(core.store.board(), changedBlocks(step.heard));
  const all = [...groups.changed, ...groups.feeding, ...groups.downstream];
  if (all.length === 0) return done();
  const picked = all.slice(0, step.caps.blocks);
  const described = await describeResults(core, all, picked, signals, active, step.what);
  if (described.closed) {
    notes.push(closed(step.what));
    return done();
  }
  if (described.note !== void 0) notes.push(described.note);
  const raised = await withConditions(core, "", described.conditions);
  if (raised !== "") notes.push(`R raised these as it described the results:
${raised}`);
  const changed = new Set(groups.changed);
  const fresh = new Set(changes.added.blocks ?? []);
  result.blocks = Object.fromEntries(
    picked.map((id) => [
      id,
      blockEntry(core, id, {
        before: step.before,
        text: own(described.texts, id),
        summary: described.summaries,
        added: fresh.has(id),
        changed: changed.has(id),
        caps: step.caps
      })
    ])
  );
  if (picked.length < all.length) {
    notes.push(
      `The review shows ${String(picked.length)} of the ${String(all.length)} blocks that ${step.what} changed, that feed them or that are downstream of them. Call get_block_result or inspect_results for the rest.`
    );
  }
  return done();
}
function reviewGroups(board, changed) {
  const order = Object.keys(board.blocks);
  const links = Object.values(board.links);
  const changing = new Set(changed.filter((id) => Object.hasOwn(board.blocks, id)));
  const feeding = new Set(links.filter(({ from, to }) => changing.has(to) && !changing.has(from)).map(({ from }) => from));
  const downstream = /* @__PURE__ */ new Set();
  const queue = [...changing];
  for (let id = queue.pop(); id !== void 0; id = queue.pop()) {
    for (const { from, to } of links) {
      if (from !== id || changing.has(to) || downstream.has(to)) continue;
      downstream.add(to);
      queue.push(to);
    }
  }
  const inOrder = (ids, except = /* @__PURE__ */ new Set()) => order.filter((id) => ids.has(id) && !except.has(id));
  return { changed: inOrder(changing), feeding: inOrder(feeding), downstream: inOrder(downstream, feeding) };
}
async function describeResults(core, all, picked, signals, active, what) {
  for (let attempt = 1; ; attempt++) {
    let statuses;
    try {
      statuses = await core.scheduler.evaluate(all, void 0, { signal: signals.turn });
    } catch (error) {
      return halted(core, error, signals, all, { what, waited: "the evaluation of the blocks" });
    }
    const ready = picked.filter((id) => own(statuses, id)?.status === "ready");
    try {
      return { ...await requested(core, ready, signals.turn, active), summaries: false };
    } catch (error) {
      if (isSessionEnded(error) && attempt === 1) continue;
      return halted(core, error, signals, all, { what, waited: "the request that has R describe the results" });
    }
  }
}
function halted(core, error, signals, all, { what, waited }) {
  if (signals.board.aborted) return { texts: {}, conditions: [], summaries: false, closed: true };
  if (signals.turn.aborted) {
    return {
      texts: {},
      conditions: [],
      summaries: true,
      note: `The user stopped the turn while the tool waited for its review, after ${what} applied. So the review gives each block's status as it was then, with no description of its result.`
    };
  }
  if (all.every((id) => core.scheduler.status(id) === void 0)) return { texts: {}, conditions: [], summaries: false };
  const why = isSessionEnded(error) ? "R's session ended twice before R answered." : failureMessage(error);
  return {
    texts: {},
    conditions: [],
    summaries: true,
    note: `The review could not finish ${waited}. ${/[.!?]$/.test(why) ? why : `${why}.`} So it gives each block's status as it is now, and the one-line summary of each ready block's result in place of a description. Call get_block_result for a block's result.`
  };
}
async function requested(core, reads, signal, active) {
  if (reads.length === 0) return { texts: {}, conditions: [] };
  try {
    return await sent(core, reads, signal, active);
  } catch (error) {
    if (signal.aborted || isSessionEnded(error)) throw error;
    const named = new Set(isRequestError(error) ? error.blocks.map(({ block }) => block) : []);
    const rest = reads.filter((id) => !named.has(id) && core.scheduler.status(id) !== void 0);
    return rest.length === 0 ? { texts: {}, conditions: [] } : await sent(core, rest, signal, active);
  }
}
async function sent(core, reads, signal, active) {
  const { answer, conditions } = await context3.with(
    active,
    () => toolRequest(core, "describe_result", {}, { reads: [...reads], signal })
  );
  const described = answeredObject(answer, "describe_result");
  const texts = Object.fromEntries(
    reads.flatMap((id) => {
      const text3 = own(described, id);
      return text3 === void 0 ? [] : [[id, answeredText(text3, "describe_result")]];
    })
  );
  return { texts, conditions };
}
function blockEntry(core, id, options) {
  const status = core.scheduler.status(id);
  const block = own(core.store.board().blocks, id);
  if (status === void 0 || block === void 0) return { removed: REMOVED };
  const kind = status.status;
  const seen = options.before.get(id);
  const conditions = status.conditions.filter(
    (condition) => kind === "failed" && condition.severity === "error" || seen?.has(conditionKey(condition)) !== true
  );
  return {
    status: kind,
    ...(kind === "invalid" || kind === "waiting") && status.reason !== null ? { reason: status.reason } : {},
    conditions: conditionList(conditions),
    ...options.text === void 0 ? {} : { result: options.text },
    ...options.text === void 0 && options.summary && kind === "ready" && status.summary !== null ? { summary: status.summary } : {},
    ...options.added ? { state: addedState(block.state, options.caps) } : {},
    ...options.changed && kind !== "ready" && kind !== "failed" ? { unverified: UNVERIFIED } : {}
  };
}
function addedState(state, caps) {
  const shown3 = leaveOutLong(state, caps.value, STATE_HINT);
  const text3 = json(shown3);
  return Array.from(text3).length > caps.state ? cutText(text3, caps.state, STATE_HINT) : shown3;
}
function conditionKey({ severity, phase, message: message2 }) {
  return JSON.stringify([severity, phase ?? null, message2]);
}
function closed(what) {
  return `Another board opened while the tool waited, so ${what} applied to a board that is no longer open.`;
}

// srcts/tools/edit.ts
var OWN = new Set(assistantCommands.map((command2) => command2.id));
var SET_PLUGIN_STATE = "blockr.core-set_plugin_state";
var OWN_STATE2 = `Only the assistant's chat and loop change the assistant's conversations, so an edit sets no state of the plugin "${ASSISTANT}".`;
var HINT = "Check that each block, link, stack and plugin that the args name is on the board, and each board option is defined, with list_blocks, list_links, list_stacks, list_plugins or list_board_options, and that a block that a new link goes to has a free data input, with describe_block.";
var LOCKED_HINT = "The board is locked, which may be why: on a locked board, blockr.core-set_plugin_state fails its preflight, and a plugin's own commands fail theirs for what the plugin locks.";
var STOPPED_PREPARING = "The user stopped the turn while a command of the list prepared. The commands applied all the same, but the tool reviewed nothing, so do not run them again.";
var NOTHING_TO_UNDO = "The assistant has no edit left to take back, so the tool changed nothing. Tell the user that there is nothing to undo.";
var UNDID_NOTHING = "The undo changed nothing, since what the edit changed is no longer on the board.";
var CHANGED_NOTHING = "The commands changed nothing on the board, so there is nothing to review. The board may hold what they set already.";
var EDIT_DESCRIPTION = "Change the board by running a list of commands, each by its id with its args, as one step: either every command applies, or none does. Apart from undo_edit, this is the only tool that changes the board. List the commands with list_commands, and read the args that one takes with describe_command. Each command is planned on the board that the commands before it leave, so one edit can add a block, link it and show its panel. Where a command refuses, nothing applies, and the result gives the command's index in the list, counted from 0, its id, why it refused and, where it fails its preflight, what to check. Once the commands apply, the tool evaluates the blocks that the edit added or whose state or links it changed, every block downstream of them and the blocks that feed them, and returns a review of them, the changed blocks first. For each block, the review gives its status, why it is `invalid` or `waiting` where it is, the conditions that appeared since the edit began, what blockr writes about its result, and, for a block that the edit added, its state. A changed block that produced no result is marked as unverified: do not report it as done. The review names the blocks, links and stacks that the edit added or removed, and says in its notes how many blocks it left out. Its `undo_step` says whether undo_edit can take the edit back: an edit that only changes what the user looks at, such as the active view, or that only sets board options, takes no undo step.";
var UNDO_DESCRIPTION = "Take back the assistant's last edit that took an undo step, when the user asks for that. The undo is a new edit on the board as it is now, so it keeps what the user changed after the edit, but sets back what both the user and the edit changed to its value before the edit. That edit may come from another of the assistant's conversations. The tool returns a review of what the undo changed, as edit does. Where the assistant has no edit left to take back, it changes nothing and says so.";
function editTools(core, board) {
  return [
    tool({
      name: "edit",
      description: EDIT_DESCRIPTION,
      parameters: object(
        {
          commands: {
            type: "array",
            minItems: 1,
            items: object(
              {
                command: { type: "string", description: "The command's id, as list_commands gives it." },
                args: {
                  type: "object",
                  description: "The command's args, which the JSON Schema that describe_command gives types. Leave it out for a command that takes none."
                }
              },
              ["command"]
            ),
            description: "The commands to run, in order, as one step."
          }
        },
        ["commands"]
      ),
      executionMode: "sequential",
      run: async ({ commands }, signal) => {
        const active = context4.active();
        const caps = await reviewCaps(core);
        const refused2 = refusedAhead(core, commands);
        if (refused2 !== void 0) return refused2;
        signal.throwIfAborted();
        const before = conditionsNow(core);
        const hearing = hear(core);
        let refusal;
        try {
          await context4.with(
            active,
            () => core.commands.run(
              commands.map(({ command: command2, args }) => args === void 0 ? { id: command2 } : { id: command2, args }),
              ORIGIN2
            )
          );
        } catch (error) {
          refusal = { error };
        } finally {
          hearing.stop();
        }
        if (refusal !== void 0) return refusedList(core, commands, refusal.error, signal.aborted);
        const heard = hearing.heard();
        const head = { applied: true, undo_step: tookUndoStep(core, commands, heard) };
        const notes = heard.length === 0 ? [CHANGED_NOTHING] : [];
        if (signal.aborted) return json({ ...stepResult(heard, head), notes: [STOPPED_PREPARING, ...notes] });
        return json(await reviewed(core, { heard, before, head, what: "the commands", notes, caps }, { turn: signal, board }, active));
      }
    }),
    tool({
      name: "undo_edit",
      description: UNDO_DESCRIPTION,
      parameters: object({}, []),
      executionMode: "sequential",
      run: async (_args, signal) => {
        const active = context4.active();
        const caps = await reviewCaps(core);
        signal.throwIfAborted();
        if (!core.store.canUndo(ORIGIN2)) return json({ applied: false, notes: [NOTHING_TO_UNDO] });
        const before = conditionsNow(core);
        const hearing = hear(core);
        try {
          context4.with(active, () => {
            core.store.undo(ORIGIN2);
          });
        } catch (error) {
          return refusedResult({ applied: false, failures: failuresOf(error) });
        } finally {
          hearing.stop();
        }
        const heard = hearing.heard();
        const notes = heard.length === 0 ? [UNDID_NOTHING] : [];
        return json(await reviewed(core, { heard, before, head: { applied: true }, what: "the undo", notes, caps }, { turn: signal, board }, active));
      }
    })
  ];
}
function refusedAhead(core, commands) {
  const registered = core.commands.registered();
  for (const [index, { command: command2, args }] of commands.entries()) {
    const failure = command2 === SET_PLUGIN_STATE && args?.plugin === ASSISTANT ? OWN_STATE2 : OWN.has(command2) || own(registered, command2) === void 0 ? noCommand(command2) : void 0;
    if (failure !== void 0) return refusedResult({ applied: false, index, command: command2, failures: [failure] });
  }
  return void 0;
}
function refusedList(core, commands, error, stopped) {
  const notes = stopped ? { notes: ["The user stopped the turn while the commands ran."] } : {};
  if (!isCommandError(error) || error.index === void 0) {
    return refusedResult({ applied: false, failures: failuresOf(error), ...notes });
  }
  const hint = error.preflight === false ? { hint: core.lock.board ? `${HINT} ${LOCKED_HINT}` : HINT } : {};
  return refusedResult({
    applied: false,
    index: error.index,
    command: commands[error.index]?.command ?? null,
    failures: [...error.failures],
    ...hint,
    ...notes
  });
}
function refusedResult(value) {
  return { text: json(value), isError: true, images: [] };
}
function tookUndoStep(core, commands, heard) {
  const registered = core.commands.registered();
  return commands.some(({ command: command2 }) => own(registered, command2)?.undo !== false) && !setsOnlyOptions(heard);
}
function failuresOf(error) {
  if (error instanceof Error && (error.name === "CommandError" || error.name === "StoreError")) {
    const { failures } = error;
    if (Array.isArray(failures) && failures.every((failure) => typeof failure === "string")) return [...failures];
  }
  return [failureMessage(error)];
}
function isCommandError(error) {
  return error instanceof Error && error.name === "CommandError" && Array.isArray(error.failures);
}

// srcts/tools/board.ts
function boardTools({ core }) {
  return [
    tool({
      name: "list_links",
      description: "List every link between blocks, each with its id, the block that it comes from, the block that it goes to, and the data input of that block that it feeds.",
      parameters: object({}, []),
      run: () => Promise.resolve(json(Object.entries(core.store.board().links).map(([id, { from, to, input }]) => ({ id, from, to, input }))))
    }),
    tool({
      name: "list_stacks",
      description: "List every stack on the board, each with its id, its name and the ids of its blocks. Call describe_stack for one stack's color and its blocks with their names and statuses.",
      parameters: object({}, []),
      run: () => Promise.resolve(
        json(Object.entries(core.store.board().stacks).map(([id, { name, blocks }]) => ({ id, name, blocks: [...blocks] })))
      )
    }),
    tool({
      name: "describe_stack",
      description: "Describe one stack on the board: its name, its color, and its blocks, each with its id, its name and its status.",
      parameters: object({ id: { type: "string", description: "The stack's id, as list_stacks gives it." } }, ["id"]),
      run: async ({ id }) => {
        if (own(core.store.board().stacks, id) === void 0) throw new Error(noStack(id));
        const max = await readToolCap(core, "assistant_summary_max_chars");
        const board = core.store.board();
        const stack = own(board.stacks, id);
        if (stack === void 0) throw new Error(noStack(id));
        const described = {
          id,
          name: stack.name,
          color: stack.color,
          blocks: stack.blocks.map((block) => ({
            id: block,
            name: own(board.blocks, block)?.name ?? null,
            status: core.scheduler.status(block)?.status ?? null
          }))
        };
        return cutText(json(described), max, "call list_stacks for every block of the stack");
      }
    })
  ];
}

// srcts/tools/block-types.ts
function blockTypeTools(context6) {
  const { core } = context6;
  return [
    tool({
      name: "list_block_types",
      description: `List every block class that the app offers, the types that a block can have, each with its registry id, its name, its category, its data inputs and its description. Call describe_block_type for one class's guidance, arguments and the JSON Schema of its state before you add a block of it. The inputs are the names that a link into such a block takes as its input: a class with none takes no link, and one whose inputs are ["..."] takes any number of links.`,
      parameters: object({}, []),
      run: async () => {
        const max = await readToolCap(core, "assistant_description_max_chars");
        return json(
          Object.values(core.blockRegistry()).map((entry) => ({
            id: entry.id,
            name: entry.name,
            category: entry.category,
            inputs: [...entry.inputs],
            description: cutText(entry.description, max, "call describe_block_type for the full description")
          }))
        );
      }
    }),
    tool({
      name: "describe_block_type",
      description: "Describe one block class in full: its name, its category, its description and guidance, its data inputs, each argument of a block's state with its description, an example and its type, the JSON Schema that a block's state has to fit, and the skills of this deployment that name the class. A skill named here is more specific than the guidance and wins where the two differ; load one with read_skill.",
      parameters: object({ id: { type: "string", description: "The registry id of the block class, as list_block_types gives it." } }, ["id"]),
      run: async ({ id }) => {
        if (own(core.blockRegistry(), id) === void 0) throw new Error(noBlockType(id));
        const skills = await skillsNaming(context6, "blocks", id);
        const entry = own(core.blockRegistry(), id);
        if (entry === void 0) throw new Error(noBlockType(id));
        const described = {
          id,
          name: entry.name,
          category: entry.category,
          description: entry.description,
          ...entry.guidance === void 0 ? {} : { guidance: entry.guidance },
          inputs: [...entry.inputs],
          arguments: Object.fromEntries(
            Object.entries(entry.arguments).map(([arg, spec]) => [
              arg,
              {
                ...spec.description === void 0 ? {} : { description: spec.description },
                ...spec.example === void 0 ? {} : { example: spec.example },
                ...spec.type === void 0 ? {} : { type: spec.type }
              }
            ])
          ),
          schema: entry.schema,
          ...skills.length === 0 ? {} : { skills }
        };
        return json(described);
      }
    })
  ];
}

// srcts/tools/blocks.ts
var STATE_HINT2 = "call get_block_state for the full argument values";
var ID = { type: "string", description: "The block's id, as list_blocks gives it." };
function blockTools(context6) {
  const { core } = context6;
  const found = (id) => {
    const block = own(core.store.board().blocks, id);
    if (block === void 0) throw new Error(noBlock(id));
    return block;
  };
  return [
    tool({
      name: "list_blocks",
      description: "List every block on the board, each with its id, its name, the registry id of its block class and its status. A `ready` block holds a current result. An `unevaluated` block has not been evaluated yet. A `stale` block holds a result that is out of date, since something that it depends on has changed after its last evaluation. Core evaluates only what something needs, such as the blocks on screen, so a block off screen may stay `unevaluated` or `stale`, which is no failure. The tools get_block_result and inspect_results have the blocks that they read evaluated first. A `waiting`, `invalid` or `failed` block could not produce a result, and describe_block says why.",
      parameters: object({}, []),
      run: () => {
        const { blocks } = core.store.board();
        return Promise.resolve(
          json(
            Object.entries(blocks).map(([id, block]) => ({
              id,
              name: block.name,
              registry_id: block.registry_id,
              status: core.scheduler.status(id)?.status ?? null
            }))
          )
        );
      }
    }),
    tool({
      name: "describe_block",
      description: "Describe one block on the board: its name, the registry id of its block class, its status, why it is `invalid` or `waiting` where it is, the one-line summary of its result, its conditions, the skills of this deployment that name its class, its data inputs, the links into them, and its state. The state is a summary: a value too long to show is left out and marked, so read the block's state with get_block_state before you change a value that you have not seen whole. A skill named here is more specific than the class's guidance and wins where the two differ; load one with read_skill. The tool evaluates nothing. For a `stale` or `unevaluated` block, a note says what that means.",
      parameters: object({ id: ID }, ["id"]),
      run: async ({ id }) => {
        const [skills, valueMax, summaryMax] = await Promise.all([
          skillsNaming(context6, "blocks", found(id).registry_id),
          readToolCap(core, "assistant_state_value_max_chars"),
          readToolCap(core, "assistant_summary_max_chars")
        ]);
        const board = core.store.board();
        const block = found(id);
        const status = core.scheduler.status(id);
        const reason = status?.reason ?? null;
        const summary2 = status?.summary ?? null;
        const note2 = statusNote(status);
        const described = {
          id,
          name: block.name,
          registry_id: block.registry_id,
          status: status?.status ?? null,
          ...reason === null ? {} : { reason },
          ...note2 === void 0 ? {} : { note: note2 },
          ...summary2 === null ? {} : { summary: summary2 },
          conditions: conditionList(status?.conditions ?? []),
          ...skills.length === 0 ? {} : { skills },
          inputs: [...own(core.blockRegistry(), block.registry_id)?.inputs ?? []],
          links: Object.entries(board.links).filter(([, link]) => link.to === id).map(([link, { from, input }]) => ({ id: link, from, input })),
          state: leaveOutLong(block.state, valueMax, STATE_HINT2)
        };
        return cutText(json(described), summaryMax, STATE_HINT2);
      }
    }),
    tool({
      name: "get_block_state",
      description: "Give one block's state in full: the value of each of its arguments, as the board holds it, where describe_block shows a summary that leaves out long values. Read the state here before you change a value that you have not seen whole, since an edit sets each value that it changes as a whole. Configuration only: get_block_result and inspect_results read a block's result.",
      parameters: object({ id: ID }, ["id"]),
      run: async ({ id }) => {
        found(id);
        const max = await readToolCap(core, "assistant_state_max_chars");
        return json({ id, state: bounded(found(id).state, max) });
      }
    }),
    tool({
      name: "get_block_conditions",
      description: "Give the conditions of one block's latest evaluation, the errors, warnings and messages that it raised, by severity, each with the phase that raised it. A block that failed holds no result, so its error shows here. The tool evaluates nothing. An `unevaluated` block has raised nothing yet, and the conditions of a `stale` block come from an evaluation before its latest change, so for either an empty list means unknown rather than healthy.",
      parameters: object({ id: ID }, ["id"]),
      run: ({ id }) => {
        found(id);
        const status = core.scheduler.status(id);
        const note2 = statusNote(status);
        const given2 = {
          id,
          status: status?.status ?? null,
          ...note2 === void 0 ? {} : { note: note2 },
          conditions: conditionsBySeverity(status?.conditions ?? [])
        };
        return Promise.resolve(json(given2));
      }
    })
  ];
}

// srcts/tools/commands.ts
var OWN2 = new Set(assistantCommands.map((command2) => command2.id));
function commandTools({ core }) {
  const offered = () => Object.values(core.commands.registered()).filter((command2) => !OWN2.has(command2.id));
  return [
    tool({
      name: "list_commands",
      description: "List every command that the app registers, through which the board and its plugins change, each with its id and its description, which says what the command does and when to use it. Call describe_command for one command's full description and the JSON Schema of its args.",
      parameters: object({}, []),
      run: async () => {
        const max = await readToolCap(core, "assistant_description_max_chars");
        return json(
          offered().map((command2) => ({
            id: command2.id,
            description: cutText(command2.description ?? command2.label, max, "call describe_command for the full description")
          }))
        );
      }
    }),
    tool({
      name: "describe_command",
      description: "Describe one command in full: its label, its description, the JSON Schema of its args, with a description of each arg, and `undo`, which is false where the command takes no undo step.",
      parameters: object({ id: { type: "string", description: "The command's id, as list_commands gives it." } }, ["id"]),
      run: ({ id }) => {
        const command2 = OWN2.has(id) ? void 0 : own(core.commands.registered(), id);
        if (command2 === void 0) throw new Error(noCommand(id));
        return Promise.resolve(
          json({
            id,
            label: command2.label,
            ...command2.description === void 0 ? {} : { description: command2.description },
            args: command2.args ?? null,
            undo: command2.undo !== false
          })
        );
      }
    })
  ];
}

// srcts/tools/options.ts
function optionTools({ core }) {
  return [
    tool({
      name: "list_board_options",
      description: "List every board option that the app's packages define, such as the rows that a table shows, each with its id, its label, its category and the JSON Schema of its value, and the value that the board holds, where it holds one. The board holds the value of each board option that something on the page uses, its default where nobody set one, and blockr.core-set_option sets any board option, on a locked board too.",
      parameters: object({}, []),
      run: () => Promise.resolve(
        json(
          Object.values(core.options.registered()).map((option) => {
            const value = core.options.value(option.id);
            const listed2 = {
              id: option.id,
              label: option.label,
              category: option.category,
              schema: option.schema,
              ...value === void 0 ? {} : { value }
            };
            return listed2;
          })
        )
      )
    })
  ];
}

// srcts/tools/plugins.ts
function pluginTools(context6) {
  const { core } = context6;
  const named = (id) => {
    const plugin = id === ASSISTANT ? void 0 : own(core.plugins.appPlugins(), id);
    if (plugin === void 0) throw new Error(noPlugin(id));
    return plugin.name;
  };
  const schema = (id) => core.plugins.pluginClass(id).state?.schema ?? null;
  return [
    tool({
      name: "list_plugins",
      description: "List the app's plugins, which show or change the board as a whole, such as the dock, each with the id of its class, its name and the description of its state. Call get_plugin_state for one plugin's state.",
      parameters: object({}, []),
      run: async () => {
        const max = await readToolCap(core, "assistant_description_max_chars");
        return json(
          Object.entries(core.plugins.appPlugins()).filter(([id]) => id !== ASSISTANT).map(([id, { name }]) => {
            const described = core.plugins.pluginClass(id).state?.schema.description;
            return {
              id,
              name,
              ...typeof described === "string" ? { description: cutText(described, max, "call get_plugin_state for the full description") } : {}
            };
          })
        );
      }
    }),
    tool({
      name: "get_plugin_state",
      description: "Give one plugin's state, with the JSON Schema that describes it, whose descriptions say what each part means, and the skills of this deployment that name the plugin's class. The plugin's own commands change its state, and so does blockr.core-set_plugin_state, by that schema. A skill named here says how this deployment uses the plugin; load one with read_skill.",
      parameters: object({ id: { type: "string", description: "The id of the plugin's class, as list_plugins gives it." } }, ["id"]),
      run: async ({ id }) => {
        named(id);
        const [skills, max] = await Promise.all([skillsNaming(context6, "plugins", id), readToolCap(core, "assistant_state_max_chars")]);
        const name = named(id);
        const described = {
          id,
          name,
          state: bounded(own(core.store.board().plugins, id) ?? null, max),
          schema: schema(id),
          ...skills.length === 0 ? {} : { skills }
        };
        return json(described);
      }
    })
  ];
}

// srcts/tools/read-skill.ts
import { context as context5 } from "@opentelemetry/api";
function skillTools({ core, skills }) {
  return [
    tool({
      name: "read_skill",
      description: "Load a skill: guidance that this app's packages or its deployment wrote for one topic, kept out of the system prompt until you ask for it. The tool gives the skill's instructions as markdown; follow them for the task that they cover. Pass `file` to read a file that the skill bundles beside its instructions, which the instructions name where the skill has any. A skill is instruction text, not extra capability: it cannot widen what your tools do, and the system prompt wins where the two disagree.",
      parameters: object(
        {
          name: {
            type: "string",
            description: "The skill's name, as the Skills section of the system prompt lists it, or as describe_block_type, describe_block or get_plugin_state give it."
          },
          file: {
            type: "string",
            description: "Optional: a file that the skill bundles, by its path in the skill's directory, to read in place of its instructions."
          }
        },
        ["name"]
      ),
      run: async ({ name, file }, signal) => {
        const active = context5.active();
        const skill = (await skills.list()).find((listed2) => listed2.name === name);
        if (skill?.modelInvocable !== true) throw new Error(noSkill(name));
        const given2 = { name, packages: appPackages(core), ...file === void 0 ? {} : { path: file } };
        const { answer, conditions } = await context5.with(active, () => toolRequest(core, "read_skill", given2, { signal }));
        return withConditions(core, answeredText(answer, "read_skill"), conditions);
      }
    })
  ];
}

// srcts/tools/results.ts
var LOCKED = "The board is locked, so the assistant runs no R code of its own.";
function resultTools({ core }) {
  return [
    tool({
      name: "get_block_result",
      description: "Give what blockr writes about one block's result for you, such as a data frame's columns and rows, or a short description of another kind of result. Core evaluates the block first, wherever it is. Where the block or one upstream of it fails, the tool gives its status and why. Use inspect_results for what this does not give.",
      parameters: object({ id: { type: "string", description: "The block's id, as list_blocks gives it." } }, ["id"]),
      run: async ({ id }, signal) => {
        if (own(core.store.board().blocks, id) === void 0) throw new Error(noBlock(id));
        const { answer, conditions } = await toolRequest(core, "describe_result", {}, { reads: [id], signal });
        const described = answeredObject(answer, "describe_result");
        return withConditions(core, answeredText(own(described, id) ?? null, "describe_result"), conditions);
      }
    }),
    tool({
      name: "inspect_results",
      description: "Evaluate R code on the results of the blocks that you name in `blocks`, each bound by its block id, so that `utils::head(data)` reads the result of the block `data`. Core evaluates those blocks first. The tool gives what the code prints, and the value of the last expression where it is visible, as R's console prints it, so an assignment or an `invisible()` result prints nothing. The output is cut at a budget of characters, so print only what you need. A data frame prints every row and column, so check its size and columns with `dim()` and `names()` first, then print the rows and columns that you need. A tibble prints only its first rows, rounds numbers and may shorten text, so read exact values from a column itself, as `x$col`. Only base R is attached, so call each function of another package with its namespace, as `graphics::hist()`, `stats::median()` or `ggplot2::ggplot()`. The code runs with a graphics device open, and up to four of the plots that it draws come back as images beside the text. The result of a block that draws a plot, a `captured_plot` or a ggplot, draws again when it is printed, so the code `chart` draws the result of the block `chart`. Use this for what no other tool gives, such as unique values, group counts, filters and joins across blocks, and what you need to see drawn. It changes nothing on the board, and on a locked board it runs no code.",
      parameters: object(
        {
          code: {
            type: "string",
            description: "The R code to evaluate. It may hold several expressions, and the value of the last is printed where it is visible."
          },
          blocks: {
            type: "array",
            items: { type: "string" },
            description: "The ids of the blocks whose results the code reads, each bound by its id. Give an empty array for code that reads none."
          },
          width: {
            type: "integer",
            description: "The width in pixels of the device that the code draws on, which sizes plots and leaves printed text alone. Optional: 768 by default, within 200 to 2000, unless the deployment sets others. Raise it for a dense plot that you need to read values off, and lower it where the shape is all you need."
          },
          height: {
            type: "integer",
            description: "The height in pixels of the device that the code draws on, which sizes plots and leaves printed text alone. Optional: 768 by default, within 200 to 2000, unless the deployment sets others."
          }
        },
        ["code", "blocks"]
      ),
      run: async ({ code, blocks, width, height }, signal) => {
        if (core.lock.board) throw new Error(LOCKED);
        const board = core.store.board();
        const absent = blocks.filter((block) => own(board.blocks, block) === void 0);
        if (absent.length > 0) throw new Error(noBlocks(absent));
        const given2 = { code, ...width === void 0 ? {} : { width }, ...height === void 0 ? {} : { height } };
        const { answer, conditions } = await toolRequest(core, "inspect_results", given2, { reads: [...blocks], signal });
        const inspection = answeredObject(answer, "inspect_results");
        return {
          text: await withConditions(core, answeredText(inspection.output ?? null, "inspect_results"), conditions),
          isError: false,
          images: answeredTexts(inspection.plots, "inspect_results").map((data) => ({ data, mimeType: "image/png" }))
        };
      }
    })
  ];
}

// srcts/tools/read-tools.ts
function readTools(core, skills) {
  const context6 = { core, skills };
  return [
    ...blockTools(context6),
    ...boardTools(context6),
    ...blockTypeTools(context6),
    ...commandTools(context6),
    ...pluginTools(context6),
    ...optionTools(context6),
    ...resultTools(context6),
    ...skillTools(context6)
  ];
}

// srcts/turns/lock.ts
var NAME = `blockr.assistant-turn-${newId()}`;
function pageLocks() {
  return globalThis.navigator?.locks ?? void 0;
}
function holdLock(locks) {
  if (locks === void 0) return Promise.resolve(nothing);
  return new Promise((resolve) => {
    let release = nothing;
    const held = new Promise((done) => {
      release = done;
    });
    locks.request(NAME, () => {
      resolve(release);
      return held;
    }).catch(() => {
      resolve(nothing);
    });
  });
}
function nothing() {
}

// srcts/turns/turns.ts
var STOP = new DOMException("The user stopped the turn.", "AbortError");
var CLOSED = new DOMException("Another board opened, which ended the turn.", "AbortError");
var GONE = new DOMException("The turn's conversation took no more messages.", "AbortError");
var NO_KEY2 = "The assistant has no key for its calls, since the app sets none in the blockr option assistant_api_key.";
var NO_MODEL = "The assistant has no model to talk to, since the app offers none.";
function createTurns(core, signal, options) {
  const { conversations, callFailed } = options;
  const locks = "locks" in options ? options.locks : pageLocks();
  const listeners = /* @__PURE__ */ new Set();
  let running;
  let snapshot;
  const attachmentRefused = heldError(core, signal, "assistant_attachment_refused");
  let refusedIn;
  function closed2() {
    return signal.aborted;
  }
  function stopped(turn) {
    return closed2() || turn.controller.signal.aborted;
  }
  function changed() {
    snapshot = running === void 0 ? void 0 : { conversation: running.conversation, reply: running.reply, results: running.results, stopping: running.stopping };
    for (const listener of listeners) listener();
  }
  function fail(conversation2, why) {
    callFailed.raise(why);
    keep2(conversation2, why);
  }
  function keep2(conversation2, why) {
    const last = conversations.get(conversation2)?.messages.at(-1);
    if (last !== void 0) conversations.keep(conversation2, last.id, { failure: why });
  }
  function refuse(conversation2, files, why) {
    const names = namesOf(files.map((file) => file.name));
    const which = files.length === 1 ? `the file ${names}, so the conversation goes on without it` : `the files ${names}, so the conversation goes on without them`;
    const message2 = `The provider refused ${which}: ${why}`;
    attachmentRefused.raise(message2);
    refusedIn = conversation2;
    keep2(conversation2, message2);
    change(conversation2, files, () => ({ refused: true }));
  }
  function succeeded(conversation2, files) {
    callFailed.withdraw();
    if (refusedIn === conversation2) {
      attachmentRefused.withdraw();
      refusedIn = void 0;
    }
    change(conversation2, files, taken);
  }
  function change(conversation2, files, changing) {
    const byMessage = /* @__PURE__ */ new Map();
    for (const file of files) byMessage.set(file.message, (byMessage.get(file.message) ?? /* @__PURE__ */ new Set()).add(file.index));
    for (const [message2, indices] of byMessage) {
      const held = conversations.kept(conversation2, message2)?.files;
      if (held === void 0) continue;
      const next = held.map((file, index) => indices.has(index) ? changing(file) : file);
      try {
        conversations.keep(conversation2, message2, { files: next });
      } catch {
      }
    }
  }
  function handlers(turn) {
    let writes = true;
    const write = async (change2) => {
      if (!writes || closed2()) return;
      try {
        await change2();
      } catch (error) {
        writes = false;
        turn.controller.abort(GONE);
        core.log("blockr.assistant").warn(`The assistant stopped its turn, since its conversation took no more messages: ${messageOf2(error)}`);
      }
    };
    return {
      streaming(reply) {
        turn.reply = reply;
        changed();
      },
      async called(call) {
        turn.reply = void 0;
        if (call.reply !== void 0) {
          const { message: message2, kept } = call.reply;
          await write(() => conversations.addMessage(turn.conversation, message2, kept));
        }
        const { input, output, total } = call.usage;
        if (input > 0 || output > 0 || total > 0) {
          await write(() => conversations.addUsage(turn.conversation, input, output, total));
        }
        if (call.failure !== void 0) {
          if (writes && !closed2()) {
            if (call.refused && call.files.length > 0) refuse(turn.conversation, call.files, call.failure);
            else fail(turn.conversation, `The assistant's call to the model failed: ${call.failure}`);
          }
        } else if (!turn.controller.signal.aborted) {
          succeeded(turn.conversation, call.files);
        }
        changed();
      },
      returned(id, result) {
        turn.results = { ...turn.results, [id]: result };
        changed();
      },
      async results(message2, kept) {
        await write(() => conversations.addMessage(turn.conversation, message2, kept));
        turn.results = {};
        changed();
      }
    };
  }
  async function runTurn2(turn) {
    if (conversations.get(turn.conversation) === void 0) return;
    let deployment;
    try {
      deployment = await options.deployment;
    } catch (error) {
      if (!closed2()) fail(turn.conversation, `The assistant cannot call a model: ${messageOf2(error)}`);
      return;
    }
    if (deployment.credential.kind === "visitor") {
      fail(turn.conversation, NO_KEY2);
      return;
    }
    const offered = await options.models.offered();
    if (stopped(turn)) return;
    const picked = conversations.get(turn.conversation)?.model ?? null;
    const model2 = picked !== null && offered.models.includes(picked) ? picked : offered.models[0];
    if (model2 === void 0) {
      keep2(turn.conversation, offered.failure ?? NO_MODEL);
      return;
    }
    let loop;
    try {
      loop = await options.load();
    } catch (error) {
      if (!closed2()) fail(turn.conversation, `The assistant could not load the code that runs its turns: ${messageOf2(error)}`);
      return;
    }
    if (stopped(turn)) return;
    const settings = await options.settings.checked((id) => loop.inCatalog(id));
    if (stopped(turn)) return;
    await loop.run({
      connection: connectionOf(deployment),
      model: model2,
      settings: settings.get(model2),
      listed: offered.settings?.get(model2),
      tools: options.tools,
      messages: () => conversations.get(turn.conversation)?.messages ?? [],
      kept: (message2) => conversations.kept(turn.conversation, message2),
      signal: turn.controller.signal,
      on: handlers(turn)
    });
  }
  return {
    async run(conversation2) {
      if (closed2()) throw new Error("The board that the assistant's turns ran on is closed.");
      if (running !== void 0) {
        throw new Error(`A turn of the assistant runs already on the board, in the conversation "${running.conversation}".`);
      }
      const turn = { conversation: conversation2, reply: void 0, results: {}, stopping: false, controller: new AbortController() };
      const close = () => {
        turn.controller.abort(CLOSED);
      };
      signal.addEventListener("abort", close, { once: true });
      running = turn;
      changed();
      const release = await holdLock(locks);
      try {
        await runTurn2(turn);
      } catch (error) {
        if (!closed2()) fail(conversation2, `The assistant's turn failed: ${messageOf2(error)}`);
      } finally {
        release();
        signal.removeEventListener("abort", close);
        running = void 0;
        changed();
      }
    },
    stop() {
      if (running === void 0 || running.controller.signal.aborted) return;
      running.stopping = true;
      running.controller.abort(STOP);
      changed();
    },
    current() {
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}
function connectionOf(deployment) {
  const { credential } = deployment;
  const key = credential.kind === "deployment" ? credential.key : void 0;
  return { baseUrl: deployment.baseUrl, api: deployment.api, apiKey: () => Promise.resolve(key) };
}
function messageOf2(error) {
  return error instanceof Error ? error.message : String(error);
}
function taken(file) {
  return "refused" in file || file.taken === true ? file : { ...file, taken: true };
}

// srcts/assistant/assistant.ts
var opened = /* @__PURE__ */ new WeakMap();
var waiting = /* @__PURE__ */ new WeakMap();
function openAssistant(core, signal, options = {}) {
  const conversations = createConversations(core, signal);
  conversations.opened.catch((error) => {
    core.log("blockr.assistant").error(error instanceof Error ? error : new Error(String(error)));
  });
  const skills = createSkills(core, signal);
  const deployment = options.deployment ?? readDeployment(core);
  deployment.catch(() => void 0);
  const callFailed = heldError(core, signal, "assistant_call_failed");
  const models = createModels(core, signal, { deployment, callFailed, fetch: options.fetch });
  const settings = createModelSettings(core, signal);
  const turns = createTurns(core, signal, {
    conversations,
    tools: [...readTools(core, skills), ...editTools(core, signal)],
    deployment,
    models,
    settings,
    callFailed,
    load: options.load ?? loadLoop,
    ..."locks" in options ? { locks: options.locks } : {}
  });
  const assistant = { conversations, skills, models, turns, signal };
  opened.set(core, assistant);
  const waiters = waiting.get(core);
  waiting.delete(core);
  for (const waiter of waiters ?? []) waiter(assistant);
  signal.addEventListener(
    "abort",
    () => {
      if (opened.get(core) === assistant) opened.delete(core);
    },
    { once: true }
  );
  return assistant;
}
function assistantOf(core) {
  return opened.get(core);
}
function nextAssistant(core) {
  const open2 = opened.get(core);
  if (open2 !== void 0 && !open2.signal.aborted) return Promise.resolve(open2);
  return new Promise((resolve) => {
    const waiters = waiting.get(core) ?? /* @__PURE__ */ new Set();
    waiters.add(resolve);
    waiting.set(core, waiters);
  });
}

// srcts/chat/panel.tsx
import { useEffect as useEffect3, useState as useState3 } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

// srcts/chat/chat.tsx
import { useCallback as useCallback2, useMemo as useMemo2, useState as useState2 } from "react";

// srcts/chat/composer.tsx
import { useLayoutEffect, useRef } from "react";

// srcts/chat/context.ts
import { createContext, useContext } from "react";
var ChatActionsContext = createContext(void 0);
var ChatStateContext = createContext(void 0);
function useChatActions() {
  const actions = useContext(ChatActionsContext);
  if (actions === void 0) throw new Error("The chat's components draw only inside the chat.");
  return actions;
}
function useChat() {
  const state = useContext(ChatStateContext);
  if (state === void 0) throw new Error("The chat's components draw only inside the chat.");
  return state;
}

// srcts/chat/libraries.ts
var loading;
var loaded;
function loadLibraries() {
  loading ??= import("./chat-af068126.js").then(
    (libraries2) => {
      loaded = libraries2;
      return libraries2;
    },
    (error) => {
      loading = void 0;
      throw error;
    }
  );
  return loading;
}
function librariesLoaded() {
  return loaded !== void 0;
}
function libraries() {
  if (loaded === void 0) throw new Error("The chat draws only once its libraries have loaded.");
  return loaded;
}

// srcts/chat/recall.ts
function recall(history, at2, text3, key) {
  const showing = at2 !== void 0 && history[at2] === text3;
  if (!showing && text3 !== "") return void 0;
  if (key === "up") {
    if (history.length === 0) return void 0;
    const next = showing ? Math.max(0, at2 - 1) : history.length - 1;
    return { at: next, text: history[next] ?? "" };
  }
  if (!showing) return void 0;
  if (at2 >= history.length - 1) return { at: void 0, text: "" };
  return { at: at2 + 1, text: history[at2 + 1] ?? "" };
}

// srcts/chat/composer.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var PLACEHOLDER = "Ask about your board";
function Composer() {
  const { ComposerPrimitive, useAui, useAuiState } = libraries();
  const { stop } = useChatActions();
  const { history, running, runsHere, titleOf } = useChat();
  const aui = useAui();
  const text3 = useAuiState(({ composer }) => composer.text);
  const field = useRef(null);
  const recalled = useRef(void 0);
  useLayoutEffect(() => {
    const el = field.current;
    if (el === null) return;
    el.style.height = "auto";
    el.style.height = `${String(el.scrollHeight)}px`;
  }, [text3]);
  const keys2 = (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (event.nativeEvent.isComposing || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return;
    const el = event.currentTarget;
    const key = event.key === "ArrowUp" ? "up" : "down";
    if (el.value !== "" && el.selectionStart !== el.value.length) return;
    const back = recall(history, recalled.current, el.value, key);
    if (back === void 0) return;
    event.preventDefault();
    recalled.current = back.at;
    aui.composer.setText(back.text);
  };
  const waitsFor = running === void 0 || runsHere ? void 0 : titleOf(running.conversation) ?? "another conversation";
  const sendLabel = waitsFor === void 0 ? "Send" : `Sends once the turn in \u201C${waitsFor}\u201D ends`;
  return /* @__PURE__ */ jsxs(ComposerPrimitive.Root, { className: "blockr-assistant-composer", children: [
    waitsFor === void 0 ? null : /* @__PURE__ */ jsxs("p", { className: "blockr-assistant-composer-note", children: [
      "A turn runs in \u201C",
      waitsFor,
      "\u201D."
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "blockr-assistant-field", children: [
      /* @__PURE__ */ jsx(ComposerPrimitive.Input, { asChild: true, placeholder: PLACEHOLDER, "aria-label": "Message", onKeyDown: keys2, submitMode: "enter", children: /* @__PURE__ */ jsx("textarea", { ref: field, rows: 1 }) }),
      runsHere && running !== void 0 ? /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          className: "blockr-assistant-stop",
          "data-stopping": running.stopping ? "" : void 0,
          disabled: running.stopping,
          title: running.stopping ? "Stopping" : "Stop",
          "aria-label": running.stopping ? "Stopping" : "Stop",
          onClick: stop,
          children: /* @__PURE__ */ jsx("svg", { viewBox: "0 0 16 16", "aria-hidden": "true", children: /* @__PURE__ */ jsx("rect", { x: "4", y: "4", width: "8", height: "8", rx: "1.5" }) })
        }
      ) : /* @__PURE__ */ jsx(ComposerPrimitive.Send, { className: "blockr-assistant-send", title: sendLabel, "aria-label": sendLabel, children: /* @__PURE__ */ jsx("svg", { viewBox: "0 0 16 16", "aria-hidden": "true", children: /* @__PURE__ */ jsx("path", { d: "M8 13V3M3.5 7.5 8 3l4.5 4.5" }) }) })
    ] })
  ] });
}

// srcts/chat/hooks.ts
import { useCallback, useSyncExternalStore } from "react";
function useBoard(core) {
  const subscribe = useCallback((changed) => core.store.subscribe(changed), [core]);
  const board = useCallback(() => core.store.board(), [core]);
  return useSyncExternalStore(subscribe, board);
}
function useConversations(conversations) {
  const subscribe = useCallback((changed) => conversations.subscribe(changed), [conversations]);
  const all = useCallback(() => conversations.all(), [conversations]);
  return useSyncExternalStore(subscribe, all);
}
function useRunning(turns) {
  const subscribe = useCallback((changed) => turns.subscribe(changed), [turns]);
  const current = useCallback(() => turns.current(), [turns]);
  return useSyncExternalStore(subscribe, current);
}

// srcts/chat/links.tsx
import { useEffect, useRef as useRef2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var always = false;
function leavesSite(href, page) {
  try {
    const url = new URL(href, page);
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin !== new URL(page).origin;
  } catch {
    return false;
  }
}
function TextLink({ href, title: title2, children }) {
  const { openLink } = useChatActions();
  return /* @__PURE__ */ jsx2(
    "a",
    {
      href,
      title: title2,
      target: "_blank",
      rel: "noopener noreferrer",
      onClick: (event) => {
        if (href === void 0 || always || !leavesSite(href, globalThis.location.href)) return;
        event.preventDefault();
        openLink(href);
      },
      children
    }
  );
}
function LinkDialog({ url, onClose }) {
  const ref = useRef2(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (url !== void 0 && !dialog.open) {
      dialog.showModal();
      dialog.querySelector(".blockr-assistant-dialog-open")?.focus();
    }
    if (url === void 0 && dialog.open) dialog.close();
  }, [url]);
  const open2 = (remember) => {
    if (remember) always = true;
    if (url !== void 0) globalThis.open(url, "_blank", "noopener,noreferrer");
    onClose();
  };
  return /* @__PURE__ */ jsxs2("dialog", { ref, className: "blockr-assistant-dialog", "aria-labelledby": "blockr-assistant-dialog-title", onClose, children: [
    /* @__PURE__ */ jsx2("h2", { id: "blockr-assistant-dialog-title", children: "External Link" }),
    /* @__PURE__ */ jsx2("p", { children: "This link will take you to an external website:" }),
    /* @__PURE__ */ jsx2("p", { className: "blockr-assistant-dialog-url", children: url }),
    /* @__PURE__ */ jsxs2("div", { className: "blockr-assistant-dialog-buttons", children: [
      /* @__PURE__ */ jsx2(
        "button",
        {
          type: "button",
          className: "blockr-assistant-dialog-always",
          onClick: () => {
            open2(true);
          },
          children: "Always open external links"
        }
      ),
      /* @__PURE__ */ jsx2(
        "button",
        {
          type: "button",
          className: "blockr-assistant-dialog-open",
          onClick: () => {
            open2(false);
          },
          children: "Open Link"
        }
      ),
      /* @__PURE__ */ jsx2("button", { type: "button", className: "blockr-assistant-dialog-cancel", onClick: onClose, children: "Cancel" })
    ] })
  ] });
}

// srcts/chat/messages.ts
var FAILURE = "failure";
var ATTACHMENT = "attachment";
var given = /* @__PURE__ */ new WeakMap();
function shownOf(messages, running, kept) {
  const shown3 = [];
  let opener;
  let span = [];
  let failure;
  const end2 = (last) => {
    const results = last ? running?.results : void 0;
    const reply = last && span.at(-1)?.role !== "assistant" ? running?.reply : void 0;
    if (span.length > 0 || failure !== void 0 || results !== void 0 && Object.keys(results).length > 0 || reply !== void 0) {
      shown3.push(turnOf(opener, span, span.map((message2) => kept(message2.id)), failure, results, reply));
    }
    span = [];
    failure = void 0;
  };
  for (const message2 of messages) {
    const held = kept(message2.id);
    if (isNote(message2)) {
      failure = held?.failure ?? failure;
    } else if (message2.role === "user" || message2.role === "summary") {
      end2(false);
      shown3.push(message2);
      opener = message2;
      failure = held?.failure;
    } else {
      span.push(message2);
      failure = held?.failure ?? failure;
    }
  }
  end2(true);
  return shown3;
}
function threadMessageOf(shown3) {
  if ("kind" in shown3) return turnMessage(shown3);
  const createdAt = new Date(shown3.created);
  if (shown3.role === "summary") return { role: "system", id: shown3.id, createdAt, content: [{ type: "text", text: textOf(shown3.parts) }] };
  return { role: "user", id: shown3.id, createdAt, content: userContent2(shown3.parts) };
}
function waitingCalls(messages, running) {
  if (running === void 0) return /* @__PURE__ */ new Set();
  const last = messages.at(-1);
  const calls = [...last?.role === "assistant" ? last.parts : [], ...running.reply?.parts ?? []];
  return new Set(calls.flatMap((part) => part.type === "tool_call" && !Object.hasOwn(running.results, part.id) ? [part.id] : []));
}
function turnOf(opener, messages, kept, failure, results, reply) {
  const anchor = opener ?? messages[0];
  const last = anchor === void 0 ? void 0 : given.get(anchor);
  if (last !== void 0 && same(last.messages, messages) && same(last.kept, kept) && last.failure === failure && last.results === results && last.reply === reply) {
    return last;
  }
  const turn = { kind: "turn", id: `${anchor?.id ?? "start"}-turn`, messages, kept, failure, results, reply };
  if (anchor !== void 0) given.set(anchor, turn);
  return turn;
}
function turnMessage(turn) {
  const results = resultsOf2(turn);
  const content = [];
  for (const [index, message2] of turn.messages.entries()) {
    if (message2.role === "assistant") content.push(...replyContent(turn.kept[index]?.reasoning ?? [], message2.parts, results));
  }
  if (turn.reply !== void 0) content.push(...replyContent(turn.reply.reasoning, turn.reply.parts, results));
  if (turn.failure !== void 0) content.push({ type: `data-${FAILURE}`, data: turn.failure });
  const first = turn.messages[0];
  return { role: "assistant", id: turn.id, ...first === void 0 ? {} : { createdAt: new Date(first.created) }, content };
}
function resultsOf2(turn) {
  const results = /* @__PURE__ */ new Map();
  for (const [index, message2] of turn.messages.entries()) {
    if (message2.role !== "tool") continue;
    const images = turn.kept[index]?.images ?? {};
    for (const part of message2.parts) {
      if (part.type !== "tool_result") continue;
      const kept = Object.hasOwn(images, part.id) ? images[part.id] ?? [] : [];
      results.set(part.id, { result: { text: part.text, images: kept, count: part.images ?? 0 }, error: part.error === true });
    }
  }
  for (const [id, answered] of Object.entries(turn.results ?? {})) {
    if (!results.has(id)) results.set(id, { result: { text: answered.text, images: answered.images, count: answered.images.length }, error: answered.isError });
  }
  return results;
}
function replyContent(reasoning, parts, results) {
  const thought = reasoning.filter((text3) => text3.trim() !== "").map((text3) => ({ type: "reasoning", text: text3 }));
  const said = parts.flatMap((part) => {
    switch (part.type) {
      case "text":
        return part.text === "" ? [] : [{ type: "text", text: part.text }];
      case "tool_call": {
        const answered = results.get(part.id);
        return [
          {
            type: "tool-call",
            toolCallId: part.id,
            toolName: part.tool,
            args: part.args,
            ...answered === void 0 ? {} : { result: answered.result, isError: answered.error }
          }
        ];
      }
      default:
        return [];
    }
  });
  return [...thought, ...said];
}
function userContent2(parts) {
  return parts.flatMap((part) => {
    switch (part.type) {
      case "text":
        return [{ type: "text", text: part.text }];
      case "attachment":
        return [{ type: `data-${ATTACHMENT}`, data: { name: part.name, media_type: part.media_type } }];
      default:
        return [];
    }
  });
}
function textOf(parts) {
  return parts.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n\n");
}
function same(a, b) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

// srcts/chat/open.ts
var KEY = "blockr.assistant-open_conversation";
function storedConversation() {
  try {
    return globalThis.localStorage.getItem(KEY) ?? void 0;
  } catch {
    return void 0;
  }
}
function storeConversation(id) {
  try {
    globalThis.localStorage.setItem(KEY, id);
  } catch {
  }
}

// srcts/chat/send.ts
var NEW_CONVERSATION = "New conversation";
async function sendMessage(assistant, open2, text3, opened2) {
  const { conversations, turns } = assistant;
  let conversation2 = open2;
  if (conversation2 === void 0) {
    conversation2 = newId();
    await conversations.addConversation(conversation2, NEW_CONVERSATION);
    opened2(conversation2);
  }
  await conversations.addMessage(conversation2, { id: newId(), role: "user", parts: [{ type: "text", text: text3 }], created: (/* @__PURE__ */ new Date()).toISOString() });
  void turns.run(conversation2).catch(() => void 0);
}

// srcts/chat/transcript.tsx
import { useMemo } from "react";

// srcts/chat/greeting.ts
var EMPTY = {
  lead: "What do you want to build?",
  note: "I can add blocks from the installed types and wire them together",
  suggestions: ["Load a dataset and show me what is in it", "Build a chart from one of the built-in datasets", "Set up a filtered table I can explore"]
};
var FILLED = {
  lead: "What do you want to see?",
  note: "I can read what these blocks produce, change and rewire them",
  suggestions: ["Summarize what is on this board", "Add a chart of the data on this board", "Check this board for problems"]
};
function greetingOf(board) {
  return Object.keys(board.blocks).length === 0 ? EMPTY : FILLED;
}

// srcts/chat/markdown.tsx
import { useEffect as useEffect2, useState } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var COPIED_MS = 2e3;
var COMPONENTS = {
  a: TextLink,
  table: Table,
  CodeHeader
};
var plugins;
function MarkdownText() {
  const { MarkdownTextPrimitive, remarkGfm } = libraries();
  plugins ??= [remarkGfm];
  return /* @__PURE__ */ jsx3(MarkdownTextPrimitive, { className: "blockr-assistant-markdown", remarkPlugins: plugins, smooth: false, components: COMPONENTS });
}
function Markdown({ text: text3, running = false }) {
  const { TextMessagePartProvider } = libraries();
  return /* @__PURE__ */ jsx3(TextMessagePartProvider, { text: text3, isRunning: running, children: /* @__PURE__ */ jsx3(MarkdownText, {}) });
}
function Table({ children }) {
  return /* @__PURE__ */ jsx3("div", { className: "blockr-assistant-table", children: /* @__PURE__ */ jsx3("table", { children }) });
}
function CodeHeader({ language, code }) {
  const [copied, setCopied] = useState(false);
  useEffect2(() => {
    if (!copied) return;
    const timer = setTimeout(() => {
      setCopied(false);
    }, COPIED_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [copied]);
  return /* @__PURE__ */ jsxs3("div", { className: "blockr-assistant-code-header", children: [
    /* @__PURE__ */ jsx3("span", { children: language ?? "" }),
    /* @__PURE__ */ jsx3(
      "button",
      {
        type: "button",
        className: "blockr-assistant-copy",
        onClick: () => {
          const clipboard = globalThis.navigator?.clipboard;
          void clipboard?.writeText(code).then(
            () => {
              setCopied(true);
            },
            () => void 0
          );
        },
        children: copied ? "Copied" : "Copy"
      }
    )
  ] });
}

// srcts/chat/rows.ts
function segmentsOf(parts) {
  const segments = [];
  let run = [];
  const end2 = () => {
    if (run.length > 0) segments.push({ kind: "tools", rows: rowsOf(run) });
    run = [];
  };
  for (const [index, part] of parts.entries()) {
    if (part.type === "tool-call") {
      run.push(callOf2(part));
      continue;
    }
    if (part.type === "text" || part.type === "reasoning") {
      end2();
      segments.push({ kind: part.type, index });
    } else if (part.type === "data" && part.name === FAILURE && typeof part.data === "string") {
      end2();
      segments.push({ kind: "failure", text: part.data });
    }
  }
  end2();
  return segments;
}
function rowsOf(calls) {
  const rows = /* @__PURE__ */ new Map();
  for (const call of calls) rows.set(call.tool, [...rows.get(call.tool) ?? [], call]);
  return [...rows].map(([tool2, called]) => ({ tool: tool2, calls: called }));
}
function toolTitle(tool2) {
  const words = tool2.replaceAll("_", " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
function callOf2(part) {
  return {
    id: typeof part.toolCallId === "string" ? part.toolCallId : "",
    tool: typeof part.toolName === "string" ? part.toolName : "",
    args: part.args,
    result: isShownResult(part.result) ? part.result : void 0,
    error: part.isError === true
  };
}
function isShownResult(value) {
  if (typeof value !== "object" || value === null) return false;
  const result = value;
  return typeof result.text === "string" && Array.isArray(result.images) && typeof result.count === "number";
}

// srcts/chat/edit.ts
function editView(args, text3, error, registered, board) {
  const commands = listed(args).map((id) => labelOf(id, registered));
  const result = parsed(text3);
  if (result === void 0) return { commands, blocks: [], refused: void 0 };
  if (result.applied === false && error) {
    const command2 = typeof result.command === "string" ? labelOf(result.command, registered) : void 0;
    return { commands, blocks: [], refused: { command: command2, failures: strings(result.failures) } };
  }
  const blocks = Object.entries(object2(result.blocks)).map(([id, entry]) => {
    const status = object2(entry).status;
    const left = typeof status !== "string" || !Object.hasOwn(board.blocks, id);
    return { id, name: nameOf(id, board), status: typeof status === "string" ? status : void 0, removed: left };
  });
  const reviewed2 = new Set(blocks.map((block) => block.id));
  const removed = strings(object2(result.removed).blocks).filter((id) => !reviewed2.has(id)).map((id) => ({ id, name: id, status: void 0, removed: true }));
  return { commands, blocks: [...blocks, ...removed], refused: void 0 };
}
function listed(args) {
  const commands = object2(args).commands;
  if (!Array.isArray(commands)) return [];
  return commands.flatMap((entry) => {
    const id = object2(entry).command;
    return typeof id === "string" ? [id] : [];
  });
}
function labelOf(id, registered) {
  return Object.hasOwn(registered, id) ? registered[id]?.label ?? id : id;
}
function nameOf(id, board) {
  const block = Object.hasOwn(board.blocks, id) ? board.blocks[id] : void 0;
  return block === void 0 || block.name === "" ? id : block.name;
}
function parsed(text3) {
  if (text3 === void 0) return void 0;
  try {
    const value = JSON.parse(text3);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
  } catch {
    return void 0;
  }
}
function object2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}
function strings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

// srcts/chat/status.ts
var LIGHT = {
  "text-muted": "#6b7280",
  "border-warning": "#d97706",
  "border-danger": "#dc2626",
  "border-success": "#16a34a"
};
var DOTS = {
  stale: { filled: true, token: "text-muted", tooltip: "Inputs changed since this block last ran" },
  waiting: { filled: false, token: "border-warning", tooltip: "Waiting for a data input" },
  invalid: { filled: true, token: "border-warning", tooltip: "Set this block's inputs" },
  failed: { filled: true, token: "border-danger", tooltip: "Evaluation failed" },
  ready: { filled: true, token: "border-success", tooltip: "Up to date" },
  unevaluated: { filled: false, token: "text-muted", tooltip: "Not evaluated yet" }
};
function dotOf(status) {
  return Object.hasOwn(DOTS, status) ? DOTS[status] : void 0;
}
function dotColor(status, dot) {
  return `var(--bc-color-status-${status}, ${LIGHT[dot.token]})`;
}

// srcts/chat/tools.tsx
import { Fragment, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var EDITS = /* @__PURE__ */ new Set(["edit", "undo_edit"]);
function ToolRows({ rows }) {
  return /* @__PURE__ */ jsx4("div", { className: "blockr-assistant-tools", children: rows.map((row) => /* @__PURE__ */ jsx4(ToolRow, { row }, row.calls[0]?.id ?? row.tool)) });
}
function ToolRow({ row }) {
  const { waiting: waiting2 } = useChat();
  const states = row.calls.map((call) => stateOf(call, waiting2));
  const state = rowState(states);
  const edits = EDITS.has(row.tool) ? /* @__PURE__ */ jsx4(Edits, { calls: row.calls }) : null;
  return /* @__PURE__ */ jsxs4("details", { className: "blockr-assistant-tool", "data-state": state, children: [
    /* @__PURE__ */ jsxs4("summary", { children: [
      /* @__PURE__ */ jsx4(StateMark, { state }),
      /* @__PURE__ */ jsx4("span", { className: "blockr-assistant-tool-title", children: toolTitle(row.tool) }),
      row.calls.length > 1 ? /* @__PURE__ */ jsx4("span", { className: "blockr-assistant-tool-count", children: row.calls.length }) : null,
      edits
    ] }),
    /* @__PURE__ */ jsx4("div", { className: "blockr-assistant-tool-calls", children: row.calls.map((call, index) => /* @__PURE__ */ jsx4(CallDetails, { call, state: states[index] ?? "done" }, call.id)) })
  ] });
}
function Edits({ calls }) {
  const { core } = useChatActions();
  const board = useBoard(core);
  const views = calls.map((call) => editView(call.args, call.result?.text, call.error, core.commands.registered(), board));
  const commands = views.flatMap((view) => view.commands);
  const blocks = /* @__PURE__ */ new Map();
  for (const view of views) for (const block of view.blocks) blocks.set(block.id, block);
  const refused2 = views.flatMap((view) => view.refused === void 0 ? [] : [view.refused]);
  return /* @__PURE__ */ jsxs4("span", { className: "blockr-assistant-edit", children: [
    commands.length > 0 ? /* @__PURE__ */ jsx4("span", { className: "blockr-assistant-edit-commands", children: commands.join(", ") }) : null,
    blocks.size > 0 ? /* @__PURE__ */ jsx4("span", { className: "blockr-assistant-edit-blocks", children: [...blocks.values()].map((block) => /* @__PURE__ */ jsx4(Block, { block }, block.id)) }) : null,
    refused2.map((refusal, index) => /* @__PURE__ */ jsxs4("span", { className: "blockr-assistant-edit-refused", children: [
      refusal.command === void 0 ? "Refused" : `Refused by ${refusal.command}`,
      refusal.failures.length > 0 ? `: ${refusal.failures.join(" ")}` : ""
    ] }, index))
  ] });
}
function Block({ block }) {
  const dot = block.status === void 0 ? void 0 : dotOf(block.status);
  const style = dot === void 0 || block.status === void 0 ? void 0 : { "--blockr-assistant-dot": dotColor(block.status, dot) };
  return /* @__PURE__ */ jsxs4("span", { className: "blockr-assistant-block", "data-removed": block.removed ? "" : void 0, title: block.removed ? `${block.name} left the board` : dot?.tooltip, children: [
    dot === void 0 ? null : /* @__PURE__ */ jsx4("span", { className: "blockr-assistant-dot", "data-filled": dot.filled ? "" : void 0, style }),
    /* @__PURE__ */ jsx4("span", { className: "blockr-assistant-block-name", children: block.name })
  ] });
}
function CallDetails({ call, state }) {
  return /* @__PURE__ */ jsxs4("div", { className: "blockr-assistant-call", "data-state": state, children: [
    /* @__PURE__ */ jsx4("div", { className: "blockr-assistant-call-label", children: "Args" }),
    /* @__PURE__ */ jsx4("pre", { className: "blockr-assistant-call-args", children: argsText(call.args) }),
    /* @__PURE__ */ jsx4("div", { className: "blockr-assistant-call-label", children: "Result" }),
    /* @__PURE__ */ jsx4(Result, { call, state })
  ] });
}
function Result({ call, state }) {
  if (state === "running") return /* @__PURE__ */ jsx4("p", { className: "blockr-assistant-call-note", children: "Running" });
  if (state === "ended" || call.result === void 0) return /* @__PURE__ */ jsx4("p", { className: "blockr-assistant-call-note", children: ENDED });
  const { text: text3, images, count } = call.result;
  return /* @__PURE__ */ jsxs4(Fragment, { children: [
    text3 === "" ? null : /* @__PURE__ */ jsx4("pre", { className: "blockr-assistant-call-result", children: text3 }),
    images.map((image2, index) => /* @__PURE__ */ jsx4(
      "img",
      {
        className: "blockr-assistant-call-image",
        src: `data:${image2.mimeType};base64,${image2.data}`,
        alt: `Image ${String(index + 1)} of the result`
      },
      index
    )),
    images.length === 0 && count > 0 ? /* @__PURE__ */ jsx4("p", { className: "blockr-assistant-call-note", children: count === 1 ? "The result had an image, which the board does not keep." : `The result had ${String(count)} images, which the board does not keep.` }) : null
  ] });
}
function StateMark({ state }) {
  const label = { running: "Running", done: "Done", failed: "Failed", ended: "Ended before it returned" }[state];
  return /* @__PURE__ */ jsx4("span", { className: "blockr-assistant-tool-mark", "data-state": state, role: "img", "aria-label": label, title: label });
}
function stateOf(call, waiting2) {
  if (call.result === void 0) return waiting2.has(call.id) ? "running" : "ended";
  return call.error ? "failed" : "done";
}
function rowState(states) {
  for (const state of ["running", "failed", "ended"]) {
    if (states.includes(state)) return state;
  }
  return "done";
}
function argsText(args) {
  return JSON.stringify(args ?? {}, null, 2);
}

// srcts/chat/transcript.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function Transcript() {
  const { AuiIf, ThreadPrimitive } = libraries();
  return /* @__PURE__ */ jsxs5(ThreadPrimitive.Viewport, { className: "blockr-assistant-transcript", children: [
    /* @__PURE__ */ jsx5(AuiIf, { condition: isEmpty, children: /* @__PURE__ */ jsx5(Greeting, {}) }),
    /* @__PURE__ */ jsx5(ThreadPrimitive.Messages, { children: drawMessage }),
    /* @__PURE__ */ jsx5(Working, {}),
    /* @__PURE__ */ jsx5("div", { className: "blockr-assistant-transcript-end", children: /* @__PURE__ */ jsx5(ThreadPrimitive.ScrollToBottom, { className: "blockr-assistant-to-bottom", title: "Scroll to the newest message", "aria-label": "Scroll to the newest message", children: /* @__PURE__ */ jsx5("svg", { viewBox: "0 0 16 16", "aria-hidden": "true", children: /* @__PURE__ */ jsx5("path", { d: "M8 3v10M3.5 8.5 8 13l4.5-4.5" }) }) }) })
  ] });
}
function isEmpty(state) {
  return state.thread.isEmpty;
}
function drawMessage({ message: message2 }) {
  switch (message2.role) {
    case "user":
      return /* @__PURE__ */ jsx5(UserMessage, {});
    case "system":
      return /* @__PURE__ */ jsx5(Summary, {});
    default:
      return /* @__PURE__ */ jsx5(Reply, {});
  }
}
function Greeting() {
  const { core, send } = useChatActions();
  const { running } = useChat();
  const board = useBoard(core);
  const { lead, note: note2, suggestions } = greetingOf(board);
  return /* @__PURE__ */ jsxs5("div", { className: "blockr-assistant-greeting", children: [
    /* @__PURE__ */ jsx5("h3", { children: lead }),
    /* @__PURE__ */ jsx5("p", { children: note2 }),
    /* @__PURE__ */ jsx5("ul", { className: "blockr-assistant-suggestions", children: suggestions.map((suggestion) => /* @__PURE__ */ jsx5("li", { children: /* @__PURE__ */ jsx5(
      "button",
      {
        type: "button",
        className: "blockr-assistant-suggestion",
        disabled: running !== void 0,
        onClick: () => {
          send(suggestion);
        },
        children: suggestion
      }
    ) }, suggestion)) })
  ] });
}
function UserMessage() {
  const { MessagePrimitive, useAuiState } = libraries();
  const parts = useAuiState(({ message: message2 }) => message2.parts);
  const text3 = parts.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n\n");
  const files = parts.flatMap((part) => part.type === "data" && part.name === ATTACHMENT ? [fileName(part.data)] : []);
  return /* @__PURE__ */ jsxs5(MessagePrimitive.Root, { className: "blockr-assistant-user", children: [
    text3 === "" ? null : /* @__PURE__ */ jsx5("div", { className: "blockr-assistant-user-text", children: text3 }),
    files.length === 0 ? null : /* @__PURE__ */ jsx5("ul", { className: "blockr-assistant-files", children: files.map((name, index) => /* @__PURE__ */ jsx5("li", { children: name }, index)) })
  ] });
}
function Reply() {
  const { MessagePrimitive, useAuiState } = libraries();
  const parts = useAuiState(({ message: message2 }) => message2.parts);
  const running = useAuiState(({ message: message2 }) => message2.status?.type === "running");
  const segments = useMemo(() => segmentsOf(parts), [parts]);
  return /* @__PURE__ */ jsx5(MessagePrimitive.Root, { className: "blockr-assistant-reply", children: segments.map((segment) => {
    switch (segment.kind) {
      case "text":
        return /* @__PURE__ */ jsx5(MessagePrimitive.PartByIndex, { index: segment.index, components: TEXT }, `text-${String(segment.index)}`);
      case "reasoning": {
        const part = parts[segment.index];
        const text3 = part?.type === "reasoning" ? part.text : "";
        const last = segment.index === parts.length - 1;
        return /* @__PURE__ */ jsx5(Reasoning, { text: text3, running: running && last }, `reasoning-${String(segment.index)}`);
      }
      case "tools":
        return /* @__PURE__ */ jsx5(ToolRows, { rows: segment.rows }, `tools-${segment.rows[0]?.calls[0]?.id ?? ""}`);
      case "failure":
        return /* @__PURE__ */ jsx5("p", { className: "blockr-assistant-failure", role: "alert", children: segment.text }, "failure");
    }
  }) });
}
var TEXT = { Text: MarkdownText };
function Reasoning({ text: text3, running }) {
  return /* @__PURE__ */ jsxs5("details", { className: "blockr-assistant-reasoning", "data-running": running ? "" : void 0, children: [
    /* @__PURE__ */ jsx5("summary", { children: /* @__PURE__ */ jsx5("span", { className: "blockr-assistant-reasoning-label", children: "Reasoning" }) }),
    /* @__PURE__ */ jsx5("div", { className: "blockr-assistant-reasoning-text", children: /* @__PURE__ */ jsx5(Markdown, { text: text3, running }) })
  ] });
}
function Summary() {
  const { MessagePrimitive, useAuiState } = libraries();
  const parts = useAuiState(({ message: message2 }) => message2.parts);
  const text3 = parts.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n\n");
  return /* @__PURE__ */ jsx5(MessagePrimitive.Root, { className: "blockr-assistant-summary", children: /* @__PURE__ */ jsxs5("details", { children: [
    /* @__PURE__ */ jsx5("summary", { children: "Summary of the earlier messages" }),
    /* @__PURE__ */ jsx5("div", { className: "blockr-assistant-summary-text", children: /* @__PURE__ */ jsx5(Markdown, { text: text3 }) })
  ] }) });
}
function Working() {
  const { running, runsHere, waiting: waiting2 } = useChat();
  if (running === void 0 || !runsHere || running.stopping) return null;
  const streamed = running.reply !== void 0 && (running.reply.parts.length > 0 || running.reply.reasoning.length > 0);
  if (streamed || waiting2.size > 0) return null;
  return /* @__PURE__ */ jsxs5("p", { className: "blockr-assistant-working", "aria-label": "The assistant is working", children: [
    /* @__PURE__ */ jsx5("span", {}),
    /* @__PURE__ */ jsx5("span", {}),
    /* @__PURE__ */ jsx5("span", {})
  ] });
}
function fileName(data) {
  const name = typeof data === "object" && data !== null ? data.name : void 0;
  return typeof name === "string" ? name : "";
}

// srcts/chat/chat.tsx
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
function Chat({ core, assistant }) {
  const { AssistantRuntimeProvider, useExternalStoreRuntime } = libraries();
  const { conversations, turns } = assistant;
  const all = useConversations(conversations);
  const running = useRunning(turns);
  const [chosen, setChosen] = useState2(storedConversation);
  const [link, setLink] = useState2(void 0);
  const open2 = chosen !== void 0 && Object.hasOwn(all, chosen) ? chosen : void 0;
  const conversation2 = open2 === void 0 ? void 0 : all[open2];
  const messages = conversation2?.messages ?? NO_MESSAGES;
  const runsHere = running !== void 0 && running.conversation === open2;
  const shown3 = shownOf(messages, runsHere ? running : void 0, (message2) => open2 === void 0 ? void 0 : conversations.kept(open2, message2));
  const send = useCallback2(
    (text3) => {
      if (text3.trim() === "" || turns.current() !== void 0) return Promise.resolve();
      return sendMessage(assistant, open2, text3, (added) => {
        storeConversation(added);
        setChosen(added);
      });
    },
    [assistant, open2, turns]
  );
  const runtime = useExternalStoreRuntime({
    messages: shown3,
    convertMessage: threadMessageOf,
    isRunning: runsHere,
    isSendDisabled: running !== void 0,
    onNew: async (message2) => {
      const text3 = textOf2(message2);
      try {
        await send(text3);
      } catch (error) {
        core.log("blockr.assistant").error(error instanceof Error ? error : new Error(String(error)));
        runtime.thread.composer.setText(text3);
      }
    },
    onCancel: () => {
      turns.stop();
      return Promise.resolve();
    }
  });
  const actions = useMemo2(
    () => ({
      core,
      send: (text3) => {
        send(text3).catch((error) => {
          core.log("blockr.assistant").error(error instanceof Error ? error : new Error(String(error)));
        });
      },
      stop: () => {
        turns.stop();
      },
      openLink: setLink
    }),
    [core, send, turns]
  );
  const history = useMemo2(() => messages.filter((message2) => message2.role === "user" && !isNote(message2)).map(typedText).filter((text3) => text3 !== ""), [messages]);
  const waiting2 = useMemo2(() => waitingCalls(messages, runsHere ? running : void 0), [messages, running, runsHere]);
  const state = useMemo2(
    () => ({
      running,
      runsHere,
      waiting: waiting2,
      history,
      titleOf: (id) => Object.hasOwn(all, id) ? all[id]?.title : void 0
    }),
    [all, history, running, runsHere, waiting2]
  );
  const escape = (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || running === void 0) return;
    if (event.target instanceof Element && event.target.closest("dialog") !== null) return;
    event.preventDefault();
    turns.stop();
  };
  return /* @__PURE__ */ jsx6(AssistantRuntimeProvider, { runtime, children: /* @__PURE__ */ jsx6(ChatActionsContext, { value: actions, children: /* @__PURE__ */ jsx6(ChatStateContext, { value: state, children: /* @__PURE__ */ jsxs6("div", { className: "blockr-assistant-chat", onKeyDown: escape, children: [
    /* @__PURE__ */ jsx6(Transcript, {}),
    /* @__PURE__ */ jsx6(Composer, {}),
    /* @__PURE__ */ jsx6(
      LinkDialog,
      {
        url: link,
        onClose: () => {
          setLink(void 0);
        }
      }
    )
  ] }) }) }) });
}
var NO_MESSAGES = [];
function textOf2(message2) {
  return message2.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n");
}
function typedText(message2) {
  return message2.parts.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n");
}

// srcts/chat/panel.tsx
import { jsx as jsx7 } from "react/jsx-runtime";
function renderChat({ el, core }) {
  const root = createRoot(el);
  flushSync(() => {
    root.render(/* @__PURE__ */ jsx7(Panel, { core }));
  });
  return () => {
    root.unmount();
  };
}
function Panel({ core }) {
  const assistant = useAssistant(core);
  const loaded2 = useLibraries(core);
  return /* @__PURE__ */ jsx7("div", { className: "blockr-assistant", children: loaded2 === "failed" ? /* @__PURE__ */ jsx7("p", { className: "blockr-assistant-unloaded", children: "The chat could not load. Reload the page to try again." }) : loaded2 && assistant !== void 0 ? /* @__PURE__ */ jsx7(Chat, { core, assistant }, assistantKey(assistant)) : null });
}
function useAssistant(core) {
  const [assistant, setAssistant] = useState3(() => open(assistantOf(core)));
  useEffect3(() => {
    if (assistant !== void 0 && !assistant.signal.aborted) {
      const closed2 = () => {
        setAssistant(void 0);
      };
      assistant.signal.addEventListener("abort", closed2, { once: true });
      return () => {
        assistant.signal.removeEventListener("abort", closed2);
      };
    }
    let live = true;
    void nextAssistant(core).then((next) => {
      if (live) setAssistant(next);
    });
    return () => {
      live = false;
    };
  }, [assistant, core]);
  return open(assistant);
}
function useLibraries(core) {
  const [loaded2, setLoaded] = useState3(librariesLoaded);
  useEffect3(() => {
    if (loaded2 !== false) return;
    let live = true;
    loadLibraries().then(
      () => {
        if (live) setLoaded(true);
      },
      (error) => {
        core.log("blockr.assistant").error(new Error(`The assistant's chat could not load its libraries: ${String(error)}`, { cause: error }));
        if (live) setLoaded("failed");
      }
    );
    return () => {
      live = false;
    };
  }, [core, loaded2]);
  return loaded2;
}
function open(assistant) {
  return assistant?.signal.aborted === false ? assistant : void 0;
}
var keys = /* @__PURE__ */ new WeakMap();
var drawn = 0;
function assistantKey(assistant) {
  let key = keys.get(assistant);
  if (key === void 0) {
    drawn += 1;
    key = String(drawn);
    keys.set(assistant, key);
  }
  return key;
}

// srcts/modules/assistant_plugin/index.tsx
var api = 1;
var ui = {
  render({ el, core }) {
    return renderChat({ el, core });
  }
};
var assistant_plugin_default = {
  ui,
  // TypeScript gives the objects in the JSON's arrays properties that may be
  // undefined, which no Json has, so it does not take the schema for a Json,
  // though it is one.
  state: { schema: assistant_plugin_schema_default, default: { conversations: {} } },
  commands: assistantCommands,
  start({ core, signal }) {
    openAssistant(core, signal);
    return void 0;
  }
};
export {
  api,
  assistant_plugin_default as default
};
