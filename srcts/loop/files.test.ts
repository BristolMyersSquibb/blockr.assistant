// The PDFs that a call carries, in the request that pi writes for each of the
// three APIs (./files.ts). Each request holds what pi writes for a user
// message with a line of text, a PDF that the loop handed pi as an image, and
// an image.

import { describe, expect, test } from "vitest";
import { withFiles } from "./files.ts";

const PDF = "JVBERi0xLjQK";
const PNG = "iVBORw0KGgo=";

describe("a PDF in the request that pi writes", () => {
  test("goes as a document on Anthropic's Messages API, titled with its name, keeping pi's cache mark", () => {
    const payload = {
      model: "claude-haiku-5-5",
      messages: [
        { role: "user", content: [{ type: "text", text: "Read this." }, { type: "image", source: { type: "base64", media_type: "application/pdf", data: PDF } }] },
        { role: "assistant", content: [{ type: "text", text: "Done." }] },
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } },
            { type: "image", source: { type: "base64", media_type: "application/pdf", data: PDF }, cache_control: { type: "ephemeral" } },
          ],
        },
      ],
    };

    expect(withFiles("anthropic-messages", payload, ["report.pdf", "annex.pdf"])).toEqual({
      model: "claude-haiku-5-5",
      messages: [
        { role: "user", content: [{ type: "text", text: "Read this." }, { type: "document", source: { type: "base64", media_type: "application/pdf", data: PDF }, title: "report.pdf" }] },
        { role: "assistant", content: [{ type: "text", text: "Done." }] },
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } },
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: PDF }, title: "annex.pdf", cache_control: { type: "ephemeral" } },
          ],
        },
      ],
    });
  });

  test("goes as an input_file on OpenAI's Responses API, with its name and its data URL", () => {
    const payload = {
      model: "gpt-5.4",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "Read this." },
            { type: "input_image", detail: "auto", image_url: `data:application/pdf;base64,${PDF}` },
            { type: "input_image", detail: "auto", image_url: `data:image/png;base64,${PNG}` },
          ],
        },
        { type: "function_call", call_id: "c1", name: "list_blocks", arguments: "{}" },
      ],
    };

    expect(withFiles("openai-responses", payload, ["report.pdf"])).toEqual({
      model: "gpt-5.4",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "Read this." },
            { type: "input_file", filename: "report.pdf", file_data: `data:application/pdf;base64,${PDF}` },
            { type: "input_image", detail: "auto", image_url: `data:image/png;base64,${PNG}` },
          ],
        },
        { type: "function_call", call_id: "c1", name: "list_blocks", arguments: "{}" },
      ],
    });
  });

  test("goes as a file on Chat Completions, with its name and its data URL", () => {
    const payload = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Be brief." },
        {
          role: "user",
          content: [
            { type: "text", text: "Read this." },
            { type: "image_url", image_url: { url: `data:application/pdf;base64,${PDF}` } },
          ],
        },
      ],
    };

    expect(withFiles("openai-completions", payload, ["report.pdf"])).toEqual({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Be brief." },
        {
          role: "user",
          content: [
            { type: "text", text: "Read this." },
            { type: "file", file: { filename: "report.pdf", file_data: `data:application/pdf;base64,${PDF}` } },
          ],
        },
      ],
    });
  });

  test("takes a name of its own where the loop noted fewer names than the request holds PDFs", () => {
    const payload = { input: [{ role: "user", content: [{ type: "input_image", image_url: `data:application/pdf;base64,${PDF}` }] }] };

    expect(withFiles("openai-responses", payload, [])).toEqual({
      input: [{ role: "user", content: [{ type: "input_file", filename: "document.pdf", file_data: `data:application/pdf;base64,${PDF}` }] }],
    });
  });
});

describe("a request that holds no PDF", () => {
  test("stays as it is, which the loop says with undefined", () => {
    const image = { role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: PNG } }] };

    expect(withFiles("anthropic-messages", { messages: [image] }, ["report.pdf"])).toBeUndefined();
    expect(withFiles("openai-responses", { input: [{ role: "user", content: "Hi." }] }, [])).toBeUndefined();
    expect(withFiles("faux", { messages: [] }, ["report.pdf"])).toBeUndefined();
    expect(withFiles("openai-completions", "not a request", ["report.pdf"])).toBeUndefined();
  });
});
