import type { ExecutorContext } from "@cat/domain";

import { PluginManager } from "@cat/plugin-core";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BootstrapProfile } from "@/schemas";

const sourceCollectorMock = vi.hoisted(() => ({
  extract: vi.fn(),
  toCollectionPayload: vi.fn(),
  normalizeI18nText: (text: string) =>
    text.normalize("NFC").trim().replace(/\s+/g, " "),
  vueI18nExtractor: { id: "vue-i18n" },
}));

const operationsMock = vi.hoisted(() => ({
  diffStructuredContentOp: vi.fn(),
  buildMemoryRecallVariantsOp: vi.fn(),
}));

const domainMock = vi.hoisted(() => ({
  createMemory: Symbol("createMemory"),
  createMemoryItems: Symbol("createMemoryItems"),
  createVectorizedStrings: Symbol("createVectorizedStrings"),
  executeCommand: vi.fn(),
}));

const serverSharedMock = vi.hoisted(() => ({
  firstOrGivenService: vi.fn(),
  resolvePluginManager: vi.fn((pluginManager: unknown) => pluginManager),
}));

vi.mock("@cat/source-collector", () => sourceCollectorMock);
vi.mock("@cat/operations", () => operationsMock);
vi.mock("@cat/domain", () => domainMock);
vi.mock("@cat/server-shared", () => serverSharedMock);

import { runBootstrapSourceGraph } from "@/bootstrap/source-bootstrap";

const BASE_PROFILE: BootstrapProfile = {
  enabled: true,
  importerId: "cat-app-vue-i18n",
  sourceRootRef: "cat-app-source",
  sourceLanguageId: "zh-Hans",
  targetLanguageIds: ["en"],
  source: {
    baseDir: "../../apps/app",
    globs: ["src/**/*.vue"],
    extractor: "vue-i18n",
    parseFailureTolerance: 0,
  },
  localeCatalogs: [],
  failOnZeroElements: true,
  report: {
    output: "artifacts/bootstrap-report.json",
  },
};

const createExecCtx = (): ExecutorContext => ({
  get db(): never {
    throw new Error("execCtx.db should not be accessed in this test");
  },
});

const makeInput = (seedDir: string) => ({
  execCtx: createExecCtx(),
  pluginManager: new PluginManager("GLOBAL", ""),
  seedDir,
  profileName: "bootstrap-app",
  creatorId: "00000000-0000-4000-8000-000000000010",
  projectId: "00000000-0000-4000-8000-000000000001",
  sourceLanguageId: "zh-Hans",
  targetLanguageIds: ["en"],
  profile: BASE_PROFILE,
  skipVectorization: true,
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("runBootstrapSourceGraph", () => {
  it("fails when bootstrap extraction yields zero elements", async () => {
    const dir = await mkdtemp(join(tmpdir(), "seed-bootstrap-source-"));
    try {
      sourceCollectorMock.extract.mockResolvedValue({
        importerId: "vue-i18n",
        relationTypes: [],
        nodes: [],
        elements: [],
        relations: [],
        evidence: [],
        diagnostics: [],
      });
      sourceCollectorMock.toCollectionPayload.mockReturnValue({
        payloadVersion: "content-graph/v1",
        projectId: "00000000-0000-4000-8000-000000000001",
        sourceLanguageId: "zh-Hans",
        importerId: "cat-app-vue-i18n",
        sourceRootRef: "cat-app-source",
        nodes: [],
        elements: [],
        relations: [],
        evidence: [],
        relationTypes: [],
      });

      await expect(runBootstrapSourceGraph(makeInput(dir))).rejects.toThrow(
        /zero elements/,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes a report and returns element bindings for source-only bootstrap", async () => {
    const dir = await mkdtemp(join(tmpdir(), "seed-bootstrap-source-"));
    try {
      sourceCollectorMock.extract.mockResolvedValue({
        importerId: "vue-i18n",
        relationTypes: [],
        nodes: [
          {
            ref: "node:one",
            kind: "SOURCE_COMPONENT",
            displayLabel: "App.vue",
            importerId: "vue-i18n",
            sourceRootRef: "cat-app-source",
            stableSourceNodeRef: "node:one",
            exportRole: "NONE",
            boundaryType: "FILE",
          },
        ],
        elements: [
          {
            ref: "element:one",
            stableSourceRef: "stable:one",
            sourceNodeRef: "node:one",
            localOrder: 0,
            text: "你好",
            languageId: "zh-Hans",
          },
        ],
        relations: [],
        evidence: [],
        diagnostics: [],
      });
      sourceCollectorMock.toCollectionPayload.mockReturnValue({
        payloadVersion: "content-graph/v1",
        projectId: "00000000-0000-4000-8000-000000000001",
        sourceLanguageId: "zh-Hans",
        importerId: "cat-app-vue-i18n",
        sourceRootRef: "cat-app-source",
        nodes: [
          {
            ref: "node:one",
            kind: "SOURCE_COMPONENT",
            displayLabel: "App.vue",
            importerId: "cat-app-vue-i18n",
            sourceRootRef: "cat-app-source",
            stableSourceNodeRef: "node:one",
            exportRole: "NONE",
            boundaryType: "FILE",
          },
        ],
        elements: [
          {
            ref: "element:one",
            stableSourceRef: "stable:one",
            sourceNodeRef: "node:one",
            localOrder: 0,
            text: "你好",
            languageId: "zh-Hans",
          },
        ],
        relations: [],
        evidence: [],
        relationTypes: [],
      });
      operationsMock.diffStructuredContentOp.mockResolvedValue({
        contentNodeIds: [],
        relationIds: [],
        contextEvidenceIds: [],
        addedElementIds: [1],
        removedElementIds: [],
        updatedElementIds: [],
        movedElementIds: [],
        semanticDiffIds: [11],
        elementIdsByRef: { "element:one": 1 },
      });
      serverSharedMock.firstOrGivenService.mockReturnValue(undefined);

      const result = await runBootstrapSourceGraph(makeInput(dir));
      const reportRaw = await readFile(result.reportPath, "utf-8");
      const report = JSON.parse(reportRaw);

      expect(result.elementIdsByRef["element:one"]).toBe(1);
      expect(result.memoryId).toBeUndefined();
      expect(report).toEqual(
        expect.objectContaining({
          optionalServices: expect.objectContaining({
            vectorization: "skipped",
          }),
        }),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
