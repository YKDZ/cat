import { createServer } from "node:http";

import { PluginServiceUnavailableError } from "@cat/plugin-core";
import { normalizeLanguageId } from "@cat/shared";
import { afterEach, describe, expect, test } from "vitest";

import { SpacyLanguageAnalyzer } from "./language-analyzer.ts";
import { SPACY_PROTOCOL_LIMITS } from "./protocol-limits.ts";
import {
  serializeAnalyzeRequest,
  serializeBatchAnalyzeRequest,
} from "./protocol-limits.ts";

const runtimeAttestation = {
  contract: "cat.language-analysis/v1",
  languageId: "en",
  generation: {
    id: `sha256:${"b".repeat(64)}`,
    planDigest: "c".repeat(64),
    schemaVersion: "1",
    provisionerVersion: "1",
    serverProtocolVersion: "1",
    pythonAbi: "cpython-312",
    pythonImplementation: "cpython",
    pythonVersion: "3.12.11",
    platform: "linux-x86_64",
    spacyVersion: "3.8.7",
    sitePackagesDigest: "d".repeat(64),
  },
  semanticConfig: { disabledPipes: ["ner", "parser"] },
  engine: { name: "spaCy", version: "3.8.0" },
  pipeline: { id: "sentencizer", version: "1" },
  model: { id: "en_core_web_sm", version: "3.8.0" },
  assets: [
    { id: "en_core_web_sm-3.8.0", version: "3.8.0", sha256: "a".repeat(64) },
  ],
};

const analysis = (text: string) => ({
  sentences: [{ text, start: 0, end: text.length, tokens: [] }],
  tokens: [],
  runtimeAttestation,
});

const createAnalyzer = (
  serverUrl: string,
  config: { timeout?: number; languageIds?: string[] } = {},
) =>
  new SpacyLanguageAnalyzer(
    {
      serverUrl,
      languageIds: config.languageIds ?? ["en"],
      ...(config.timeout === undefined ? {} : { timeout: config.timeout }),
    },
    { scopeType: "GLOBAL", scopeId: "" },
    { name: "@cat-plugin/spacy-language-analyzer", version: "0.1.0" },
  );

