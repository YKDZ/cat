import { randomUUID } from "node:crypto";

import { sql, vectorizedString } from "@cat/db";
import type { NormalizedQaFinding } from "@cat/shared";
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
} from "#/commands/index.ts";
import { executeCommand, executeQuery } from "#/executor.ts";
import {
  countQaReviewQueueItems,
  countQaReviewableElements,
  getQaReviewableElementDetail,
  listQaReviewQueueItems,
  listQaReviewableElements,
} from "#/queries/index.ts";
import { requireFixtureValue } from "#/testing/require-fixture-value.ts";
import { setupTestDB, type TestDB } from "#/testing/setup-test-db.ts";

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

  return requireFixtureValue(row).id;
};

const buildFinding = (
  overrides: Partial<NormalizedQaFinding> = {},
): NormalizedQaFinding => ({
  layer: "DETERMINISTIC",
  checkerService: null,
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

  const sourceStringIds = [
    await insertString("Apple", "en"),
    await insertString("Banana", "en"),
    await insertString("Cherry", "en"),
    await insertString("Durian", "en"),
  ] as const;

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

  const translationStringIds = [
    await insertString("苹果", "zh-Hans"),
    await insertString("香蕉", "zh-Hans"),
    await insertString("樱桃", "zh-Hans"),
    await insertString("榴莲", "zh-Hans"),
    await insertString("分支苹果", "zh-Hans"),
  ] as const;

  const translationIds = await executeCommand(
    { db: testDb.client },
    createTranslations,
    {
      data: [
        {
          translatableElementId: requireFixtureValue(elementIds[0]),
          translatorId: creatorId,
          stringId: translationStringIds[0],
        },
        {
          translatableElementId: requireFixtureValue(elementIds[1]),
          translatorId: creatorId,
          stringId: translationStringIds[1],
        },
        {
          translatableElementId: requireFixtureValue(elementIds[2]),
          translatorId: creatorId,
          stringId: translationStringIds[2],
        },
        {
          translatableElementId: requireFixtureValue(elementIds[3]),
          translatorId: creatorId,
          stringId: translationStringIds[3],
        },
        {
          translatableElementId: requireFixtureValue(elementIds[0]),
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

  const queueInputs: Parameters<typeof createQueue>[0][] = [
    {
      projectId: project.id,
      elementId: requireFixtureValue(elementIds[0]),
      translationId: requireFixtureValue(translationIds[0]),
      summary: "Apple main summary",
      findings: [
        buildFinding({
          action: "INFORMATIONAL",
          severity: "info",
          riskScore: 15,
          message: "Apple info",
        }),
      ],
    },
    {
      projectId: project.id,
      elementId: requireFixtureValue(elementIds[1]),
      translationId: requireFixtureValue(translationIds[1]),
      summary: "Banana main summary",
      findings: [
        buildFinding({
          ruleId: "banana-risk",
          ruleFamily: "number",
          riskScore: 65,
          message: "Banana warning",
        }),
      ],
    },
    {
      projectId: project.id,
      elementId: requireFixtureValue(elementIds[2]),
      translationId: requireFixtureValue(translationIds[2]),
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
    },
    {
      projectId: project.id,
      elementId: requireFixtureValue(elementIds[3]),
      translationId: requireFixtureValue(translationIds[3]),
      summary: "Durian main summary",
      findings: [
        buildFinding({
          ruleId: "durian-warning",
          riskScore: 55,
          message: "Durian warning",
        }),
      ],
    },
    {
      projectId: project.id,
      elementId: requireFixtureValue(elementIds[0]),
      translationId: requireFixtureValue(translationIds[4]),
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
    },
  ];
  // The fixture owns one PostgreSQL client, so setup queries are sequential.
  // oxlint-disable-next-line no-await-in-loop
  for (const input of queueInputs) await createQueue(input);

  return {
    project,
    branch,
    elements: {
      apple: requireFixtureValue(elementIds[0]),
    },
    nodes: { dirA, dirB, fileA, fileB, fileC },
  };
};

const baseQuery = (fixture: Fixture) => ({
  projectId: fixture.project.id,
  languageToId: "zh-Hans",
  contentNodeIds: [] as string[],
  searchQuery: "",
  statusFilter: "all" as const,
  sortMode: "structure" as const,
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
    expect(requireFixtureValue(firstPage[0])?.latestRunSummary).toBe(
      "Cherry main summary",
    );
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
    expect(requireFixtureValue(rows[0])?.latestRunSummary).toBe(
      "Apple branch summary",
    );
    expect(requireFixtureValue(rows[0])?.queueItem.scopeKey).toBe(
      `branch:${fixture.branch.id}`,
    );
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
    expect(requireFixtureValue(rows[0])?.sourceText).toBe("Cherry");
    expect(requireFixtureValue(rows[0])?.queueItem.status).toBe("BLOCKED");
  });

  it("groups multiple open queue items for the same element into one reviewable element", async () => {
    const fixture = await seedFixture();
    const rows = await executeQuery(
      { db: testDb.client },
      listQaReviewableElements,
      {
        ...baseQuery(fixture),
        contentNodeIds: [fixture.nodes.dirA.id],
        pageSize: 10,
      },
    );

    const apple = rows.find((row) => row.sourceText === "Apple");
    expect(apple).toMatchObject({
      candidateCount: 1,
      elementId: expect.any(Number),
      primaryContentNodeId: fixture.nodes.fileA.id,
    });
    expect(new Set(rows.map((row) => row.elementId)).size).toBe(rows.length);

    const count = await executeQuery(
      { db: testDb.client },
      countQaReviewableElements,
      {
        ...baseQuery(fixture),
      },
    );
    expect(count).toBeGreaterThan(0);
  });

  it("returns all pending candidates for the selected element detail", async () => {
    const fixture = await seedFixture();
    const alternateStringId = await insertString("苹果（备选）", "zh-Hans");
    const [alternateTranslationId] = await executeCommand(
      { db: testDb.client },
      createTranslations,
      {
        data: [
          {
            translatableElementId: fixture.elements.apple,
            translatorId: creatorId,
            stringId: alternateStringId,
          },
        ],
      },
    );
    await createQueue({
      projectId: fixture.project.id,
      elementId: fixture.elements.apple,
      translationId: requireFixtureValue(alternateTranslationId),
      summary: "Apple alternate summary",
      findings: [
        buildFinding({
          ruleId: "apple-alternate",
          riskScore: 25,
          message: "Apple alternate warning",
        }),
      ],
    });
    const [apple] = await executeQuery(
      { db: testDb.client },
      listQaReviewableElements,
      {
        ...baseQuery(fixture),
        searchQuery: "Apple",
      },
    );
    expect(apple).toBeDefined();
    if (!apple) {
      throw new Error("Expected Apple reviewable element to exist");
    }
    const detail = await executeQuery(
      { db: testDb.client },
      getQaReviewableElementDetail,
      {
        projectId: fixture.project.id,
        languageId: "zh-Hans",
        branchId: null,
        elementId: apple.elementId,
      },
    );

    expect(detail?.sourceText).toBe("Apple");
    expect(detail?.candidates).toHaveLength(2);
    expect(
      detail?.candidates.every(
        (candidate) => candidate.queueItem.status !== "RESOLVED",
      ),
    ).toBe(true);
    expect(
      detail?.candidates.map((candidate) => ({
        summary: candidate.latestRunSummary,
        findings: candidate.findings.map((finding) => finding.message),
      })),
    ).toEqual([
      {
        summary: "Apple alternate summary",
        findings: ["Apple alternate warning"],
      },
      {
        summary: "Apple main summary",
        findings: ["Apple info"],
      },
    ]);
  });
});
