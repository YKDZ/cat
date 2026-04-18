/**
 * Integration tests for runAutoTranslatePipeline.
 *
 * fetchBestTranslationCandidateOp is mocked to return a fixed candidate so
 * these tests validate the pipeline's gate logic, language selection, and
 * changeset-entry persistence — not the translation quality.
 */

import type { TestDB } from "@cat/test-utils";

import {
  addProjectTargetLanguages,
  createElements,
  createProject,
  createRootDocument,
  createUser,
  createVectorizedStrings,
  ensureLanguages,
  executeCommand,
  executeQuery,
  getChangesetEntries,
  updateProjectFeatures,
  updateProjectSettings,
} from "@cat/domain";
import { setupTestDB } from "@cat/test-utils";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import { runAutoTranslatePipeline } from "../run-auto-translate-pipeline";

// Mock the fetch-best-translation-candidate module so tests don't need
// live AI services.  Individual tests override the implementation as needed.
vi.mock("../fetch-best-translation-candidate", () => ({
  fetchBestTranslationCandidateOp: vi.fn(),
}));

import { fetchBestTranslationCandidateOp } from "../fetch-best-translation-candidate";

const mockFetch = vi.mocked(fetchBestTranslationCandidateOp);

let testDb: TestDB;

beforeAll(async () => {
  testDb = await setupTestDB();
});

afterAll(async () => {
  await testDb?.cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  // Default: always return a fixed candidate
  mockFetch.mockResolvedValue({
    text: "Translated text",
    confidence: 0.9,
    source: "advisor" as const,
  });
});

interface SeedResult {
  projectId: string;
  userId: string;
  documentId: string;
  elementIds: number[];
}

async function seedProjectWithElements(opts?: {
  sourceLanguageId?: string;
  targetLanguageIds?: string[];
}): Promise<SeedResult> {
  const sourceLanguageId = opts?.sourceLanguageId ?? "en";
  const targetLanguageIds = opts?.targetLanguageIds ?? ["zh-CN"];
  const allLanguageIds = [sourceLanguageId, ...targetLanguageIds];

  await executeCommand({ db: testDb.client }, ensureLanguages, {
    languageIds: allLanguageIds,
  });

  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const user = await executeCommand({ db: testDb.client }, createUser, {
    email: `pipeline-test-${uniqueSuffix}@test.local`,
    name: "Pipeline Tester",
  });

  const project = await executeCommand({ db: testDb.client }, createProject, {
    name: "Pipeline Test Project",
    description: null,
    creatorId: user.id,
  });

  await executeCommand({ db: testDb.client }, updateProjectFeatures, {
    projectId: project.id,
    features: { issues: false, pullRequests: true },
  });

  await executeCommand({ db: testDb.client }, addProjectTargetLanguages, {
    projectId: project.id,
    languageIds: targetLanguageIds,
  });

  await executeCommand({ db: testDb.client }, updateProjectSettings, {
    projectId: project.id,
    patch: {
      enableAutoTranslation: true,
    },
  });

  const doc = await executeCommand({ db: testDb.client }, createRootDocument, {
    name: "Test Document",
    projectId: project.id,
    creatorId: user.id,
  });

  const [stringId] = await executeCommand(
    { db: testDb.client },
    createVectorizedStrings,
    { data: [{ text: "Hello world", languageId: sourceLanguageId }] },
  );

  const elementIds = await executeCommand(
    { db: testDb.client },
    createElements,
    {
      data: [{ documentId: doc.id, stringId: stringId, creatorId: user.id }],
    },
  );

  return {
    projectId: project.id,
    userId: user.id,
    documentId: doc.id,
    elementIds,
  };
}

