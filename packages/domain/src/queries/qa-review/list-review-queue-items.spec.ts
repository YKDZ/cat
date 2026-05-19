import type { NormalizedQaFinding } from "@cat/shared";

import { sql, vectorizedString } from "@cat/db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createBranch,
  createChangeset,
  createContentNodeUnderParent,
  createElements,
  createProject,
  createQaReviewRunWithFindings,
  createRootContentNode,
  createTranslations,
  createUser,
  ensureCoreRelationTypes,
  ensureLanguages,
  materializeQaReviewQueueItem,
} from "@/commands";
import { executeCommand, executeQuery } from "@/executor";
import { countQaReviewQueueItems, listQaReviewQueueItems } from "@/queries";
import { setupTestDB, type TestDB } from "@/testing/setup-test-db";

let testDb: TestDB;
let creatorId: string;

type Fixture = Awaited<ReturnType<typeof seedFixture>>;

const insertString = async (value: string, languageId: string) => {
  const [row] = await testDb.client
    .insert(vectorizedString)
    .values({ value, languageId })
    .onConflictDoUpdate({
      target: [vectorizedString.languageId, vectorizedString.value],
      set: { value: sql`excluded.value` },
    })
    .returning({ id: vectorizedString.id });

  return row.id;
};

const buildFinding = (
  overrides: Partial<NormalizedQaFinding> = {},
): NormalizedQaFinding => ({
  layer: "DETERMINISTIC",
  checkerServiceId: null,
  qaResultItemId: null,
  ruleId: "qa.rule",
  ruleFamily: "generic",
  severity: "warning",
  action: "NEEDS_REVIEW",
  disposition: "OPEN",
  confidenceBasisPoints: 10000,
  riskScore: 50,
  message: "QA finding",
  explanation: null,
  sourceSpan: null,
  targetSpan: null,
  suggestedText: null,
  meta: null,
  ...overrides,
});

const createQueue = async (input: {
  projectId: string;
  elementId: number;
  translationId: number;
  findings: NormalizedQaFinding[];
  summary: string;
  branchId?: number | null;
}) => {
  await executeCommand({ db: testDb.client }, createQaReviewRunWithFindings, {
    projectId: input.projectId,
    elementId: input.elementId,
    translationId: input.translationId,
    branchId: input.branchId ?? null,
    layer: "DETERMINISTIC",
    status: "COMPLETED",
    riskScore: Math.max(
      0,
      ...input.findings.map((finding) => finding.riskScore),
    ),
    summary: input.summary,
    findings: input.findings,
  });

  return await executeCommand(
    { db: testDb.client },
    materializeQaReviewQueueItem,
    {
      projectId: input.projectId,
      languageId: "zh-Hans",
      elementId: input.elementId,
      translationId: input.translationId,
      branchId: input.branchId ?? null,
    },
  );
};

