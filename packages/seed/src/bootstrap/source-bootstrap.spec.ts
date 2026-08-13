import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExecutorContext } from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { RecallDerivationReferenceSchema } from "@cat/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BootstrapProfile } from "#/schemas.ts";

const sourceCollectorMock = vi.hoisted(() => ({
  extract: vi.fn(),
  toCollectionPayload: vi.fn(),
  normalizeI18nText: (text: string) =>
    text.normalize("NFC").trim().replace(/\s+/g, " "),
  vueI18nExtractor: { id: "vue-i18n" },
}));

const operationsMock = vi.hoisted(() => ({
  diffStructuredContentOp: vi.fn(),
  startRecallDerivationWorker: vi.fn(),
  waitForRecallDerivationFresh: vi.fn(),
}));

const localeBridgeMock = vi.hoisted(() => ({
  buildLocaleBridgeMaterial: vi.fn(),
}));

const domainMock = vi.hoisted(() => ({
  createMemory: Symbol("createMemory"),
  createMemoryItems: Symbol("createMemoryItems"),
  createVectorizedStrings: Symbol("createVectorizedStrings"),
  executeCommand: vi.fn(),
}));

const serverSharedMock = vi.hoisted(() => ({
  resolvePluginManager: vi.fn((pluginManager: unknown) => pluginManager),
  selectFirstServiceImplementation: vi.fn(),
}));

vi.mock("@cat/source-collector", () => sourceCollectorMock);
vi.mock("@cat/operations", () => operationsMock);
vi.mock("@cat/domain", () => domainMock);
vi.mock("@cat/server-shared", () => serverSharedMock);
vi.mock("#/bootstrap/locale-bridge.ts", () => localeBridgeMock);

import { runBootstrapSourceGraph } from "#/bootstrap/source-bootstrap.ts";

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

const makeMemoryItemDerivation = () =>
  RecallDerivationReferenceSchema.parse({
    targetKind: "MEMORY_ITEM",
    targetId: "101",
    languageId: "en",
    demandRevision: 1,
  });

afterEach(() => {
  vi.clearAllMocks();
});

