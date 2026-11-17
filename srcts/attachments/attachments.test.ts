// The files that the chat's message field takes, and how it reads them
// (./attachments.ts, ./read.ts).

import { describe, expect, test } from "vitest";
import { ACCEPT, attachedFile, copiedFile, encodedFile, kindOf, MAX_BYTES, mediaTypeOf, namesOf, pastedFile, PASTED_TEXT, scaledSize, sizeOf } from "./index.ts";

describe("the files that the message field takes", () => {
  test("are images in PNG, JPEG, GIF and WebP, PDFs and text files, each of the media type that the browser gives an image or a PDF", () => {
    expect(mediaTypeOf({ name: "plot.png", type: "image/png" })).toBe("image/png");
    expect(mediaTypeOf({ name: "photo", type: "image/jpeg" })).toBe("image/jpeg");
    expect(mediaTypeOf({ name: "report.pdf", type: "application/pdf" })).toBe("application/pdf");
    expect(kindOf("image/webp")).toBe("image");
    expect(kindOf("application/pdf")).toBe("pdf");
    expect(kindOf("text/csv")).toBe("text");
  });

  test("give a text file the media type that its extension names, whatever the browser says", () => {
    expect(mediaTypeOf({ name: "sales.CSV", type: "" })).toBe("text/csv");
    expect(mediaTypeOf({ name: "analysis.R", type: "text/plain" })).toBe("text/x-r");
    expect(mediaTypeOf({ name: "notes.qmd", type: "application/octet-stream" })).toBe("text/markdown");
    expect(mediaTypeOf({ name: "data.json", type: "application/json" })).toBe("application/json");
  });

  test("give a file without an extension a text type that the browser gives it, as the file of a long paste", () => {
    expect(mediaTypeOf({ name: PASTED_TEXT, type: "text/plain" })).toBe("text/plain");
    expect(mediaTypeOf({ name: "README", type: "" })).toBeUndefined();
  });

  test("take no other file", () => {
    expect(mediaTypeOf({ name: "archive.zip", type: "application/zip" })).toBeUndefined();
    expect(mediaTypeOf({ name: "photo.heic", type: "image/heic" })).toBeUndefined();
    expect(mediaTypeOf({ name: "sheet.xlsx", type: "" })).toBeUndefined();
    expect(kindOf("application/zip")).toBeUndefined();
  });

  test("are what the file input accepts, by media type and by the extensions of text files", () => {
    const accepted = ACCEPT.split(",");
    expect(accepted).toEqual(expect.arrayContaining(["image/png", "image/webp", "application/pdf", "text/csv", ".csv", ".r", ".ipynb", ".log"]));
    expect(new Set(accepted).size).toBe(accepted.length);
  });

  test("are named in quotes, as a list in prose", () => {
    expect(namesOf(["a.png"])).toBe('"a.png"');
    expect(namesOf(["a.png", "b.pdf"])).toBe('"a.png" and "b.pdf"');
    expect(namesOf(["a.png", "b.pdf", "c.csv"])).toBe('"a.png", "b.pdf" and "c.csv"');
  });

  test("take up to 30 MiB together", () => {
    expect(MAX_BYTES).toBe(30 * 1024 * 1024);
    expect(sizeOf(MAX_BYTES)).toBe("30 MB");
    expect(sizeOf(2048)).toBe("2 KB");
    expect(sizeOf(12)).toBe("12 B");
  });
});

describe("an image that the message field attaches", () => {
  test("is scaled down to 1568 pixels on its longer side, keeping its proportions, where it is larger", () => {
    expect(scaledSize(4000, 3000)).toEqual({ width: 1568, height: 1176 });
    expect(scaledSize(1000, 5000)).toEqual({ width: 314, height: 1568 });
    expect(scaledSize(1568, 1200)).toBeUndefined();
  });

  test("stays as it is where the browser cannot read it, as on happy-dom", async () => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], "plot.png", { type: "image/png" });
    await expect(attachedFile(file, "image/png")).resolves.toBe(file);
  });

  test("takes the media type given, where the browser gave another", async () => {
    const attached = await attachedFile(new File(["a,b\n1,2\n"], "sales.csv", { type: "" }), "text/csv");
    expect(attached.type).toBe("text/csv");
    expect(attached.name).toBe("sales.csv");
  });
});

describe("a file that the user sends", () => {
  test("is copied, with its name, its media type and its bytes", async () => {
    const file = new File([new Uint8Array([0, 1, 2, 255])], "plot.png", { type: "image/png" });

    const copy = await copiedFile(file);

    expect(copy).not.toBe(file);
    expect([copy.name, copy.type, copy.size]).toEqual(["plot.png", "image/png", 4]);
    expect([...new Uint8Array(await copy.arrayBuffer())]).toEqual([0, 1, 2, 255]);
  });

  test("goes to a call as a text file's text, and as the bytes of any other file as base64", async () => {
    await expect(encodedFile(new Blob(["a,b\n1,2\n"]), "text/csv")).resolves.toEqual({ text: "a,b\n1,2\n" });
    await expect(encodedFile(new Blob([new Uint8Array([0, 1, 2, 255])]), "image/png")).resolves.toEqual({ data: "AAEC/w==" });
  });

  test("is a text file named \"Pasted Text\" where a long paste makes it", async () => {
    const pasted = pastedFile("x".repeat(1200));
    expect(pasted.name).toBe(PASTED_TEXT);
    expect(mediaTypeOf(pasted)).toBe("text/plain");
    await expect(encodedFile(pasted, "text/plain")).resolves.toEqual({ text: "x".repeat(1200) });
  });
});
