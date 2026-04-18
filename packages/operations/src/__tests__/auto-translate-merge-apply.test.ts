/**
 * Integration tests for AutoTranslationApplicationMethod via mergePRFull.
 *
 * Validates:
 * - After merging an AUTO_TRANSLATE PR, Translation records are created for
 *   elements that had no prior translation
 * - Existing translations are NOT overwritten (any translation blocks auto-apply)
 * - readWithOverlay returns the auto_translation entry before merge
 */

import type { TestDB } from "@cat/test-utils";

import {
  addProjectTargetLanguages,
  createElements,
  createProject,
  createRootDocument,
  createTranslations,
  createUser,
  createVectorizedStrings,
  ensureLanguages,
  executeCommand,
  executeQuery,
  findOpenAutoTranslatePR,
  listPRs,
  listTranslationsByElement,
  updateProjectFeatures,
  upsertAutoTranslationEntry,
} from "@cat/domain";
import { setupTestDB } from "@cat/test-utils";
import { readWithOverlay } from "@cat/vcs";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { findOrCreateAutoTranslatePR } from "../find-or-create-auto-translate-pr";
import { mergePRFull } from "../merge-pr-full";

let testDb: TestDB;

beforeAll(async () => {
  testDb = await setupTestDB();
});

afterAll(async () => {
  await testDb?.cleanup();
});

interface SeedResult {
  projectId: string;
  userId: string;
  documentId: string;
  elementId: number;
  sourceStringId: number;
}

async function seedProject(): Promise<SeedResult> {
  await executeCommand({ db: testDb.client }, ensureLanguages, {
    languageIds: ["en", "zh-CN"],
  });

  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const user = await executeCommand({ db: testDb.client }, createUser, {
    email: `auto-translate-merge-${uniqueSuffix}@test.local`,
    name: "Auto Translate Merge Tester",
  });

  const project = await executeCommand({ db: testDb.client }, createProject, {
    name: "Auto Translate Merge Test Project",
    description: null,
    creatorId: user.id,
  });

  await executeCommand({ db: testDb.client }, updateProjectFeatures, {
    projectId: project.id,
    features: { issues: false, pullRequests: true },
  });

  await executeCommand({ db: testDb.client }, addProjectTargetLanguages, {
    projectId: project.id,
    languageIds: ["zh-CN"],
  });

  const doc = await executeCommand({ db: testDb.client }, createRootDocument, {
    name: "Test Document",
    projectId: project.id,
    creatorId: user.id,
  });

  const [sourceStringId] = await executeCommand(
    { db: testDb.client },
    createVectorizedStrings,
    { data: [{ text: "Hello world", languageId: "en" }] },
  );

  const [elementId] = await executeCommand(
    { db: testDb.client },
    createElements,
    {
      data: [
        {
          documentId: doc.id,
          stringId: sourceStringId,
          creatorId: user.id,
        },
      ],
    },
  );

  return {
    projectId: project.id,
    userId: user.id,
    documentId: doc.id,
    elementId: elementId,
    sourceStringId: sourceStringId,
  };
}