describe("runBootstrapSourceGraph", () => {
  it("rejects the retired memory aggregate derivation discriminator", () => {
    expect(
      RecallDerivationReferenceSchema.safeParse({
        targetKind: "MEMORY",
        targetId: "101",
        languageId: "en",
        demandRevision: 1,
      }).success,
    ).toBe(false);
  });

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
      localeBridgeMock.buildLocaleBridgeMaterial.mockResolvedValue({
        evidence: [],
        memoryItems: [],
        diagnostics: [],
        matchedElementCount: 0,
        matchedLocaleKeyCount: 0,
        staleLocaleKeyCount: 0,
      });
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
      serverSharedMock.selectFirstServiceImplementation.mockReturnValue(
        undefined,
      );

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

  it("waits for locale-memory derivations through the public freshness API", async () => {
    const dir = await mkdtemp(join(tmpdir(), "seed-bootstrap-source-"));
    try {
      const db = {};
      const input = {
        ...makeInput(dir),
        execCtx: { db } as ExecutorContext,
      };
      const derivation = makeMemoryItemDerivation();
      sourceCollectorMock.extract.mockResolvedValue({
        importerId: "vue-i18n",
        relationTypes: [],
        nodes: [],
        elements: [
          {
            ref: "element:one",
            stableSourceRef: "stable:one",
            sourceNodeRef: "node:one",
            localOrder: 0,
            text: "Hello",
            languageId: "zh-Hans",
          },
        ],
        relations: [],
        evidence: [],
        diagnostics: [],
      });
      sourceCollectorMock.toCollectionPayload.mockReturnValue({
        payloadVersion: "content-graph/v1",
        projectId: input.projectId,
        sourceLanguageId: input.sourceLanguageId,
        importerId: input.profile.importerId,
        sourceRootRef: input.profile.sourceRootRef,
        nodes: [],
        elements: [
          {
            ref: "element:one",
            stableSourceRef: "stable:one",
            sourceNodeRef: "node:one",
            localOrder: 0,
            text: "Hello",
            languageId: "zh-Hans",
          },
        ],
        relations: [],
        evidence: [],
        relationTypes: [],
      });
      localeBridgeMock.buildLocaleBridgeMaterial.mockResolvedValue({
        evidence: [],
        memoryItems: [
          {
            ref: "mem:locale:en:hello",
            source: "Hello",
            translation: "Hello",
            sourceLanguageId: "zh-Hans",
            translationLanguageId: "en",
          },
        ],
        diagnostics: [],
        matchedElementCount: 1,
        matchedLocaleKeyCount: 1,
        staleLocaleKeyCount: 0,
      });
      operationsMock.diffStructuredContentOp.mockResolvedValue({
        contentNodeIds: [],
        relationIds: [],
        contextEvidenceIds: [],
        addedElementIds: [1],
        removedElementIds: [],
        updatedElementIds: [],
        movedElementIds: [],
        semanticDiffIds: [],
        elementIdsByRef: { "element:one": 1 },
      });
      domainMock.executeCommand.mockImplementation(
        (_context: unknown, command: symbol) => {
          if (command === domainMock.createMemory) {
            return Promise.resolve({ id: "memory-id" });
          }
          if (command === domainMock.createVectorizedStrings) {
            return Promise.resolve([1]);
          }
          if (command === domainMock.createMemoryItems) {
            return Promise.resolve({
              items: [{ id: 101 }],
              derivations: [derivation],
            });
          }
          throw new Error("Unexpected command");
        },
      );
      const stop = vi.fn();
      operationsMock.startRecallDerivationWorker.mockResolvedValue({ stop });

      await runBootstrapSourceGraph(input);

      expect(operationsMock.startRecallDerivationWorker).toHaveBeenCalledWith({
        db,
        pluginManager: input.pluginManager,
      });
      expect(operationsMock.waitForRecallDerivationFresh).toHaveBeenCalledWith(
        [derivation],
        { db },
      );
      expect(stop).toHaveBeenCalledOnce();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("preserves public freshness failures", async () => {
    const dir = await mkdtemp(join(tmpdir(), "seed-bootstrap-source-"));
    try {
      const input = {
        ...makeInput(dir),
        execCtx: { db: {} } as ExecutorContext,
      };
      const derivation = makeMemoryItemDerivation();
      const freshnessFailure = Object.assign(new Error("blocked"), {
        status: "BLOCKED",
      });
      operationsMock.waitForRecallDerivationFresh.mockRejectedValueOnce(
        freshnessFailure,
      );
      const stop = vi.fn();
      operationsMock.startRecallDerivationWorker.mockResolvedValue({ stop });
      localeBridgeMock.buildLocaleBridgeMaterial.mockResolvedValue({
        evidence: [],
        memoryItems: [
          {
            ref: "mem:locale:en:hello",
            source: "Hello",
            translation: "Hello",
            sourceLanguageId: "zh-Hans",
            translationLanguageId: "en",
          },
        ],
        diagnostics: [],
        matchedElementCount: 0,
        matchedLocaleKeyCount: 0,
        staleLocaleKeyCount: 0,
      });
      sourceCollectorMock.extract.mockResolvedValue({
        importerId: "vue-i18n",
        relationTypes: [],
        nodes: [],
        elements: [
          {
            ref: "element:one",
            stableSourceRef: "stable:one",
            sourceNodeRef: "node:one",
            localOrder: 0,
            text: "Hello",
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
        nodes: [],
        elements: [
          {
            ref: "element:one",
            stableSourceRef: "stable:one",
            sourceNodeRef: "node:one",
            localOrder: 0,
            text: "Hello",
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
        semanticDiffIds: [],
        elementIdsByRef: { "element:one": 1 },
      });
      domainMock.executeCommand.mockImplementation(
        (_context: unknown, command: symbol) => {
          if (command === domainMock.createMemory) {
            return Promise.resolve({ id: "memory-id" });
          }
          if (command === domainMock.createVectorizedStrings) {
            return Promise.resolve([1]);
          }
          if (command === domainMock.createMemoryItems) {
            return Promise.resolve({
              items: [{ id: 101 }],
              derivations: [derivation],
            });
          }
          throw new Error("Unexpected command");
        },
      );

      await expect(runBootstrapSourceGraph(input)).rejects.toBe(
        freshnessFailure,
      );
      expect(stop).toHaveBeenCalledOnce();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
