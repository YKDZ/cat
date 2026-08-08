import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { RequiredVectorDimension } from "@cat/shared";
import { afterEach, describe, expect, it } from "vitest";

import { runCleanupSteps } from "#/cleanup.ts";
import { loadSuite } from "#/config/index.ts";
import { evaluate } from "#/eval/index.ts";
import { runHarness } from "#/harness/index.ts";
import { generateReport } from "#/report/index.ts";

const releaseSuiteDirectory = resolve(
  import.meta.dirname,
  "../suites/release-recall",
);

const vector = (text: string): number[] => {
  const values = Array.from({ length: RequiredVectorDimension }, () => 0);
  if (text.toLocaleLowerCase("en").includes("release gate")) values[0] = 1;
  else values[1] = 1;
  return values;
};

const startEmbeddingServer = async (): Promise<{
  close: () => Promise<void>;
  baseUrl: string;
  requestDimensions: number[];
  requestEncodingFormats: string[];
  responseDimensions: number[];
}> => {
  const requestDimensions: number[] = [];
  const requestEncodingFormats: string[] = [];
  const responseDimensions: number[] = [];
  const handleEmbeddingRequest = async (
    request: import("node:http").IncomingMessage,
    response: import("node:http").ServerResponse,
  ): Promise<void> => {
    if (request.method !== "POST" || request.url !== "/v1/embeddings") {
      response.writeHead(404).end();
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      dimensions?: number;
      encoding_format?: "base64" | "float";
      input: string[];
    };
    if (body.dimensions !== undefined) requestDimensions.push(body.dimensions);
    if (body.encoding_format !== undefined)
      requestEncodingFormats.push(body.encoding_format);
    const embeddings = body.input.map((input, index) => {
      const embedding = vector(input);
      responseDimensions.push(embedding.length);
      return {
        embedding:
          body.encoding_format === "float"
            ? embedding
            : Buffer.from(new Float32Array(embedding).buffer).toString(
                "base64",
              ),
        index,
        object: "embedding",
      };
    });
    response.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify({
        data: embeddings,
        model: "release-eval-deterministic",
        object: "list",
        usage: { prompt_tokens: 0, total_tokens: 0 },
      }),
    );
  };
  const server = createServer((request, response) => {
    void handleEmbeddingRequest(request, response);
  });
  await new Promise<void>((resolveServer) => {
    server.listen(0, "127.0.0.1", () => {
      resolveServer();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error(
      "Deterministic embedding server did not expose a TCP port.",
    );
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requestDimensions,
    requestEncodingFormats,
    responseDimensions,
    close: async () =>
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      }),
  };
};

describe("release recall evaluation", () => {
  let server: Awaited<ReturnType<typeof startEmbeddingServer>> | undefined;
  let cacheDirectory: string | undefined;
  const originalEnvironment = { ...process.env };

  afterEach(async () => {
    await runCleanupSteps([
      async () => {
        const activeServer = server;
        server = undefined;
        await activeServer?.close();
      },
      async () => {
        const directory = cacheDirectory;
        cacheDirectory = undefined;
        if (directory !== undefined) {
          await rm(directory, { force: true, recursive: true });
        }
      },
      () => {
        process.env = { ...originalEnvironment };
      },
    ]);
  });

  it("runs one fresh, fully prepared native-pgvector recall case and cleans its schema", async () => {
    server = await startEmbeddingServer();
    cacheDirectory = await mkdtemp(join(tmpdir(), "cat-eval-release-"));
    process.env.VECTORIZER_BASE_URL = server.baseUrl;
    process.env.SPACY_SERVER_URL ??= "http://127.0.0.1:8000";

    const suite = loadSuite(releaseSuiteDirectory);
    let runResult: Awaited<ReturnType<typeof runHarness>> | undefined;
    let failure: unknown;
    try {
      runResult = await runHarness({
        suite,
        cacheDir: cacheDirectory,
        pluginsDir: resolve(import.meta.dirname, "../../../@cat-plugin"),
      });
    } catch (error) {
      failure = error;
    }
    if (failure !== undefined) throw failure;
    if (runResult === undefined) throw new Error("Eval did not return a run.");
    expect(server.responseDimensions).not.toEqual([]);
    expect(server.requestDimensions).toEqual(
      expect.arrayContaining([RequiredVectorDimension]),
    );
    expect(server.requestEncodingFormats).toEqual(
      expect.arrayContaining(["base64"]),
    );
    expect(server.responseDimensions).toEqual(
      expect.arrayContaining([RequiredVectorDimension]),
    );
    expect(runResult.scenarioResults).toEqual([
      expect.objectContaining({
        cases: [expect.objectContaining({ status: "ok" })],
      }),
    ]);
    const caseResult = runResult.scenarioResults[0]?.cases[0];
    const recallResult = caseResult?.recallResult;
    if (recallResult === undefined) {
      throw new Error(
        "Release evaluation did not expose typed recall outcomes.",
      );
    }
    if (
      recallResult.outcomes.KEYWORD.status !== "SUCCEEDED" ||
      recallResult.outcomes.SEMANTIC.status !== "SUCCEEDED"
    ) {
      throw new Error(
        "Release keyword and semantic channels must both succeed.",
      );
    }
    const expectedConceptId = runResult.refs.getId("concept:release-gate");
    expect(
      recallResult.outcomes.KEYWORD.candidates.some(
        ({ conceptId }) => conceptId === expectedConceptId,
      ),
    ).toBe(true);
    expect(
      recallResult.outcomes.SEMANTIC.candidates.some(
        ({ conceptId, evidences }) =>
          conceptId === expectedConceptId &&
          evidences.some(({ channel }) => channel === "semantic"),
      ),
    ).toBe(true);
    const report = generateReport(
      runResult,
      evaluate(
        runResult.scenarioResults,
        suite.testSets,
        suite.config.scenarios.map(({ scorers }) => scorers),
        runResult.refs,
      ),
      suite.config.thresholds,
    );
    expect(report.allPassed).toBe(true);
    expect(globalThis.__DRIZZLE_DB__).toBeUndefined();
  });
});