describe("AutoTranslationApplicationMethod — via mergePRFull", () => {
  test("readWithOverlay returns the auto_translation entry before merge", async () => {
    const { projectId, elementId } = await seedProject();

    const { branchId, changesetId } = await findOrCreateAutoTranslatePR(
      { db: testDb.client },
      { projectId, languageId: "zh-CN" },
    );

    const entityId = `element:${elementId}:lang:zh-CN`;

    await executeCommand({ db: testDb.client }, upsertAutoTranslationEntry, {
      changesetId,
      entityId,
      after: {
        text: "你好世界",
        elementId,
        languageId: "zh-CN",
        confidence: 0.95,
        source: "memory",
      },
    });

    const overlay = await readWithOverlay(
      testDb.client,
      branchId,
      "auto_translation",
      entityId,
    );

    expect(overlay).not.toBeNull();
    expect(overlay?.action).toBe("CREATE");
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const data = overlay?.data as unknown as Record<string, unknown> | null;
    expect(data?.text).toBe("你好世界");
    expect(data?.languageId).toBe("zh-CN");
  });

  test("merging an AUTO_TRANSLATE PR creates Translation records for elements", async () => {
    const { projectId, userId, elementId } = await seedProject();

    const { changesetId } = await findOrCreateAutoTranslatePR(
      { db: testDb.client },
      { projectId, languageId: "zh-CN" },
    );

    const entityId = `element:${elementId}:lang:zh-CN`;

    await executeCommand({ db: testDb.client }, upsertAutoTranslationEntry, {
      changesetId,
      entityId,
      after: {
        text: "你好世界",
        elementId,
        languageId: "zh-CN",
        confidence: 0.9,
        source: "advisor",
      },
    });

    // Find the PR so we can merge it
    const openPr = await executeQuery(
      { db: testDb.client },
      findOpenAutoTranslatePR,
      {
        projectId,
        languageId: "zh-CN",
      },
    );
    expect(openPr).not.toBeNull();

    // Merge the PR — triggers AutoTranslationApplicationMethod.applyCreate
    const result = await mergePRFull(
      { db: testDb.client },
      {
        prExternalId: await getAutoTranslatePrExternalId(projectId, "zh-CN"),
        mergedBy: userId,
      },
    );

    expect(result.success).toBe(true);
    expect(result.hasConflicts).toBe(false);

    // Verify Translation records were created
    const translations = await executeQuery(
      { db: testDb.client },
      listTranslationsByElement,
      { elementId, languageId: "zh-CN" },
    );
    expect(translations.length).toBeGreaterThan(0);
    expect(translations[0]?.text).toBe("你好世界");
  });

  test("existing translation prevents auto-translation from overwriting it", async () => {
    const { projectId, userId, elementId } = await seedProject();

    // Pre-create a translation before the AUTO_TRANSLATE PR is merged
    const [translationStringId] = await executeCommand(
      { db: testDb.client },
      createVectorizedStrings,
      { data: [{ text: "人类翻译文字", languageId: "zh-CN" }] },
    );

    await executeCommand({ db: testDb.client }, createTranslations, {
      data: [
        {
          translatableElementId: elementId,
          stringId: translationStringId,
        },
      ],
    });

    const { changesetId } = await findOrCreateAutoTranslatePR(
      { db: testDb.client },
      { projectId, languageId: "zh-CN" },
    );

    await executeCommand({ db: testDb.client }, upsertAutoTranslationEntry, {
      changesetId,
      entityId: `element:${elementId}:lang:zh-CN`,
      after: {
        text: "自动翻译",
        elementId,
        languageId: "zh-CN",
        confidence: 0.8,
        source: "advisor",
      },
    });

    const result = await mergePRFull(
      { db: testDb.client },
      {
        prExternalId: await getAutoTranslatePrExternalId(projectId, "zh-CN"),
        mergedBy: userId,
      },
    );

    expect(result.success).toBe(true);

    // The existing translation should still be the human-written one
    const translations = await executeQuery(
      { db: testDb.client },
      listTranslationsByElement,
      { elementId, languageId: "zh-CN" },
    );
    // Only one translation (the pre-existing human one), auto-translate skipped
    expect(translations.length).toBe(1);
    expect(translations[0]?.text).toBe("人类翻译文字");
  });
});

// ─── Helper ───────────────────────────────────────────────────────────────────

async function getAutoTranslatePrExternalId(
  projectId: string,
  languageId: string,
): Promise<string> {
  const openPr = await executeQuery(
    { db: testDb.client },
    findOpenAutoTranslatePR,
    { projectId, languageId },
  );
  if (!openPr)
    throw new Error(`No open AUTO_TRANSLATE PR for lang ${languageId}`);

  const prs = await executeQuery({ db: testDb.client }, listPRs, {
    projectId,
    type: "AUTO_TRANSLATE",
    limit: 50,
    offset: 0,
  });
  const pr = prs.find((p) => p.id === openPr.id);
  if (!pr) throw new Error(`PR ${openPr.id} not found in listPRs`);
  return pr.externalId;
}
