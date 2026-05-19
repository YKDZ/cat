import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  eq,
  plugin,
  pluginInstallation,
  pluginService,
  qaResult,
  qaResultItem,
  qaReviewFinding,
  qaReviewQueueItem,
  qaReviewRun,
  vectorizedString,
} from "../../db/dist/index.js";

const qaMocks = vi.hoisted(() => ({
  qaOp: vi.fn(),
  tokenizeOp: vi.fn(),
}));

vi.mock("./qa", () => ({
  qaOp: qaMocks.qaOp,
}));

vi.mock("./tokenize", () => ({
  tokenizeOp: qaMocks.tokenizeOp,
}));

import {
  createContentNodeUnderParent,
  createElements,
  createProject,
  createRootContentNode,
  createTranslations,
  createUser,
  ensureCoreRelationTypes,
  ensureLanguages,
  executeCommand,
} from "@cat/domain";

import {
  setupTestDB,
  type TestDB,
} from "../../domain/src/testing/setup-test-db";
import { qaTranslationOp } from "./qa-translation";

let testDb: TestDB;
let creatorId: string;
let checkerId: number;

const insertString = async (value: string, languageId: string) => {
  const [row] = await testDb.client
    .insert(vectorizedString)
    .values({ value, languageId })
    .returning({ id: vectorizedString.id });

  return row.id;
};

const seedTranslation = async () => {
  const project = await executeCommand({ db: testDb.client }, createProject, {
    name: `qa-translation-review-${randomUUID()}`,
    description: null,
    creatorId,
  });
  const root = await executeCommand(
    { db: testDb.client },
    createRootContentNode,
    { projectId: project.id, creatorId },
  );
  const file = await executeCommand(
    { db: testDb.client },
    createContentNodeUnderParent,
    {
      projectId: project.id,
      creatorId,
      parentContentNodeId: root.id,
      kind: "FILE",
      displayLabel: "source.json",
      importerId: "test-json",
      sourceRootRef: "root",
      stableSourceNodeRef: `source-${randomUUID()}`,
      exportRole: "FILE",
      boundaryType: "FILE",
      localOrder: 0,
    },
  );
  const sourceStringId = await insertString(
    "Welcome {player}, you have 3 lives",
    "en",
  );
  const [elementId] = await executeCommand(
    { db: testDb.client },
    createElements,
    {
      data: [
        {
          projectId: project.id,
          primaryContentNodeId: file.id,
          importerId: "test-json",
          sourceRootRef: "root",
          sourceNodeRef: "source.json",
          stableSourceRef: `element-${randomUUID()}`,
          stringId: sourceStringId,
          localOrder: 0,
        },
      ],
    },
  );
  const translationStringId = await insertString(
    "欢迎，你有 2 条命",
    "zh-Hans",
  );
  const [translationId] = await executeCommand(
    { db: testDb.client },
    createTranslations,
    {
      data: [
        {
          translatableElementId: elementId,
          translatorId: creatorId,
          stringId: translationStringId,
        },
      ],
    },
  );

  return { projectId: project.id, elementId, translationId };
};

beforeAll(async () => {
  testDb = await setupTestDB();
  await executeCommand({ db: testDb.client }, ensureCoreRelationTypes, {});
  await executeCommand({ db: testDb.client }, ensureLanguages, {
    languageIds: ["en", "zh-Hans"],
  });
  const creator = await executeCommand({ db: testDb.client }, createUser, {
    email: `qa-translation-review-${randomUUID()}@example.com`,
    name: "QA Translation Review Tester",
  });
  creatorId = creator.id;

  const pluginId = `qa-translation-review-plugin-${randomUUID()}`;
  await testDb.client.insert(plugin).values({
    id: pluginId,
    name: "qa-translation-review-plugin",
    overview: "QA translation review test plugin",
    isExternal: false,
    entry: "dist/index.js",
    iconUrl: null,
    version: "0.0.1",
  });
  const [installation] = await testDb.client
    .insert(pluginInstallation)
    .values({ pluginId, scopeType: "GLOBAL", scopeId: "" })
    .returning({ id: pluginInstallation.id });
  const [service] = await testDb.client
    .insert(pluginService)
    .values({
      serviceId: `qa-translation-review-checker-${randomUUID()}`,
      pluginInstallationId: installation.id,
      serviceType: "QA_CHECKER",
    })
    .returning({ id: pluginService.id });
  checkerId = service.id;
});

afterAll(async () => {
  await testDb.cleanup();
});

describe("qaTranslationOp review integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    qaMocks.tokenizeOp.mockResolvedValue({ tokens: [] });
    qaMocks.qaOp.mockResolvedValue({
      result: [
        {
          isPassed: false,
          checkerId,
          meta: {
            ruleId: "basic.variable-consistency",
            ruleFamily: "placeholder",
            severity: "error",
            confidence: 0.98,
            defaultAction: "BLOCK_APPROVAL",
            message: "Missing variable {player}",
          },
        },
        {
          isPassed: false,
          checkerId,
          meta: {
            ruleId: "basic.number-consistency",
            ruleFamily: "number",
            severity: "warning",
            confidence: 0.8,
            defaultAction: "NEEDS_REVIEW",
            message: "Number mismatch",
          },
        },
      ],
    });
  });

  it("persists QA results, review runs, findings, and a blocked queue item", async () => {
    const seeded = await seedTranslation();

    await qaTranslationOp(
      { translationId: seeded.translationId },
      { traceId: randomUUID() },
    );

    const [storedQaResult] = await testDb.client
      .select({ id: qaResult.id, translationId: qaResult.translationId })
      .from(qaResult)
      .where(eq(qaResult.translationId, seeded.translationId))
      .limit(1);
    if (!storedQaResult) {
      throw new Error("Expected persisted QA result to exist");
    }
    const storedQaItems = await testDb.client
      .select({ id: qaResultItem.id, resultId: qaResultItem.resultId })
      .from(qaResultItem)
      .where(eq(qaResultItem.resultId, storedQaResult.id));
    const reviewRuns = await testDb.client
      .select({
        id: qaReviewRun.id,
        layer: qaReviewRun.layer,
        status: qaReviewRun.status,
        riskScore: qaReviewRun.riskScore,
      })
      .from(qaReviewRun)
      .where(eq(qaReviewRun.translationId, seeded.translationId));
    const findings = await testDb.client
      .select({
        ruleFamily: qaReviewFinding.ruleFamily,
        action: qaReviewFinding.action,
      })
      .from(qaReviewFinding)
      .where(eq(qaReviewFinding.translationId, seeded.translationId));
    const [queueItem] = await testDb.client
      .select({
        id: qaReviewQueueItem.id,
        status: qaReviewQueueItem.status,
        translationId: qaReviewQueueItem.translationId,
      })
      .from(qaReviewQueueItem)
      .where(eq(qaReviewQueueItem.translationId, seeded.translationId))
      .limit(1);

    expect(storedQaResult?.translationId).toBe(seeded.translationId);
    expect(storedQaItems).toHaveLength(2);
    expect(reviewRuns).toHaveLength(1);
    expect(reviewRuns[0]).toMatchObject({
      layer: "DETERMINISTIC",
      status: "COMPLETED",
    });
    expect(findings).toEqual(
      expect.arrayContaining([
        { ruleFamily: "placeholder", action: "BLOCK_APPROVAL" },
        { ruleFamily: "number", action: "NEEDS_REVIEW" },
      ]),
    );
    expect(queueItem).toMatchObject({
      translationId: seeded.translationId,
      status: "BLOCKED",
    });
  });
});
