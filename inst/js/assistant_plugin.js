// srcts/modules/assistant_plugin/index.tsx
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

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
function sentNumber(sent) {
  if (typeof sent === "number") return sent;
  if (typeof sent !== "string" || sent.trim() === "") return Number.NaN;
  return Number(sent);
}

// srcts/conversations/cap.ts
async function readCap(core) {
  const sent = await core.blockrOption("chat_save_turns");
  if (sent === void 0) return 50;
  const value = sentNumber(sent);
  if (value === -1) return Infinity;
  if (Number.isInteger(value) && value >= 0) return value;
  throw new RangeError(
    `The blockr option chat_save_turns is ${JSON.stringify(sent)}, where it takes a whole number of 0 or more, or -1 for every message.`
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
  let given;
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
    await open(read);
    return read;
  });
  function run(id, args) {
    return core.commands.run(id, args, ORIGIN);
  }
  async function open(read) {
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
      if (given !== void 0 && given.state === now && given.changes === changes) return given.all;
      const all = cap === 0 ? Object.fromEntries(memory) : Object.fromEntries(Object.entries(now?.conversations ?? {}).map(([id, conversation2]) => [id, withOlder(id, conversation2)]));
      given = { state: now, changes, all };
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
function callMessages(messages, kept, model2, tools, systemPrompt) {
  return [systemMessage(systemPrompt, tools), ...piMessages(messages, kept, model2)];
}
function systemMessage(prompt, tools) {
  const declared = tools.map((tool2) => ({ name: tool2.name, description: tool2.description, parameters: tool2.parameters }));
  return { role: "system", content: prompt, ...declared.length > 0 ? { toolsAdded: declared } : {}, timestamp: Date.now() };
}
function piMessages(messages, kept, model2) {
  const out = [];
  for (let i = 0; i < messages.length; i += 1) {
    const message2 = messages[i];
    if (message2 === void 0) continue;
    const at2 = Date.parse(message2.created);
    if (message2.role === "user") {
      const content = userContent(message2.parts);
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
function userContent(parts) {
  return parts.flatMap((part) => {
    switch (part.type) {
      case "text":
      case "changes":
      case "skill":
        return [text(part.text)];
      case "attachment":
        return [text(`The user attached the file "${part.name}", of the type ${part.media_type}, whose content is no longer available.`)];
      default:
        return [];
    }
  });
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

// srcts/loop/loop.ts
var PROVIDER = "blockr.assistant";
function createLoop(pi, apis = {}) {
  const streams = {
    "anthropic-messages": pi.anthropicMessages,
    "openai-completions": pi.openaiCompletions,
    "openai-responses": pi.openaiResponses,
    ...apis
  };
  return { run: (turn) => runTurn(pi, streams, turn) };
}
async function loadLoop() {
  return createLoop(await import("./pi-73d60f71.js"));
}
async function runTurn(pi, streams, turn) {
  const model2 = modelOf(pi, turn.model, turn.connection);
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
  const given = /* @__PURE__ */ new Map();
  const answered = /* @__PURE__ */ new Map();
  const answer = (id) => given.get(id) ?? answered.get(id) ?? { text: STOPPED, isError: true, images: [] };
  const tools = turn.tools.map((tool2) => agentTool(tool2, given));
  const prompt = turn.systemPrompt ?? "";
  const kept = (message2) => turn.kept(message2);
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
      return callMessages(transformed, kept, model2, turn.tools, prompt);
    },
    getApiKey: () => turn.connection.apiKey(),
    ...turn.onPayload === void 0 ? {} : { onPayload: turn.onPayload }
  };
  const emit = async (event) => {
    switch (event.type) {
      case "message_start":
      case "message_update":
        if (event.message.role === "assistant") turn.on.streaming({ parts: partsOf(event.message), reasoning: reasoningOf(event.message) });
        return;
      case "message_end":
        if (event.message.role === "assistant") await turn.on.called(callOf(event.message));
        return;
      case "tool_execution_end":
        if (!given.has(event.toolCallId) && !turn.signal.aborted) {
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
  const context = { messages: callMessages(turn.messages(), kept, model2, turn.tools, prompt), tools };
  await pi.runAgentLoopContinue(context, config, emit, turn.signal, models.streamSimple.bind(models));
}
function modelOf(pi, id, connection) {
  const at2 = { id, api: connection.api, provider: PROVIDER, baseUrl: connection.baseUrl };
  const known = catalogModel(pi, id);
  if (known === void 0) {
    return {
      ...at2,
      name: id,
      reasoning: true,
      input: ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 2e5,
      maxTokens: 32e3
    };
  }
  return { ...known, ...at2, headers: void 0, compat: known.api === connection.api ? known.compat : void 0 };
}
function catalogModel(pi, id) {
  for (const catalog of [pi.ANTHROPIC_MODELS, pi.OPENAI_MODELS]) {
    if (Object.hasOwn(catalog, id)) return catalog[id];
  }
  return void 0;
}
function callOf(reply) {
  const written = replyOf(reply);
  return {
    ...written === void 0 ? {} : { reply: written },
    usage: { input: reply.usage.input, output: reply.usage.output, total: reply.usage.totalTokens },
    ...reply.stopReason === "error" ? { failure: reply.errorMessage ?? "The provider gave no reason." } : {}
  };
}
function agentTool(tool2, given) {
  return {
    name: tool2.name,
    label: tool2.name,
    description: tool2.description,
    parameters: tool2.parameters,
    executionMode: tool2.executionMode,
    async execute(id, args, signal) {
      const result = await tool2.execute(args, signal ?? new AbortController().signal);
      given.set(id, { text: result.text, isError: result.isError, images: result.images });
      const content = [{ type: "text", text: result.text }, ...result.images.map(image)];
      return { content, details: void 0, isError: result.isError };
    }
  };
}
function answeredOf(result, isError) {
  const text2 = result.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("\n");
  const images = result.content.flatMap((block) => block.type === "image" ? [{ data: block.data, mimeType: block.mimeType }] : []);
  return { text: text2, isError, images };
}

// srcts/requests/requests.ts
async function sendRequest(core, name, args, opts = {}) {
  let conditions = [];
  const answer = await core.request(ASSISTANT, name, args, {
    ...opts,
    conditions: (given) => {
      conditions = given;
    }
  });
  return { answer, conditions };
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

// srcts/skills/skills.ts
function createSkills(core, signal) {
  const listed = listSkills(core, signal);
  return { list: () => listed };
}
async function listSkills(core, signal) {
  for (; ; ) {
    try {
      const { answer } = await sendRequest(core, "list_skills", { packages: appPackages(core) }, { signal });
      return skillsOf(answer);
    } catch (error) {
      if (signal.aborted) return [];
      if (isSessionEnded(error)) continue;
      core.notifications.notify(ASSISTANT, {
        severity: "error",
        code: "assistant_skills_failed",
        message: `The assistant goes on without skills, since R could not list them: ${failureMessage(error)}`
      });
      return [];
    }
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
      name: one(fields, "name"),
      description: one(fields, "description"),
      blocks: answeredTexts(fields.blocks, "list_skills"),
      plugins: answeredTexts(fields.plugins, "list_skills"),
      userInvocable: flag(fields, "user-invocable"),
      modelInvocable: !flag(fields, "disable-model-invocation")
    };
  });
}
function one(fields, name) {
  const [value, ...rest] = answeredTexts(fields[name], "list_skills");
  if (value === void 0 || rest.length > 0) {
    throw new TypeError(`R's reply to list_skills gives a skill's ${name} as ${JSON.stringify(fields[name] ?? null)}, where it gives one string.`);
  }
  return value;
}
function flag(fields, name) {
  const value = fields[name];
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === "boolean") return value[0];
  throw new TypeError(`R's reply to list_skills gives a skill's ${name} as ${JSON.stringify(value ?? null)}, where it gives true or false.`);
}

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
function tokens(description) {
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
        input: tokens("The input tokens of the call."),
        output: tokens("The output tokens of the call."),
        total: tokens("Every token of the call, its cached input included.")
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
  assistant_eval_max_chars: 16e3
};
async function readToolCap(core, name) {
  const sent = await core.blockrOption(name);
  if (sent === void 0) return DEFAULTS[name];
  const value = sentNumber(sent);
  if (Number.isInteger(value) && value >= 0) return value;
  throw new RangeError(`The blockr option ${name} is ${JSON.stringify(sent)}, where it takes a whole number of 0 or more.`);
}

// srcts/tools/cut.ts
function cutText(text2, max, hint) {
  const chars = Array.from(text2);
  if (chars.length <= max) return text2;
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
  const spend = (text2) => {
    const kept = cutText(text2, Math.max(0, budget));
    budget -= Array.from(kept).length;
    return kept;
  };
  const walk = (item) => {
    if (typeof item === "string") return spend(item);
    if (Array.isArray(item)) return item.map(walk);
    if (item !== null && typeof item === "object") {
      return Object.fromEntries(Object.entries(item).map(([key, inner]) => [key, walk(inner)]));
    }
    const text2 = JSON.stringify(item);
    if (text2.length <= budget) {
      budget -= text2.length;
      return item;
    }
    return spend(text2);
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
async function skillsNaming(context, kind, id) {
  const [listed, max] = await Promise.all([context.skills.list(), readToolCap(context.core, "assistant_skill_description_max_chars")]);
  return listed.filter((skill) => skill.modelInvocable && skill[kind].includes(id)).map((skill) => ({ name: skill.name, description: skillBlurb(skill.name, skill.description, max) }));
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
      const said = why.filter((text2) => text2 !== null && text2 !== "");
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
function blockTypeTools(context) {
  const { core } = context;
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
        const skills = await skillsNaming(context, "blocks", id);
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

// srcts/tools/blocks.ts
var STATE_HINT = "call get_block_state for the full argument values";
var ID = { type: "string", description: "The block's id, as list_blocks gives it." };
function blockTools(context) {
  const { core } = context;
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
          skillsNaming(context, "blocks", found(id).registry_id),
          readToolCap(core, "assistant_state_value_max_chars"),
          readToolCap(core, "assistant_summary_max_chars")
        ]);
        const board = core.store.board();
        const block = found(id);
        const status = core.scheduler.status(id);
        const reason = status?.reason ?? null;
        const summary2 = status?.summary ?? null;
        const note = statusNote(status);
        const described = {
          id,
          name: block.name,
          registry_id: block.registry_id,
          status: status?.status ?? null,
          ...reason === null ? {} : { reason },
          ...note === void 0 ? {} : { note },
          ...summary2 === null ? {} : { summary: summary2 },
          conditions: conditionList(status?.conditions ?? []),
          ...skills.length === 0 ? {} : { skills },
          inputs: [...own(core.blockRegistry(), block.registry_id)?.inputs ?? []],
          links: Object.entries(board.links).filter(([, link]) => link.to === id).map(([link, { from, input }]) => ({ id: link, from, input })),
          state: leaveOutLong(block.state, valueMax, STATE_HINT)
        };
        return cutText(json(described), summaryMax, STATE_HINT);
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
        const note = statusNote(status);
        const given = {
          id,
          status: status?.status ?? null,
          ...note === void 0 ? {} : { note },
          conditions: conditionsBySeverity(status?.conditions ?? [])
        };
        return Promise.resolve(json(given));
      }
    })
  ];
}

// srcts/tools/commands.ts
var OWN = new Set(assistantCommands.map((command2) => command2.id));
function commandTools({ core }) {
  const offered = () => Object.values(core.commands.registered()).filter((command2) => !OWN.has(command2.id));
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
        const command2 = OWN.has(id) ? void 0 : own(core.commands.registered(), id);
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
            const listed = {
              id: option.id,
              label: option.label,
              category: option.category,
              schema: option.schema,
              ...value === void 0 ? {} : { value }
            };
            return listed;
          })
        )
      )
    })
  ];
}