const seedFixture = async () => {
  const project = await executeCommand({ db: testDb.client }, createProject, {
    name: `qa-review-queue-${randomUUID()}`,
    description: null,
    creatorId,
  });
  const root = await executeCommand(
    { db: testDb.client },
    createRootContentNode,
    { projectId: project.id, creatorId },
  );
  const dirA = await executeCommand(
    { db: testDb.client },
    createContentNodeUnderParent,
    {
      projectId: project.id,
      creatorId,
      parentContentNodeId: root.id,
      kind: "DIRECTORY",
      displayLabel: "dir-a",
      importerId: "test",
      sourceRootRef: "root",
      stableSourceNodeRef: `dir-a-${randomUUID()}`,
      exportRole: "DIRECTORY",
      boundaryType: "DIRECTORY",
      localOrder: 0,
    },
  );
  const dirB = await executeCommand(
    { db: testDb.client },
    createContentNodeUnderParent,
    {
      projectId: project.id,
      creatorId,
      parentContentNodeId: root.id,
      kind: "DIRECTORY",
      displayLabel: "dir-b",
      importerId: "test",
      sourceRootRef: "root",
      stableSourceNodeRef: `dir-b-${randomUUID()}`,
      exportRole: "DIRECTORY",
      boundaryType: "DIRECTORY",
      localOrder: 1,
    },
  );
  const fileA = await executeCommand(
    { db: testDb.client },
    createContentNodeUnderParent,
    {
      projectId: project.id,
      creatorId,
      parentContentNodeId: dirA.id,
      kind: "FILE",
      displayLabel: "a.json",
      importerId: "test-json",
      sourceRootRef: "root",
      stableSourceNodeRef: `file-a-${randomUUID()}`,
      exportRole: "FILE",
      boundaryType: "FILE",
      localOrder: 0,
    },
  );
  const fileB = await executeCommand(
    { db: testDb.client },
    createContentNodeUnderParent,
    {
      projectId: project.id,
      creatorId,
      parentContentNodeId: dirA.id,
      kind: "FILE",
      displayLabel: "b.json",
      importerId: "test-json",
      sourceRootRef: "root",
      stableSourceNodeRef: `file-b-${randomUUID()}`,
      exportRole: "FILE",
      boundaryType: "FILE",
      localOrder: 1,
    },
  );
  const fileC = await executeCommand(
    { db: testDb.client },
    createContentNodeUnderParent,
    {
      projectId: project.id,
      creatorId,
      parentContentNodeId: dirB.id,
      kind: "FILE",
      displayLabel: "c.json",
      importerId: "test-json",
      sourceRootRef: "root",
      stableSourceNodeRef: `file-c-${randomUUID()}`,
      exportRole: "FILE",
      boundaryType: "FILE",
      localOrder: 0,
    },
  );

  const sourceStringIds = await Promise.all([
    insertString("Apple", "en"),
    insertString("Banana", "en"),
    insertString("Cherry", "en"),
    insertString("Durian", "en"),
  ]);

  const elementIds = await executeCommand(
    { db: testDb.client },
    createElements,
    {
      data: [
        {
          projectId: project.id,
          primaryContentNodeId: fileA.id,
          importerId: "test-json",
          sourceRootRef: "root",
          sourceNodeRef: "a.json",
          stableSourceRef: `apple-${randomUUID()}`,
          stringId: sourceStringIds[0],
          localOrder: 0,
        },
        {
          projectId: project.id,
          primaryContentNodeId: fileA.id,
          importerId: "test-json",
          sourceRootRef: "root",
          sourceNodeRef: "a.json",
          stableSourceRef: `banana-${randomUUID()}`,
          stringId: sourceStringIds[1],
          localOrder: 1,
        },
        {
          projectId: project.id,
          primaryContentNodeId: fileB.id,
          importerId: "test-json",
          sourceRootRef: "root",
          sourceNodeRef: "b.json",
          stableSourceRef: `cherry-${randomUUID()}`,
          stringId: sourceStringIds[2],
          localOrder: 0,
        },
        {
          projectId: project.id,
          primaryContentNodeId: fileC.id,
          importerId: "test-json",
          sourceRootRef: "root",
          sourceNodeRef: "c.json",
          stableSourceRef: `durian-${randomUUID()}`,
          stringId: sourceStringIds[3],
          localOrder: 0,
        },
      ],
    },
  );

  const translationStringIds = await Promise.all([
    insertString("苹果", "zh-Hans"),
    insertString("香蕉", "zh-Hans"),
    insertString("樱桃", "zh-Hans"),
    insertString("榴莲", "zh-Hans"),
    insertString("分支苹果", "zh-Hans"),
  ]);

  const translationIds = await executeCommand(
    { db: testDb.client },
    createTranslations,
    {
      data: [
        {
          translatableElementId: elementIds[0],
          translatorId: creatorId,
          stringId: translationStringIds[0],
        },
        {
          translatableElementId: elementIds[1],
          translatorId: creatorId,
          stringId: translationStringIds[1],
        },
        {
          translatableElementId: elementIds[2],
          translatorId: creatorId,
          stringId: translationStringIds[2],
        },
        {
          translatableElementId: elementIds[3],
          translatorId: creatorId,
          stringId: translationStringIds[3],
        },
        {
          translatableElementId: elementIds[0],
          translatorId: creatorId,
          stringId: translationStringIds[4],
        },
      ],
    },
  );

  const branch = await executeCommand({ db: testDb.client }, createBranch, {
    projectId: project.id,
    name: `qa-review-branch-${randomUUID()}`,
    createdBy: creatorId,
  });
  await executeCommand({ db: testDb.client }, createChangeset, {
    projectId: project.id,
    branchId: branch.id,
    createdBy: creatorId,
  });

  await Promise.all([
    createQueue({
      projectId: project.id,
      elementId: elementIds[0],
      translationId: translationIds[0],
      summary: "Apple main summary",
      findings: [
        buildFinding({
          action: "INFORMATIONAL",
          severity: "info",
          riskScore: 15,
          message: "Apple info",
        }),
      ],
    }),
    createQueue({
      projectId: project.id,
      elementId: elementIds[1],
      translationId: translationIds[1],
      summary: "Banana main summary",
      findings: [
        buildFinding({
          ruleId: "banana-risk",
          ruleFamily: "number",
          riskScore: 65,
          message: "Banana warning",
        }),
      ],
    }),
    createQueue({
      projectId: project.id,
      elementId: elementIds[2],
      translationId: translationIds[2],
      summary: "Cherry main summary",
      findings: [
        buildFinding({
          ruleId: "cherry-blocker",
          ruleFamily: "placeholder",
          severity: "error",
          action: "BLOCK_APPROVAL",
          riskScore: 100,
          message: "Cherry blocker",
        }),
      ],
    }),
    createQueue({
      projectId: project.id,
      elementId: elementIds[3],
      translationId: translationIds[3],
      summary: "Durian main summary",
      findings: [
        buildFinding({
          ruleId: "durian-warning",
          riskScore: 55,
          message: "Durian warning",
        }),
      ],
    }),
    createQueue({
      projectId: project.id,
      elementId: elementIds[0],
      translationId: translationIds[4],
      summary: "Apple branch summary",
      branchId: branch.id,
      findings: [
        buildFinding({
          ruleId: "apple-branch",
          ruleFamily: "generic",
          riskScore: 90,
          message: "Apple branch risk",
        }),
      ],
    }),
  ]);

  return {
    project,
    branch,
    nodes: { dirA, dirB, fileA, fileB, fileC },
  };
};

