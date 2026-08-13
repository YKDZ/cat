import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { SPACY_PROTOCOL_LIMITS } from "../@cat-plugin/spacy-language-analyzer/src/protocol-limits.ts";
import { serializeAnalyzeRequest } from "../@cat-plugin/spacy-language-analyzer/src/protocol-limits.ts";

const pythonNames = {
  maxBatchItems: "MAX_BATCH_ITEMS",
  maxBatchTextUtf8Bytes: "MAX_BATCH_TEXT_UTF8_BYTES",
  maxIdUtf8Bytes: "MAX_ID_UTF8_BYTES",
  maxParentRequestFrameBytes: "MAX_PARENT_REQUEST_FRAME_BYTES",
  maxTextUtf8Bytes: "MAX_TEXT_UTF8_BYTES",
  maxTimeoutMs: "MAX_TIMEOUT_MS",
  maxWorkerResponseFrameBytes: "MAX_WORKER_RESPONSE_FRAME_BYTES",
} as const;

const readPythonLimits = (): Record<string, number> => {
  const source = readFileSync(
    resolve(import.meta.dirname, "../apps/spacy-server/src/protocol_limits.py"),
    "utf8",
  );
  return Object.fromEntries(
    Object.entries(pythonNames).map(([key, name]) => {
      const match = new RegExp(`^${name} = ([0-9_ *]+)$`, "mu").exec(source);
      if (match?.[1] === undefined)
        throw new Error(`Missing Python protocol limit ${name}`);
      const value = match[1]
        .split("*")
        .map((part) => Number(part.trim().replaceAll("_", "")))
        .reduce((product, factor) => product * factor, 1);
      return [key, value];
    }),
  );
};

describe("spaCy protocol limits", () => {
  it("keeps the Python server and TypeScript plugin byte limits aligned", () => {
    expect(readPythonLimits()).toEqual(SPACY_PROTOCOL_LIMITS);
  });

  it("keeps compact CJK and emoji JSON unescaped on both protocol peers", () => {
    const python = readFileSync(
      resolve(import.meta.dirname, "../apps/spacy-server/src/generations.py"),
      "utf8",
    );
    expect(python).toContain("ensure_ascii=False");
    expect(
      serializeAnalyzeRequest({
        text: "中文😀",
        languageId: "zh-Hans",
        timeoutMs: 1,
      }),
    ).toBe('{"text":"中文😀","languageId":"zh-Hans","timeoutMs":1}');
  });
});