// srcts/tools/plugins.ts
function pluginTools(context) {
  const { core } = context;
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
        const [skills, max] = await Promise.all([skillsNaming(context, "plugins", id), readToolCap(core, "assistant_state_max_chars")]);
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

// srcts/tools/conditions.ts
async function toolRequest(core, name, args, opts = {}) {
  try {
    return await sendRequest(core, name, args, opts);
  } catch (error) {
    if (!isRequestError(error) || !error.conditions.some(isWarningOrMessage)) throw error;
    throw new Error(await withConditions(core, failureMessage(error), error.conditions), { cause: error });
  }
}
async function withConditions(core, text2, conditions) {
  const lines = conditions.filter(isWarningOrMessage).map(({ severity, message: message2 }) => `${severity === "warning" ? "Warning" : "Message"}: ${message2}`);
  if (lines.length === 0) return text2;
  const listed = cutText(lines.join("\n"), await readToolCap(core, "assistant_eval_max_chars"));
  return text2 === "" ? listed : `${text2}

${listed}`;
}
function isWarningOrMessage(condition) {
  return condition.severity !== "error";
}

// srcts/tools/read-skill.ts
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
        const skill = (await skills.list()).find((listed) => listed.name === name);
        if (skill?.modelInvocable !== true) throw new Error(noSkill(name));
        const given = { name, packages: appPackages(core), ...file === void 0 ? {} : { path: file } };
        const { answer, conditions } = await toolRequest(core, "read_skill", given, { signal });
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
        const given = { code, ...width === void 0 ? {} : { width }, ...height === void 0 ? {} : { height } };
        const { answer, conditions } = await toolRequest(core, "inspect_results", given, { reads: [...blocks], signal });
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
  const context = { core, skills };
  return [
    ...blockTools(context),
    ...boardTools(context),
    ...blockTypeTools(context),
    ...commandTools(context),
    ...pluginTools(context),
    ...optionTools(context),
    ...resultTools(context),
    ...skillTools(context)
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
var NO_MODEL = "The assistant has no model to talk to, since the conversation picked none and the app offers none.";
function createTurns(core, signal, options) {
  const { conversations, connection } = options;
  const locks = "locks" in options ? options.locks : pageLocks();
  const listeners = /* @__PURE__ */ new Set();
  let running;
  let snapshot;
  let withdraw;
  signal.addEventListener(
    "abort",
    () => {
      withdraw = void 0;
    },
    { once: true }
  );
  function closed() {
    return signal.aborted;
  }
  function changed() {
    snapshot = running === void 0 ? void 0 : { conversation: running.conversation, reply: running.reply, results: running.results, stopping: running.stopping };
    for (const listener of listeners) listener();
  }
  function fail(conversation2, why) {
    withdraw?.();
    withdraw = core.notifications.notify(ASSISTANT, { severity: "error", code: "assistant_call_failed", message: why });
    const last = conversations.get(conversation2)?.messages.at(-1);
    if (last !== void 0) conversations.keep(conversation2, last.id, { failure: why });
  }
  function succeeded() {
    withdraw?.();
    withdraw = void 0;
  }
  function handlers(turn) {
    let writes = true;
    const write = async (change) => {
      if (!writes || closed()) return;
      try {
        await change();
      } catch (error) {
        writes = false;
        turn.controller.abort(GONE);
        core.log("blockr.assistant").warn(`The assistant stopped its turn, since its conversation took no more messages: ${messageOf(error)}`);
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
          if (writes && !closed()) fail(turn.conversation, `The assistant's call to the model failed: ${call.failure}`);
        } else if (!turn.controller.signal.aborted) {
          succeeded();
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
    const held = conversations.get(turn.conversation);
    if (held === void 0) return;
    const model2 = held.model ?? connection.model;
    if (model2 === null) {
      fail(turn.conversation, NO_MODEL);
      return;
    }
    let loop;
    try {
      loop = await options.load();
    } catch (error) {
      if (!closed()) fail(turn.conversation, `The assistant could not load the code that runs its turns: ${messageOf(error)}`);
      return;
    }
    if (turn.controller.signal.aborted) return;
    await loop.run({
      connection,
      model: model2,
      tools: options.tools,
      messages: () => conversations.get(turn.conversation)?.messages ?? [],
      kept: (message2) => conversations.kept(turn.conversation, message2),
      signal: turn.controller.signal,
      on: handlers(turn)
    });
  }
  return {
    async run(conversation2) {
      if (closed()) throw new Error("The board that the assistant's turns ran on is closed.");
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
        if (!closed()) fail(conversation2, `The assistant's turn failed: ${messageOf(error)}`);
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
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

// srcts/assistant/assistant.ts
var UNSET = {
  baseUrl: "https://api.openai.com/v1",
  api: "openai-responses",
  apiKey: () => Promise.resolve(void 0),
  model: null
};
var opened = /* @__PURE__ */ new WeakMap();
var waiting = /* @__PURE__ */ new WeakMap();
function openAssistant(core, signal, options = {}) {
  const conversations = createConversations(core, signal);
  conversations.opened.catch((error) => {
    core.log("blockr.assistant").error(error instanceof Error ? error : new Error(String(error)));
  });
  const skills = createSkills(core, signal);
  const turns = createTurns(core, signal, {
    conversations,
    tools: readTools(core, skills),
    connection: options.connection ?? UNSET,
    load: options.load ?? loadLoop,
    ..."locks" in options ? { locks: options.locks } : {}
  });
  const assistant = { conversations, skills, turns, signal };
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

// srcts/modules/assistant_plugin/index.tsx
import { jsx } from "react/jsx-runtime";
var api = 1;
var ui = {
  render({ el }) {
    const root = createRoot(el);
    flushSync(() => {
      root.render(/* @__PURE__ */ jsx("div", {}));
    });
    return () => {
      root.unmount();
    };
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
