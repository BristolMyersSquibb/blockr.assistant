// Reading the deployment's six blockr options (./deployment.ts): what each
// gives where it is unset, the values that each takes, as R sends an R option
// or an environment variable, and the values that fail the read.

import type { Json } from "@blockr/core";
import { describe, expect, test } from "vitest";
import { readDeployment } from "./deployment.ts";

// What the deployment's blockr options say, where R holds the values given.
function read(values: Readonly<Record<string, Json>>) {
  return readDeployment({ blockrOption: (name) => Promise.resolve(values[name]) });
}

describe("the deployment's blockr options", () => {
  test("send the calls to OpenAI's Responses API where they are unset, with the visitor's key and the base URL's list of models", async () => {
    await expect(read({})).resolves.toEqual({
      baseUrl: "https://api.openai.com/v1",
      api: "openai-responses",
      credential: { kind: "visitor" },
      models: undefined,
    });
  });

  test("give the base URL without a slash at its end, the API by pi's name and the deployment's key", async () => {
    await expect(
      read({ assistant_base_url: " https://openrouter.ai/api/v1/ ", assistant_api: "openai-completions", assistant_api_key: "sk-or-v1-test" }),
    ).resolves.toMatchObject({ baseUrl: "https://openrouter.ai/api/v1", api: "openai-completions", credential: { kind: "deployment", key: "sk-or-v1-test" } });

    await expect(read({ assistant_base_url: "https://api.anthropic.com", assistant_api: "anthropic-messages" })).resolves.toMatchObject({
      baseUrl: "https://api.anthropic.com",
      api: "anthropic-messages",
    });
  });

  test("give no key where the key is none", async () => {
    await expect(read({ assistant_base_url: "http://proxy.corp.invalid:8080/v1", assistant_api_key: "none" })).resolves.toMatchObject({
      baseUrl: "http://proxy.corp.invalid:8080/v1",
      credential: { kind: "none" },
    });
  });

  test("split a string of models at its commas, and take an array as it is, each without the models that it names twice", async () => {
    await expect(read({ assistant_models: "gpt-5.4, gpt-5.4-nano,,gpt-5.4" })).resolves.toMatchObject({ models: ["gpt-5.4", "gpt-5.4-nano"] });
    await expect(read({ assistant_models: "gpt-5.4" })).resolves.toMatchObject({ models: ["gpt-5.4"] });
    await expect(read({ assistant_models: ["claude-sonnet-5-5", "claude-haiku-5-5"] })).resolves.toMatchObject({
      models: ["claude-sonnet-5-5", "claude-haiku-5-5"],
    });
  });

  test("fail the read where an option holds a value that it does not take, naming the option and the value", async () => {
    await expect(read({ assistant_base_url: "api.openai.com/v1" })).rejects.toThrow(
      'The blockr option assistant_base_url is "api.openai.com/v1", where it takes the URL that the assistant\'s calls go to, such as "https://api.openai.com/v1".',
    );
    await expect(read({ assistant_base_url: "file:///etc/llm" })).rejects.toThrow("The blockr option assistant_base_url is");
    await expect(read({ assistant_api: "openai" })).rejects.toThrow(
      'The blockr option assistant_api is "openai", where it takes the API that the base URL speaks: "openai-responses", "openai-completions" or "anthropic-messages".',
    );
    await expect(read({ assistant_models: ",," })).rejects.toThrow('The blockr option assistant_models is ",,", where it takes the ids of the models offered');
    await expect(read({ assistant_models: [1, 2] })).rejects.toThrow("The blockr option assistant_models is [1,2]");
  });

  test("fail the read of a key that is no string without naming its value", async () => {
    await expect(read({ assistant_api_key: ["sk-one", "sk-two"] })).rejects.toThrow(
      'The blockr option assistant_api_key holds an array, where it takes the deployment\'s key as a string, or "none" for a base URL that needs no key.',
    );
    await expect(read({ assistant_api_key: " " })).rejects.toThrow("The blockr option assistant_api_key holds an empty string");
  });

  test("give the visitor's key the secret with which the browser keeps it, for the app alone, where the deployment sets one", async () => {
    await expect(read({ assistant_key_secret: " a-long-random-secret " })).resolves.toMatchObject({
      credential: { kind: "visitor", kept: { secret: "a-long-random-secret", scope: "app" } },
    });
  });

  test("have the browser keep the key for the apps of the origin where the deployment names that scope", async () => {
    await expect(read({ assistant_key_secret: "a-long-random-secret", assistant_key_scope: " origin " })).resolves.toMatchObject({
      credential: { kind: "visitor", kept: { secret: "a-long-random-secret", scope: "origin" } },
    });
    const unkept = await read({ assistant_key_scope: "origin" });
    expect(unkept.credential).toEqual({ kind: "visitor" });
  });

  test("leave the secret out where the deployment sets a key or none, since the calls then carry no key of the visitor's", async () => {
    const keyed = await read({ assistant_api_key: "sk-deployment", assistant_key_secret: "a-long-random-secret" });
    expect(keyed.credential).toEqual({ kind: "deployment", key: "sk-deployment" });
    const keyless = await read({ assistant_api_key: "none", assistant_key_secret: "a-long-random-secret" });
    expect(keyless.credential).toEqual({ kind: "none" });
  });

  test("fail the read of a secret that is no string without naming its value, even where the deployment sets a key", async () => {
    await expect(read({ assistant_key_secret: 42 })).rejects.toThrow(
      "The blockr option assistant_key_secret holds a number, where it takes the secret with which the browser keeps a visitor's key, as a string.",
    );
    await expect(read({ assistant_api_key: "sk-deployment", assistant_key_secret: " " })).rejects.toThrow(
      "The blockr option assistant_key_secret holds an empty string",
    );
  });

  test("fail the read of a scope that it does not take, naming the value, even where the deployment sets no secret", async () => {
    await expect(read({ assistant_key_scope: "site" })).rejects.toThrow(
      'The blockr option assistant_key_scope is "site", where it takes for whom the browser keeps a visitor\'s key: "app", for the app alone, or "origin", for every app of the origin that keeps the key with the same secret.',
    );
    await expect(read({ assistant_api_key: "sk-deployment", assistant_key_scope: true })).rejects.toThrow("The blockr option assistant_key_scope is true");
  });
});
