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

// srcts/commands/command.ts
function command(definition) {
  return {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    args: definition.args,
    undo: false,
    enabled: (board, args) => definition.enabled(board, args),
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
    description: "Adds a conversation that holds no message, under the id given, with its title and its pick of the model, or null for the default where that is left out. It is not enabled for an id that a conversation has already.",
    args: object(
      {
        id: { type: "string", minLength: 1, description: "The id of the new conversation." },
        title,
        model
      },
      ["id", "title"]
    ),
    enabled: (board, { id }) => {
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
    enabled: (board, { conversation: conversation2 }) => holds(board, conversation2),
    run: (_board, { conversation: conversation2, title: title2 }) => ({
      patches: [{ op: "replace", path: at("conversations", conversation2, "title"), value: title2 }]
    })
  }),
  command({
    id: "blockr.assistant-remove_conversation",
    label: "Remove conversation",
    description: "Removes a conversation with its messages.",
    args: object({ conversation }, ["conversation"]),
    enabled: (board, { conversation: conversation2 }) => holds(board, conversation2),
    run: (_board, { conversation: conversation2 }) => ({ patches: [{ op: "remove", path: at("conversations", conversation2) }] })
  }),
  command({
    id: "blockr.assistant-add_message",
    label: "Add message",
    description: "Adds a finished message at the end of a conversation, and sets the conversation's `updated` to the message's `created`. Where `keep` is given, it then drops the conversation's oldest exchanges until `keep` messages or fewer are left, counting no note of what others changed in the board. An exchange starts at a message that the user sent, or at a summary, and the last exchange is never dropped, however many messages it holds. It is not enabled for a message whose id a message of the conversation has.",
    args: object(
      {
        conversation,
        message,
        keep: keep("How many messages the conversation keeps, every one where this is left out.")
      },
      ["conversation", "message"]
    ),
    enabled: (board, { conversation: conversation2, message: message2 }) => {
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
    enabled: (board) => assistantState(board) !== void 0,
    run: (board, { keep: keep2 }) => ({
      patches: Object.entries(assistantState(board)?.conversations ?? {}).flatMap(
        ([id, conversation2]) => drops(id, messagesToDrop(conversation2.messages, keep2))
      )
    })
  }),
  command({
    id: "blockr.assistant-compact_conversation",
    label: "Compact conversation",
    description: "Puts a summary in place of the messages of a conversation before `from`, the first message that it keeps. It is not enabled where the conversation no longer holds `from`.",
    args: object(
      {
        conversation,
        summary,
        from: { type: "string", description: "The id of the first message that the conversation keeps after the summary." }
      },
      ["conversation", "summary", "from"]
    ),
    enabled: (board, { conversation: conversation2, summary: summary2, from }) => {
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
    enabled: (board, { conversation: conversation2 }) => holds(board, conversation2),
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
    enabled: (board, { conversation: conversation2 }) => holds(board, conversation2),
    run: (_board, { conversation: conversation2, model: model2 }) => ({
      patches: [{ op: "replace", path: at("conversations", conversation2, "model"), value: model2 }]
    })
  })
];

// srcts/conversations/cap.ts
async function readCap(core) {
  const sent = await core.blockrOption("chat_save_turns");
  if (sent === void 0) return 50;
  const value = typeof sent === "string" ? asNumber(sent) : sent;
  if (value === -1) return Infinity;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  throw new RangeError(
    `The blockr option chat_save_turns is ${JSON.stringify(sent)}, where it takes a whole number of 0 or more, or -1 for every message.`
  );
}
function asNumber(text) {
  return text.trim() === "" ? Number.NaN : Number(text);
}

// srcts/conversations/conversations.ts
var ORIGIN = "assistant";
function createConversations(core, signal) {
  let cap;
  const memory = /* @__PURE__ */ new Map();
  const older = /* @__PURE__ */ new Map();
  const stop = core.store.subscribe((_change, board) => {
    const held = assistantState(board)?.conversations ?? {};
    for (const id of older.keys()) {
      if (!Object.hasOwn(held, id)) older.delete(id);
    }
  });
  signal.addEventListener("abort", stop, { once: true });
  const capped = readCap(core).then(async (read) => {
    cap = read;
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
    if (cut.length > 0) older.set(conversation2, [...older.get(conversation2) ?? [], ...cut]);
  }
  function withOlder(id, conversation2) {
    const cut = older.get(id);
    return cut === void 0 ? conversation2 : { ...conversation2, messages: [...cut, ...conversation2.messages] };
  }
  function change(conversation2, changed) {
    const held = memory.get(conversation2);
    if (held === void 0) throw new Error(`The plugin's memory holds no conversation "${conversation2}".`);
    memory.set(conversation2, changed(held));
  }
  return {
    opened: capped.then(() => void 0),
    all() {
      if (cap === 0) return Object.fromEntries(memory);
      const conversations = assistantState(core.store.board())?.conversations ?? {};
      return Object.fromEntries(Object.entries(conversations).map(([id, conversation2]) => [id, withOlder(id, conversation2)]));
    },
    get(conversation2) {
      if (cap === 0) return memory.get(conversation2);
      const held = findConversation(core.store.board(), conversation2);
      return held === void 0 ? void 0 : withOlder(conversation2, held);
    },
    async addConversation(id, title2, model2 = null) {
      if (await capped !== 0) {
        await run("blockr.assistant-add_conversation", { id, title: title2, model: model2 });
        return;
      }
      if (memory.has(id)) throw new Error(`The plugin's memory holds a conversation "${id}" already.`);
      memory.set(id, newConversation(title2, model2));
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
    },
    async addMessage(conversation2, message2) {
      const read = await capped;
      if (read !== 0) {
        const before = findConversation(core.store.board(), conversation2)?.messages ?? [];
        const done = run("blockr.assistant-add_message", { conversation: conversation2, message: message2, ...read === Infinity ? {} : { keep: read } });
        keepCut(conversation2, before);
        await done;
        return;
      }
      change(conversation2, (held) => {
        if (holdsMessage(held, message2.id)) {
          throw new Error(`The conversation "${conversation2}" holds a message "${message2.id}" already.`);
        }
        return { ...held, messages: [...held.messages, message2], updated: message2.created };
      });
    },
    async compactConversation(conversation2, summary2, from) {
      const read = await capped;
      if (read === 0) {
        change(conversation2, (held2) => ({ ...held2, messages: compacted(held2.messages, summary2, from, conversation2) }));
        return;
      }
      const held = findConversation(core.store.board(), conversation2);
      if (held === void 0 || holdsMessage(held, from)) {
        await run("blockr.assistant-compact_conversation", { conversation: conversation2, summary: summary2, from });
        older.delete(conversation2);
        return;
      }
      const cut = older.get(conversation2) ?? [];
      const kept = compacted([...cut, ...held.messages], summary2, from, conversation2);
      older.set(conversation2, kept.slice(0, kept.length - held.messages.length));
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
    createConversations(core, signal).opened.catch((error) => {
      core.log("blockr.assistant").error(error instanceof Error ? error : new Error(String(error)));
    });
    return void 0;
  }
};
export {
  api,
  assistant_plugin_default as default
};