describe("runAutoTranslatePipeline — gate logic", () => {
  test("skips when elementIds is empty", async () => {
    const { projectId, documentId } = await seedProjectWithElements();

    await runAutoTranslatePipeline(
      { db: testDb.client },
      { projectId, documentId, elementIds: [] },
    );

    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("skips when enableAutoTranslation is false", async () => {
    const { projectId, documentId, elementIds } =
      await seedProjectWithElements();

    await executeCommand({ db: testDb.client }, updateProjectSettings, {
      projectId,
      patch: { enableAutoTranslation: false },
    });

    await runAutoTranslatePipeline(
      { db: testDb.client },
      { projectId, documentId, elementIds },
    );

    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("skips when project pullRequests feature is disabled", async () => {
    const { projectId, documentId, elementIds } =
      await seedProjectWithElements();

    await executeCommand({ db: testDb.client }, updateProjectFeatures, {
      projectId,
      features: { issues: false, pullRequests: false },
    });

    await runAutoTranslatePipeline(
      { db: testDb.client },
      { projectId, documentId, elementIds },
    );

    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("skips elements whose sourceLanguageId equals the target language", async () => {
    // Source = "en", target also includes "en"
    const { projectId, documentId, elementIds } = await seedProjectWithElements(
      {
        sourceLanguageId: "en",
        targetLanguageIds: ["en"],
      },
    );

    await runAutoTranslatePipeline(
      { db: testDb.client },
      { projectId, documentId, elementIds },
    );

    // No candidates should be fetched because source === target
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("runAutoTranslatePipeline — language selection", () => {
  test("uses autoTranslationLanguages when explicitly set", async () => {
    await executeCommand({ db: testDb.client }, ensureLanguages, {
      languageIds: ["en", "de", "fr"],
    });

    const { projectId, documentId, elementIds } = await seedProjectWithElements(
      {
        sourceLanguageId: "en",
        targetLanguageIds: ["de", "fr"],
      },
    );

    // Restrict to only "de" even though "fr" is also a project language
    await executeCommand({ db: testDb.client }, updateProjectSettings, {
      projectId,
      patch: { autoTranslationLanguages: ["de"] },
    });

    await runAutoTranslatePipeline(
      { db: testDb.client },
      { projectId, documentId, elementIds },
    );

    // fetch should be called once (for "de" only)
    expect(mockFetch).toHaveBeenCalledTimes(elementIds.length);
    const calls = mockFetch.mock.calls;
    expect(calls.every((args) => args[0].translationLanguageId === "de")).toBe(
      true,
    );
  });

  test("falls back to all project target languages when autoTranslationLanguages is empty", async () => {
    await executeCommand({ db: testDb.client }, ensureLanguages, {
      languageIds: ["en", "de", "fr"],
    });

    const { projectId, documentId, elementIds } = await seedProjectWithElements(
      {
        sourceLanguageId: "en",
        targetLanguageIds: ["de", "fr"],
      },
    );

    // Ensure autoTranslationLanguages is empty (falls back to project langs)
    await executeCommand({ db: testDb.client }, updateProjectSettings, {
      projectId,
      patch: { autoTranslationLanguages: [] },
    });

    await runAutoTranslatePipeline(
      { db: testDb.client },
      { projectId, documentId, elementIds },
    );

    // fetch should be called once per element per language (1 element × 2 langs)
    expect(mockFetch).toHaveBeenCalledTimes(elementIds.length * 2);
  });
});

describe("runAutoTranslatePipeline — changeset entries", () => {
  test("writes auto_translation entries to the changeset when candidate is found", async () => {
    const { projectId, documentId, elementIds } =
      await seedProjectWithElements();

    await runAutoTranslatePipeline(
      { db: testDb.client },
      { projectId, documentId, elementIds },
    );

    // Fetch the changeset created for this project+language
    const { findOrCreateAutoTranslatePR } =
      await import("../find-or-create-auto-translate-pr");
    const { changesetId } = await findOrCreateAutoTranslatePR(
      { db: testDb.client },
      { projectId, languageId: "zh-CN" },
    );

    const entries = await executeQuery(
      { db: testDb.client },
      getChangesetEntries,
      {
        changesetId,
        entityType: "auto_translation",
      },
    );

    expect(entries.length).toBe(elementIds.length);
    for (const entry of entries) {
      expect(entry.entityId).toMatch(/^element:\d+:lang:zh-CN$/);
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      expect((entry.after as unknown as Record<string, unknown>)?.text).toBe(
        "Translated text",
      );
    }
  });

  test("writes no entries when no candidate is returned", async () => {
    mockFetch.mockResolvedValue(null);

    const { projectId, documentId, elementIds } =
      await seedProjectWithElements();

    await runAutoTranslatePipeline(
      { db: testDb.client },
      { projectId, documentId, elementIds },
    );

    const { findOrCreateAutoTranslatePR } =
      await import("../find-or-create-auto-translate-pr");
    const { changesetId } = await findOrCreateAutoTranslatePR(
      { db: testDb.client },
      { projectId, languageId: "zh-CN" },
    );

    const entries = await executeQuery(
      { db: testDb.client },
      getChangesetEntries,
      {
        changesetId,
        entityType: "auto_translation",
      },
    );

    expect(entries.length).toBe(0);
  });

  test("entityId format is element:{id}:lang:{languageId}", async () => {
    const { projectId, documentId, elementIds } =
      await seedProjectWithElements();

    await runAutoTranslatePipeline(
      { db: testDb.client },
      { projectId, documentId, elementIds },
    );

    const { findOrCreateAutoTranslatePR } =
      await import("../find-or-create-auto-translate-pr");
    const { changesetId } = await findOrCreateAutoTranslatePR(
      { db: testDb.client },
      { projectId, languageId: "zh-CN" },
    );

    const entries = await executeQuery(
      { db: testDb.client },
      getChangesetEntries,
      {
        changesetId,
        entityType: "auto_translation",
      },
    );

    for (const [idx, elementId] of elementIds.entries()) {
      expect(entries[idx]?.entityId).toBe(`element:${elementId}:lang:zh-CN`);
    }
  });
});
