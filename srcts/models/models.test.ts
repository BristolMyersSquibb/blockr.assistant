// The models that the assistant offers on the open board (./models.ts): those
// that the deployment names, those of the base URL's list, when the assistant
// asks for the list again, and which error each failed list raises.

import type { Raised } from "@blockr/core";
import { describe, expect, test, vi } from "vitest";
import type { Deployment } from "../deployment/index.ts";
import { heldError } from "../notifications/index.ts";
import type { Fetch } from "./list.ts";
import { createModels } from "./models.ts";

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

function proxy(given: Partial<Deployment> = {}): Deployment {
  return { baseUrl: "https://proxy.invalid/v1", api: "openai-completions", credential: { kind: "deployment", key: "test-key" }, models: undefined, ...given };
}

// The models of the board, on the deployment and the fetch given.
function opened(deployment: Deployment | Promise<Deployment>, fetch: Fetch) {
  const { core, raised } = holding();
  const controller = new AbortController();
  const callFailed = heldError(core, controller.signal, "assistant_call_failed");
  const models = createModels(core, controller.signal, { deployment: Promise.resolve(deployment), callFailed, fetch });
  return { models, raised, controller };
}

const listed = () => Response.json({ data: [{ id: "gpt-5.4" }, { id: "gpt-5.4-nano" }] });
const missing = () => new Response("Not Found", { status: 404 });

describe("the models that the assistant offers", () => {
  test("are those that the deployment names, for which it asks for no list", async () => {
    const { fetch, asked } = answering(listed);
    const { models } = opened(proxy({ models: ["company-gpt", "company-claude"] }), fetch);

    await expect(models.offered()).resolves.toEqual({ models: ["company-gpt", "company-claude"] });
    expect(asked()).toBe(0);
  });

  test("are those of the base URL's list, for which it asks once as the board opens", async () => {
    const { fetch, asked } = answering(listed);
    const { models, raised } = opened(proxy(), fetch);

    await expect(models.offered()).resolves.toEqual({ models: ["gpt-5.4", "gpt-5.4-nano"] });
    await expect(models.offered()).resolves.toEqual({ models: ["gpt-5.4", "gpt-5.4-nano"] });
    expect(asked()).toBe(1);
    expect(raised("assistant_models_failed")).toEqual([]);
  });

  test("are none where the visitor authenticates, for whom it asks for no list", async () => {
    const { fetch, asked } = answering(listed);
    const { models } = opened(proxy({ credential: { kind: "visitor" } }), fetch);

    await expect(models.offered()).resolves.toEqual({ models: [] });
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

    await expect(models.offered()).resolves.toEqual({ models: ["gpt-5.4", "gpt-5.4-nano"] });
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
    expect(offered).toEqual({ models: [], failure: why });
    expect(raised("assistant_call_failed")).toEqual([why]);
    expect(raised("assistant_models_failed")).toEqual([]);
  });

  test("are none, and raise nothing, where the deployment's blockr options cannot be read", async () => {
    const { fetch, asked } = answering(listed);
    const wrong = Promise.reject(new TypeError("The blockr option assistant_api is 1."));
    wrong.catch(() => undefined);
    const { models, raised } = opened(wrong, fetch);

    await expect(models.offered()).resolves.toEqual({ models: [] });
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

    await expect(offered).resolves.toEqual({ models: [] });
    expect(raised("assistant_models_failed")).toEqual([]);
  });
});