const baseQuery = (fixture: Fixture) => ({
  projectId: fixture.project.id,
  languageToId: "zh-Hans",
  contentNodeIds: [] as string[],
  searchQuery: "",
  statusFilter: "all" as const,
  page: 0,
  pageSize: 10,
  queueFilters: {
    queueStatus: [],
    riskBucket: [],
    findingAction: [],
    includeResolved: false,
  },
});

beforeAll(async () => {
  testDb = await setupTestDB();
  await executeCommand({ db: testDb.client }, ensureCoreRelationTypes, {});
  await executeCommand({ db: testDb.client }, ensureLanguages, {
    languageIds: ["en", "zh-Hans"],
  });
  const creator = await executeCommand({ db: testDb.client }, createUser, {
    email: `qa-review-queue-${randomUUID()}@example.com`,
    name: "QA Review Queue Tester",
  });
  creatorId = creator.id;
});

afterAll(async () => {
  await testDb.cleanup();
});

describe("listQaReviewQueueItems", () => {
  it("sorts by risk and paginates within the selected editor scope", async () => {
    const fixture = await seedFixture();
    const query = {
      ...baseQuery(fixture),
      contentNodeIds: [fixture.nodes.dirA.id],
      pageSize: 2,
    };

    const total = await executeQuery(
      { db: testDb.client },
      countQaReviewQueueItems,
      {
        ...query,
      },
    );
    const firstPage = await executeQuery(
      { db: testDb.client },
      listQaReviewQueueItems,
      {
        ...query,
        page: 0,
      },
    );
    const secondPage = await executeQuery(
      { db: testDb.client },
      listQaReviewQueueItems,
      {
        ...query,
        page: 1,
      },
    );

    expect(total).toBe(3);
    expect(firstPage.map((row) => row.sourceText)).toEqual([
      "Cherry",
      "Banana",
    ]);
    expect(secondPage.map((row) => row.sourceText)).toEqual(["Apple"]);
    expect(firstPage[0]?.latestRunSummary).toBe("Cherry main summary");
  });

  it("returns only branch-scoped queue items when querying a branch scope", async () => {
    const fixture = await seedFixture();
    const rows = await executeQuery(
      { db: testDb.client },
      listQaReviewQueueItems,
      {
        ...baseQuery(fixture),
        branchId: fixture.branch.id,
        contentNodeIds: [fixture.nodes.dirA.id],
      },
    );

    expect(rows.map((row) => row.sourceText)).toEqual(["Apple"]);
    expect(rows[0]?.latestRunSummary).toBe("Apple branch summary");
    expect(rows[0]?.queueItem.scopeKey).toBe(`branch:${fixture.branch.id}`);
  });

  it("applies queue filters on top of the shared editor scope", async () => {
    const fixture = await seedFixture();
    const rows = await executeQuery(
      { db: testDb.client },
      listQaReviewQueueItems,
      {
        ...baseQuery(fixture),
        contentNodeIds: [fixture.nodes.dirA.id],
        queueFilters: {
          queueStatus: ["BLOCKED"],
          riskBucket: ["BLOCKING"],
          findingAction: ["BLOCK_APPROVAL"],
          includeResolved: false,
        },
      },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.sourceText).toBe("Cherry");
    expect(rows[0]?.queueItem.status).toBe("BLOCKED");
  });
});