describe("SpacyLanguageAnalyzer", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  test("sorts canonical configured languages for stable semantic identity", () => {
    const analyzer = createAnalyzer("http://127.0.0.1:1", {
      languageIds: ["zh-hant-tw", "en-us"],
    });

    expect(analyzer.getLanguageAnalysisConfigurationAssessment()).toEqual({
      status: "VALID",
      supportedLanguages: ["en-US", "zh-Hant-TW"],
      semanticConfiguration: { languageIds: ["en-US", "zh-Hant-TW"] },
    });
  });

  test("returns analysis and a runtime attestation from the executing server", async () => {
    const server = createServer((request, response) => {
      response.setHeader("content-type", "application/json");
      if (request.url === "/capabilities")
        return void response.end(
          JSON.stringify({
            generation: runtimeAttestation.generation,
            engine: runtimeAttestation.engine,
            languages: [{ languageId: "en" }],
          }),
        );
      if (request.url === "/analyze")
        return void response.end(JSON.stringify(analysis("Hello")));
      if (request.url === "/batch-analyze") {
        return void response.end(
          JSON.stringify({
            runtimeAttestation,
            results: [{ id: "a", result: analysis("Hello") }],
          }),
        );
      }
      response.statusCode = 404;
      response.end();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No test server address");
    close = async () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    const analyzer = createAnalyzer(`http://127.0.0.1:${address.port}`);

    expect(analyzer.getLanguageAnalysisConfigurationAssessment()).toMatchObject(
      { status: "VALID", supportedLanguages: ["en"] },
    );
    await expect(
      analyzer.analyze({
        text: "Hello",
        languageId: normalizeLanguageId("en"),
      }),
    ).resolves.toMatchObject({
      attestation: {
        languageId: "en",
        implementation: { packageVersion: "0.1.0" },
        semanticConfig: runtimeAttestation.semanticConfig,
      },
    });
    await expect(
      analyzer.batchAnalyze({
        items: [{ id: "a", text: "Hello" }],
        languageId: normalizeLanguageId("en"),
      }),
    ).resolves.toMatchObject({
      attestation: { model: { id: "en_core_web_sm" } },
      results: [
        { id: "a", result: { attestation: { engine: { name: "spaCy" } } } },
      ],
    });
    const analyzerWithUnrelatedLanguage = createAnalyzer(
      `http://127.0.0.1:${address.port}`,
      { languageIds: ["en", "de"] },
    );
    const resultWithUnrelatedLanguage =
      await analyzerWithUnrelatedLanguage.analyze({
        text: "Hello",
        languageId: normalizeLanguageId("en"),
      });
    expect(resultWithUnrelatedLanguage.attestation.semanticConfig).toEqual(
      runtimeAttestation.semanticConfig,
    );
  });

  test("writes the effective timeout into single and batch requests", async () => {
    const bodies: unknown[] = [];
    const server = createServer((request, response) => {
      void collectRequestBody(request).then((body) => {
        bodies.push(JSON.parse(body));
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify(
            request.url === "/analyze"
              ? analysis("Hello")
              : {
                  runtimeAttestation,
                  results: [{ id: "a", result: analysis("Hello") }],
                },
          ),
        );
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No test server address");
    close = async () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    const analyzer = createAnalyzer(`http://127.0.0.1:${address.port}`, {
      timeout: 321,
    });

    await analyzer.analyze({
      text: "Hello",
      languageId: normalizeLanguageId("en"),
    });
    await analyzer.batchAnalyze({
      items: [{ id: "a", text: "Hello" }],
      languageId: normalizeLanguageId("en"),
      timeoutMs: 123,
    });

    expect(bodies).toMatchObject([{ timeoutMs: 321 }, { timeoutMs: 123 }]);
  });

  test("rejects oversized or malformed requests before network dispatch", async () => {
    let requests = 0;
    const server = createServer((_request, response) => {
      requests += 1;
      response.end();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No test server address");
    close = async () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    const analyzer = createAnalyzer(`http://127.0.0.1:${address.port}`);

    await expect(
      analyzer.analyze({
        text: "é".repeat(SPACY_PROTOCOL_LIMITS.maxTextUtf8Bytes / 2 + 1),
        languageId: normalizeLanguageId("en"),
      }),
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      analyzer.analyze({
        text: "\ud800",
        languageId: normalizeLanguageId("en"),
      }),
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      analyzer.batchAnalyze({
        items: Array.from(
          { length: SPACY_PROTOCOL_LIMITS.maxBatchItems + 1 },
          (_, index) => ({ id: String(index), text: "x" }),
        ),
        languageId: normalizeLanguageId("en"),
      }),
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      analyzer.analyze({
        text: "x",
        languageId: normalizeLanguageId("en"),
        timeoutMs: SPACY_PROTOCOL_LIMITS.maxTimeoutMs + 1,
      }),
    ).rejects.toBeInstanceOf(RangeError);
    expect(requests).toBe(0);
  });

  test("serializes CJK and emoji as compact UTF-8 at byte boundaries", () => {
    expect(
      serializeAnalyzeRequest({
        text: "中文😀",
        languageId: "zh-Hans",
        timeoutMs: 1,
      }),
    ).toBe('{"text":"中文😀","languageId":"zh-Hans","timeoutMs":1}');
    expect(() =>
      serializeBatchAnalyzeRequest({
        items: [
          {
            id: "emoji",
            text: "😀".repeat(SPACY_PROTOCOL_LIMITS.maxTextUtf8Bytes / 4 + 1),
          },
        ],
        languageId: "en",
        timeoutMs: 1,
      }),
    ).toThrow("UTF-8 byte limit");
  });

  test("propagates in-flight caller aborts for single and batch requests", async () => {
    const requests: string[] = [];
    const server = createServer((request, response) => {
      requests.push(request.url ?? "");
      request.once("aborted", () => response.destroy());
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No test server address");
    close = async () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    const analyzer = createAnalyzer(`http://127.0.0.1:${address.port}`);
    const single = new AbortController();
    const singleRequest = analyzer.analyze({
      text: "Hello",
      languageId: normalizeLanguageId("en"),
      signal: single.signal,
    });
    await waitFor(() => requests.includes("/analyze"));
    single.abort(new DOMException("Cancelled", "AbortError"));
    await expect(singleRequest).rejects.toThrow("Cancelled");

    const batch = new AbortController();
    const batchRequest = analyzer.batchAnalyze({
      items: [{ id: "a", text: "Hello" }],
      languageId: normalizeLanguageId("en"),
      signal: batch.signal,
    });
    await waitFor(() => requests.includes("/batch-analyze"));
    batch.abort(new DOMException("Cancelled", "AbortError"));
    await expect(batchRequest).rejects.toThrow("Cancelled");
  });

  test("distinguishes server timeout from unavailable and malformed responses", async () => {
    const server = createServer((request, response) => {
      response.statusCode = request.url === "/analyze" ? 504 : 503;
      response.setHeader("content-type", "application/json");
      response.end("not analysis json");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No test server address");
    close = async () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    const analyzer = createAnalyzer(`http://127.0.0.1:${address.port}`);

    await expect(
      analyzer.analyze({
        text: "Hello",
        languageId: normalizeLanguageId("en"),
      }),
    ).rejects.toMatchObject({ name: "TimeoutError" });
    await expect(
      analyzer.batchAnalyze({
        items: [{ id: "a", text: "Hello" }],
        languageId: normalizeLanguageId("en"),
      }),
    ).rejects.toBeInstanceOf(PluginServiceUnavailableError);
  });

  test("maps malformed single responses and batch attestations to typed validation errors", async () => {
    const server = createServer((request, response) => {
      response.setHeader("content-type", "application/json");
      if (request.url === "/analyze") {
        return void response.end(
          JSON.stringify({
            ...analysis("Hello"),
            tokens: [{ text: "Hello" }],
          }),
        );
      }
      return void response.end(
        JSON.stringify({
          runtimeAttestation: {
            ...runtimeAttestation,
            languageId: "de",
          },
          results: [{ id: "a", result: analysis("Hello") }],
        }),
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("No test server address");
    }
    close = async () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    const analyzer = createAnalyzer(`http://127.0.0.1:${address.port}`);

    await expect(
      analyzer.analyze({
        text: "Hello",
        languageId: normalizeLanguageId("en"),
      }),
    ).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    await expect(
      analyzer.batchAnalyze({
        items: [{ id: "a", text: "Hello" }],
        languageId: normalizeLanguageId("en"),
      }),
    ).rejects.toMatchObject({
      code: "INVALID_ATTESTATION",
    });
  });

  test("rejects unmapped languages and caller cancellation", async () => {
    const analyzer = createAnalyzer("http://127.0.0.1:1");
    await expect(
      analyzer.analyze({
        text: "Hello",
        languageId: normalizeLanguageId("zh-Hans"),
      }),
    ).rejects.toBeInstanceOf(PluginServiceUnavailableError);
    const controller = new AbortController();
    controller.abort(new DOMException("Cancelled", "AbortError"));
    await expect(
      analyzer.analyze({
        text: "Hello",
        languageId: normalizeLanguageId("en"),
        signal: controller.signal,
      }),
    ).rejects.toThrow("Cancelled");
  });

  test("canonicalizes language mapping keys once and rejects collisions", async () => {
    const analyzer = new SpacyLanguageAnalyzer(
      {
        serverUrl: "http://127.0.0.1:1",
        languageIds: ["en-us"],
      },
      { scopeType: "GLOBAL", scopeId: "" },
      { name: "@cat-plugin/spacy-language-analyzer", version: "0.1.0" },
    );
    await expect(
      analyzer.analyze({
        text: "Hello",
        languageId: normalizeLanguageId("en-US"),
      }),
    ).rejects.toBeInstanceOf(PluginServiceUnavailableError);
    expect(
      () =>
        new SpacyLanguageAnalyzer(
          {
            serverUrl: "http://127.0.0.1:1",
            languageIds: ["en-US", "en-us"],
          },
          { scopeType: "GLOBAL", scopeId: "" },
          { name: "@cat-plugin/spacy-language-analyzer", version: "0.1.0" },
        ),
    ).toThrow("collides");
    expect(
      () =>
        new SpacyLanguageAnalyzer(
          {
            serverUrl: "http://127.0.0.1:1",
            languageIds: [" "],
          },
          { scopeType: "GLOBAL", scopeId: "" },
          { name: "@cat-plugin/spacy-language-analyzer", version: "0.1.0" },
        ),
    ).toThrow("whitespace");
  });
});

const waitFor = async (predicate: () => boolean): Promise<void> => {
  while (!predicate()) await new Promise((resolve) => setTimeout(resolve, 1));
};

const collectRequestBody = async (
  request: AsyncIterable<Uint8Array>,
): Promise<string> => {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
};
