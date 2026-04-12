import type { IncomingMessage, ServerResponse } from "node:http";

import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import * as z from "zod";

import { SpacyWordSegmenter } from "./segmenter";

const buildSegmentPayload = (text: string) => ({
  sentences: [
    {
      text,
      start: 0,
      end: text.length,
      tokens: [
        {
          text,
          lemma: text.toLowerCase(),
          pos: "NOUN",
          start: 0,
          end: text.length,
          is_stop: false,
          is_punct: false,
        },
      ],
    },
  ],
  tokens: [
    {
      text,
      lemma: text.toLowerCase(),
      pos: "NOUN",
      start: 0,
      end: text.length,
      is_stop: false,
      is_punct: false,
    },
  ],
});

const readBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk);
      continue;
    }
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
      continue;
    }
    if (chunk instanceof Uint8Array) {
      chunks.push(Buffer.from(chunk));
      continue;
    }
    throw new TypeError("Unexpected request chunk type");
  }
  return Buffer.concat(chunks).toString("utf8");
};

const parseSegmentRequest = async (req: IncomingMessage) => {
  return z
    .object({ text: z.string().optional().default("") })
    .parse(JSON.parse(await readBody(req)));
};

const parseBatchSegmentRequest = async (req: IncomingMessage) => {
  return z
    .object({
      items: z
        .array(
          z.object({
            id: z.string().optional().default(""),
            text: z.string().optional().default(""),
          }),
        )
        .default([]),
    })
    .parse(JSON.parse(await readBody(req)));
};

describe("SpacyWordSegmenter", () => {
  let serverUrl = "";
  let closeServer: (() => Promise<void>) | undefined;

  const startServer = async (
    handler: (req: IncomingMessage, res: ServerResponse) => void,
  ): Promise<string> => {
    const server = createServer(handler);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to bind mock spaCy server");
    }
    closeServer = async () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        }),
      );
    return `http://127.0.0.1:${address.port}`;
  };

  beforeEach(async () => {
    serverUrl = await startServer((req, res) => {
      void (async () => {
        if (req.url === "/languages") {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ languages: ["en", "zh"] }));
          return;
        }

        if (req.url === "/segment") {
          const parsed = await parseSegmentRequest(req);
          res.setHeader("content-type", "application/json");
          if (parsed.text === "__invalid__") {
            res.end(JSON.stringify({ invalid: true }));
            return;
          }
          res.end(JSON.stringify(buildSegmentPayload(parsed.text)));
          return;
        }

        if (req.url === "/batch-segment") {
          const parsed = await parseBatchSegmentRequest(req);
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              results: parsed.items.map(
                (item: { id: string; text: string }) => ({
                  id: item.id,
                  result: buildSegmentPayload(item.text),
                }),
              ),
            }),
          );
          return;
        }

        res.statusCode = 404;
        res.end();
      })();
    });
  });

  afterEach(async () => {
    await closeServer?.();
    closeServer = undefined;
  });

  test("accepts serverUrl provided by runtime config", () => {
    const segmenter = new SpacyWordSegmenter({
      serverUrl: "http://localhost:8000",
    });

    expect(segmenter.getId()).toBe("spacy-word-segmenter");
  });

  test("requires serverUrl to exist in runtime config", () => {
    expect(() => new SpacyWordSegmenter({})).toThrow();
  });

  test("loads supported languages from /languages", async () => {
    const segmenter = new SpacyWordSegmenter({ serverUrl });
    await expect(segmenter.getSupportedLanguages()).resolves.toEqual([
      "en",
      "zh",
    ]);
  });

  test("maps /segment responses into CAT token format", async () => {
    const segmenter = new SpacyWordSegmenter({ serverUrl });
    await expect(
      segmenter.segment({ text: "Hello", languageId: "en-US" }),
    ).resolves.toEqual({
      sentences: [
        {
          text: "Hello",
          start: 0,
          end: 5,
          tokens: [
            {
              text: "Hello",
              lemma: "hello",
              pos: "NOUN",
              start: 0,
              end: 5,
              isStop: false,
              isPunct: false,
            },
          ],
        },
      ],
      tokens: [
        {
          text: "Hello",
          lemma: "hello",
          pos: "NOUN",
          start: 0,
          end: 5,
          isStop: false,
          isPunct: false,
        },
      ],
    });
  });

  test("maps /batch-segment responses for multiple items", async () => {
    const segmenter = new SpacyWordSegmenter({ serverUrl });
    await expect(
      segmenter.batchSegment({
        languageId: "en-US",
        items: [
          { id: "1", text: "Alpha" },
          { id: "2", text: "Beta" },
        ],
      }),
    ).resolves.toEqual({
      results: [
        {
          id: "1",
          result: {
            sentences: [
              {
                text: "Alpha",
                start: 0,
                end: 5,
                tokens: [
                  {
                    text: "Alpha",
                    lemma: "alpha",
                    pos: "NOUN",
                    start: 0,
                    end: 5,
                    isStop: false,
                    isPunct: false,
                  },
                ],
              },
            ],
            tokens: [
              {
                text: "Alpha",
                lemma: "alpha",
                pos: "NOUN",
                start: 0,
                end: 5,
                isStop: false,
                isPunct: false,
              },
            ],
          },
        },
        {
          id: "2",
          result: {
            sentences: [
              {
                text: "Beta",
                start: 0,
                end: 4,
                tokens: [
                  {
                    text: "Beta",
                    lemma: "beta",
                    pos: "NOUN",
                    start: 0,
                    end: 4,
                    isStop: false,
                    isPunct: false,
                  },
                ],
              },
            ],
            tokens: [
              {
                text: "Beta",
                lemma: "beta",
                pos: "NOUN",
                start: 0,
                end: 4,
                isStop: false,
                isPunct: false,
              },
            ],
          },
        },
      ],
    });
  });

  test("returns an empty language list on timeout", async () => {
    const unavailableUrl = serverUrl;
    await closeServer?.();
    closeServer = undefined;

    const segmenter = new SpacyWordSegmenter({
      serverUrl: unavailableUrl,
      timeout: 5,
    });
    await expect(segmenter.getSupportedLanguages()).resolves.toEqual([]);
  });

  test("rejects invalid /segment payloads", async () => {
    const segmenter = new SpacyWordSegmenter({ serverUrl });
    await expect(
      segmenter.segment({ text: "__invalid__", languageId: "en-US" }),
    ).rejects.toThrow();
  });
});

const realServerUrl = process.env.SPACY_CONTRACT_SERVER_URL;

describe.runIf(Boolean(realServerUrl))(
  "SpacyWordSegmenter real contract",
  () => {
    test("segments text against the real spaCy server", async () => {
      const segmenter = new SpacyWordSegmenter({
        serverUrl: realServerUrl!,
        languageModelMap: { "en-US": "en" },
      });

      const result = await segmenter.segment({
        text: "Running tests quickly.",
        languageId: "en-US",
      });

      expect(result.tokens.length).toBeGreaterThan(0);
      expect(result.tokens[0]?.lemma).toBeTruthy();
      expect(result.tokens[0]?.pos).toBeTruthy();
    });
  },
);
