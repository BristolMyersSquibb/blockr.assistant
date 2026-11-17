// The models that the assistant offers on the open board (./models.ts): those
// that the deployment names, those of the base URL's list, when the assistant
// asks for the list again, which error each failed list raises, the list for
// the visitor's own key, and the list that checks a key.

import type { Raised } from "@blockr/core";
import { describe, expect, test, vi } from "vitest";
import type { Deployment } from "../deployment/index.ts";
import { heldError } from "../notifications/index.ts";
import { createVisitorKey } from "../visitor-key/index.ts";
import type { VisitorKey } from "../visitor-key/index.ts";
import type { Fetch } from "./list.ts";
import { createModels, resolveModel } from "./models.ts";

// A core that holds the notifications that the assistant raises.
function holding() {
  const held = new Set<Raised>();
  const core = {
    notifications: {
      notify: (_plugin: string, notification: Raised) => {
        held.add(notification);
        return () => {
          held.delete(notification);
        };
      },
    },
  };
  const raised = (code: string): string[] => [...held].filter((notification) => notification.code === code).map(({ message }) => message);
  return { core, raised };
}

// A fetch that answers each request with the next of the responses given,
// and counts the requests.
function answering(...responses: (() => Response | Promise<Response>)[]) {
  let asked = 0;
  const fetch: Fetch = () => {
    const respond = responses[Math.min(asked, responses.length - 1)];
    asked += 1;
    return respond === undefined ? Promise.reject(new Error("No response.")) : Promise.resolve(respond());
  };
  return { fetch, asked: () => asked };
}

// A fetch that answers each request with the next of the responses given, and
// records the key that each request carries in Authorization.
function recording(...responses: (() => Response | Promise<Response>)[]) {
  const keys: (string | null)[] = [];
  const { fetch: answer, asked } = answering(...responses);
  const fetch: Fetch = (input, init) => {
    keys.push(new Headers(init.headers).get("authorization"));
    return answer(input, init);
  };
  return { fetch, asked, keys };
}

function proxy(given: Partial<Deployment> = {}): Deployment {
  return { baseUrl: "https://proxy.invalid/v1", api: "openai-completions", credential: { kind: "deployment", key: "test-key" }, models: undefined, ...given };
}

// The models of the board, on the deployment, the fetch and the visitor's key
// given, a key of the visitor's that holds none unless given.
function opened(deployment: Deployment | Promise<Deployment>, fetch: Fetch, key: VisitorKey = createVisitorKey()) {
  const { core, raised } = holding();
  const controller = new AbortController();
  const callFailed = heldError(core, controller.signal, "assistant_call_failed");
  const models = createModels(core, controller.signal, { deployment: Promise.resolve(deployment), callFailed, key, fetch });
  return { models, raised, controller, key };
}

const visited = proxy({ credential: { kind: "visitor" } });

const listed = () => Response.json({ data: [{ id: "gpt-5.4" }, { id: "gpt-5.4-nano" }] });
const missing = () => new Response("Not Found", { status: 404 });

describe("the models that the assistant offers", () => {
  test("are those that the deployment names, for which it asks for no list", async () => {
    const { fetch, asked } = answering(listed);
    const { models } = opened(proxy({ models: ["company-gpt", "company-claude"] }), fetch);

    await expect(models.offered()).resolves.toEqual({ models: ["company-gpt", "company-claude"], named: true });
    expect(asked()).toBe(0);
  });

  test("are those of the base URL's list, for which it asks once as the board opens", async () => {
    const { fetch, asked } = answering(listed);
    const { models, raised } = opened(proxy(), fetch);

    await expect(models.offered()).resolves.toEqual({ models: ["gpt-5.4", "gpt-5.4-nano"], named: false });
    await expect(models.offered()).resolves.toEqual({ models: ["gpt-5.4", "gpt-5.4-nano"], named: false });
    expect(asked()).toBe(1);
    expect(raised("assistant_models_failed")).toEqual([]);
  });

  test("carry the settings that the base URL's list gives each, where it gives any", async () => {
    const { fetch } = answering(() =>
      Response.json({
        data: [
          { id: "openai/gpt-5.4", context_length: 1050000, top_provider: { max_completion_tokens: 128000 }, architecture: { input_modalities: ["text", "image"] } },
          { id: "openai/gpt-5.4-nano" },
        ],
      }),
    );
    const { models } = opened(proxy(), fetch);

    await expect(models.offered()).resolves.toEqual({
      models: ["openai/gpt-5.4", "openai/gpt-5.4-nano"],
      named: false,
      settings: new Map([["openai/gpt-5.4", { contextWindow: 1050000, maxTokens: 128000, images: true }]]),
    });
  });

  test("are none where the visitor authenticates and has given no key, for which they ask for no list", async () => {
    const { fetch, asked } = answering(listed);
    const { models } = opened(visited, fetch);

    await expect(models.offered()).resolves.toEqual({ models: [], named: false });
    expect(asked()).toBe(0);
  });

  test("raise assistant_models_failed where the list fails as the board opens, ask again as the user tries to send, and withdraw it once a list offers a model", async () => {
    const { fetch, asked } = answering(missing, listed);
    const { models, raised } = opened(proxy(), fetch);

    await vi.waitFor(() => {
      expect(raised("assistant_models_failed")).toHaveLength(1);
    });
    expect(raised("assistant_models_failed")[0]).toBe(
      "The assistant offers no model, since the base URL gives no list of models at https://proxy.invalid/v1/models: it answered 404. An app on such a base URL names its models in the blockr option assistant_models.",
    );

    await expect(models.offered()).resolves.toEqual({ models: ["gpt-5.4", "gpt-5.4-nano"], named: false });
    expect(asked()).toBe(2);
    expect(raised("assistant_models_failed")).toEqual([]);
  });

  test("hold assistant_models_failed while each list fails, one notification at a time", async () => {
    const { fetch, asked } = answering(missing);
    const { models, raised } = opened(proxy(), fetch);

    await models.offered();
    await models.offered();

    expect(asked()).toBe(3);
    expect(raised("assistant_models_failed")).toHaveLength(1);
    expect(raised("assistant_call_failed")).toEqual([]);
  });

  test("raise assistant_call_failed where the base URL refuses the key for its list", async () => {
    const refused = () => Response.json({ error: { message: "User not found." } }, { status: 401 });
    const { fetch } = answering(missing, refused);
    const { models, raised } = opened(proxy(), fetch);

    const offered = await models.offered();

    const why = 'The base URL refused the assistant\'s key for its list of models at https://proxy.invalid/v1/models: it answered 401, "User not found.".';
    expect(offered).toEqual({ models: [], named: false, failure: why });
    expect(raised("assistant_call_failed")).toEqual([why]);
    expect(raised("assistant_models_failed")).toEqual([]);
  });

  test("are none, and raise nothing, where the deployment's blockr options cannot be read", async () => {
    const { fetch, asked } = answering(listed);
    const wrong = Promise.reject(new TypeError("The blockr option assistant_api is 1."));
    wrong.catch(() => undefined);
    const { models, raised } = opened(wrong, fetch);

    await expect(models.offered()).resolves.toEqual({ models: [], named: false });
    expect(asked()).toBe(0);
    expect([...raised("assistant_call_failed"), ...raised("assistant_models_failed")]).toEqual([]);
  });

  test("raise nothing for a list that answers once the next board opened", async () => {
    let answer: (response: Response) => void = () => undefined;
    const fetch: Fetch = (_url, init) =>
      new Promise((resolve, reject) => {
        answer = resolve;
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("The board closed.", "AbortError"));
        });
      });
    const { models, raised, controller } = opened(proxy(), fetch);

    const offered = models.offered();
    await Promise.resolve();
    controller.abort();
    answer(missing());

    await expect(offered).resolves.toEqual({ models: [], named: false });
    expect(raised("assistant_models_failed")).toEqual([]);
  });
});

describe("what the chat reads of the models offered", () => {
  test("is the last answer, without asking for the list again, and changes as an answer comes", async () => {
    const { fetch, asked } = answering(missing, listed);
    const { models } = opened(proxy(), fetch);
    const changes: unknown[] = [];
    models.subscribe(() => {
      changes.push(models.current());
    });

    expect(models.current()).toBeUndefined();
    await vi.waitFor(() => {
      expect(models.current()?.failure).toMatch(/gives no list of models/);
    });
    expect(asked()).toBe(1);

    await models.offered();
    expect(models.current()).toEqual({ models: ["gpt-5.4", "gpt-5.4-nano"], named: false });
    expect(changes).toHaveLength(2);
    expect(asked()).toBe(2);
  });

  test("gives the model that a conversation talks to: its pick where the models offered hold it, and the default otherwise", () => {
    const offered = { models: ["gpt-5.4", "gpt-5.4-nano"], named: true };

    expect(resolveModel(offered, "gpt-5.4-nano")).toBe("gpt-5.4-nano");
    expect(resolveModel(offered, null)).toBe("gpt-5.4");
    expect(resolveModel(offered, "gpt-4o")).toBe("gpt-5.4");
    expect(resolveModel({ models: [], named: false }, "gpt-5.4")).toBeUndefined();
  });
});

describe("the models for the visitor's own key", () => {
  const refused = () => Response.json({ error: { message: "Incorrect API key provided." } }, { status: 401 });
  const why = 'The base URL refused the assistant\'s key for its list of models at https://proxy.invalid/v1/models: it answered 401, "Incorrect API key provided.".';

  test("are those of the list that the base URL gives for the key, which they ask for once the visitor gives it", async () => {
    const { fetch, keys } = recording(listed);
    const { models, key } = opened(visited, fetch);
    await expect(models.offered()).resolves.toEqual({ models: [], named: false });

    key.give("sk-visitor");

    await expect(models.offered()).resolves.toEqual({ models: ["gpt-5.4", "gpt-5.4-nano"], named: false });
    expect(keys).toEqual(["Bearer sk-visitor"]);
  });

  test("are those of the list for the key that the visitor gave before the board opened", async () => {
    const { fetch, keys } = recording(listed);
    const key = createVisitorKey();
    key.give("sk-visitor");
    const { models } = opened(visited, fetch, key);

    await expect(models.offered()).resolves.toEqual({ models: ["gpt-5.4", "gpt-5.4-nano"], named: false });
    expect(keys).toEqual(["Bearer sk-visitor"]);
  });

  test("drop a key that the base URL refuses for its list, and ask again once the visitor gives a key, the same key included", async () => {
    const { fetch, keys } = recording(refused, refused, listed);
    const { models, raised, key } = opened(visited, fetch);

    key.give("sk-wrong");
    await vi.waitFor(() => {
      expect(key.current()).toEqual({ kind: "refused" });
    });
    expect(raised("assistant_call_failed")).toEqual([why]);

    key.give("sk-wrong");
    await vi.waitFor(() => {
      expect(keys).toHaveLength(2);
    });
    await vi.waitFor(() => {
      expect(key.current()).toEqual({ kind: "refused" });
    });

    key.give("sk-right");
    await expect(models.offered()).resolves.toEqual({ models: ["gpt-5.4", "gpt-5.4-nano"], named: false });
    expect(keys).toEqual(["Bearer sk-wrong", "Bearer sk-wrong", "Bearer sk-right"]);
    expect(key.current()).toEqual({ kind: "given", key: "sk-right" });
  });

  test("ask for no list again where the visitor gives the key that they asked with", async () => {
    const { fetch, asked } = answering(listed);
    const { models, key } = opened(visited, fetch);
    key.give("sk-visitor");
    await models.offered();

    key.give("sk-visitor");
    await models.offered();

    expect(asked()).toBe(1);
  });

  test("tell the key that the base URL took it, once a list comes for it", async () => {
    const { fetch } = answering(missing, listed);
    const key = createVisitorKey();
    key.give("sk-visitor");
    key.lost("sk-visitor");
    const { models, raised } = opened(visited, fetch, key);
    await vi.waitFor(() => {
      expect(raised("assistant_models_failed")).toHaveLength(1);
    });
    expect(key.current()).toEqual({ kind: "lost", key: "sk-visitor" });

    await models.offered();

    expect(key.current()).toEqual({ kind: "given", key: "sk-visitor" });
  });

  test("say nothing of a list for a key that the visitor replaced while the request ran", async () => {
    let answer: (response: Response) => void = () => undefined;
    const keys: (string | null)[] = [];
    const fetch: Fetch = (_url, init) => {
      keys.push(new Headers(init.headers).get("authorization"));
      return keys.length === 1
        ? new Promise((resolve) => {
            answer = resolve;
          })
        : Promise.resolve(listed());
    };
    const { models, raised, key } = opened(visited, fetch);
    key.give("sk-first");
    await vi.waitFor(() => {
      expect(keys).toHaveLength(1);
    });

    key.give("sk-second");
    answer(refused());

    await expect(models.offered()).resolves.toEqual({ models: ["gpt-5.4", "gpt-5.4-nano"], named: false });
    expect(keys).toEqual(["Bearer sk-first", "Bearer sk-second"]);
    expect(key.current()).toEqual({ kind: "given", key: "sk-second" });
    expect(raised("assistant_call_failed")).toEqual([]);
  });

  test("have the chat read the list for the visitor's newest key, which an answer for a key that the visitor replaced leaves as it is", async () => {
    let answer: (response: Response) => void = () => undefined;
    let asked = 0;
    const fetch: Fetch = () => {
      asked += 1;
      return asked === 1
        ? new Promise((resolve) => {
            answer = resolve;
          })
        : Promise.resolve(listed());
    };
    const { models, key } = opened(visited, fetch);
    key.give("sk-first");
    await vi.waitFor(() => {
      expect(asked).toBe(1);
    });

    key.give("sk-second");
    await vi.waitFor(() => {
      expect(models.current()).toEqual({ models: ["gpt-5.4", "gpt-5.4-nano"], named: false });
    });
    answer(refused());
    // Lets the request for the replaced key run to its end.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(models.current()).toEqual({ models: ["gpt-5.4", "gpt-5.4-nano"], named: false });
  });

  test("check a key against the base URL's list, which changes neither the key nor the models offered, and raises nothing", async () => {
    const { fetch, keys } = recording(refused, listed, missing);
    const { models, raised, key } = opened(proxy({ credential: { kind: "visitor" }, models: ["gpt-5.4"] }), fetch);
    key.give("sk-visitor");

    await expect(models.check("sk-visitor")).resolves.toEqual({ kind: "refused", message: why });
    await expect(models.check("sk-visitor")).resolves.toMatchObject({ kind: "listed", models: ["gpt-5.4", "gpt-5.4-nano"] });
    await expect(models.check("sk-visitor")).resolves.toMatchObject({ kind: "failed" });

    expect(keys).toEqual(["Bearer sk-visitor", "Bearer sk-visitor", "Bearer sk-visitor"]);
    expect(key.current()).toEqual({ kind: "given", key: "sk-visitor" });
    await expect(models.offered()).resolves.toEqual({ models: ["gpt-5.4"], named: true });
    expect([...raised("assistant_call_failed"), ...raised("assistant_models_failed")]).toEqual([]);
  });
});
