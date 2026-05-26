import { and, DrizzleDB, eq, vectorizedString } from "@cat/db";
import {
  createContentNodeUnderParent,
  createElements,
  createProject,
  createQaReviewRunWithFindings,
  createRootContentNode,
  createTranslations,
  executeCommand,
  materializeQaReviewQueueItem,
} from "@cat/domain";
import { randomUUID } from "node:crypto";

import { test, expect, type E2ERefs } from "./fixtures";

type QaScenarioItem = {
  sourceText: string;
  candidateText: string;
  message: string;
  action: "BLOCK_APPROVAL" | "NEEDS_REVIEW";
  riskScore: number;
};

const insertString = async (
  db: DrizzleDB["client"],
  value: string,
  languageId: string,
) => {
  const [row] = await db
    .insert(vectorizedString)
    .values({ value, languageId })
    .onConflictDoNothing()
    .returning({ id: vectorizedString.id });

  if (row?.id) {
    return row.id;
  }

  const [existing] = await db
    .select({ id: vectorizedString.id })
    .from(vectorizedString)
    .where(
      and(
        eq(vectorizedString.value, value),
        eq(vectorizedString.languageId, languageId),
      ),
    )
    .limit(1);

  if (!existing?.id) {
    throw new Error(
      `Failed to resolve vectorized string for ${languageId}:${value}`,
    );
  }

  return existing.id;
};

const seedQaReviewProject = async (
  refs: E2ERefs,
  items: QaScenarioItem[],
): Promise<{ projectId: string; elementIds: number[] }> => {
  const drizzleDB = new DrizzleDB();
  await drizzleDB.connect();

  try {
    const execCtx = { db: drizzleDB.client };
    const adminId = refs["user:admin"];

    if (!adminId) {
      throw new Error("Missing user:admin ref for QA review E2E setup");
    }

    const project = await executeCommand(execCtx, createProject, {
      name: `qa-review-e2e-${randomUUID()}`,
      description: null,
      creatorId: adminId,
    });
    const root = await executeCommand(execCtx, createRootContentNode, {
      projectId: project.id,
      creatorId: adminId,
    });
    const file = await executeCommand(execCtx, createContentNodeUnderParent, {
      projectId: project.id,
      creatorId: adminId,
      parentContentNodeId: root.id,
      kind: "FILE",
      displayLabel: `qa-review-e2e-${randomUUID()}.json`,
      importerId: "test-json",
      sourceRootRef: "root",
      stableSourceNodeRef: `qa-review-file-${randomUUID()}`,
      exportRole: "FILE",
      boundaryType: "FILE",
      localOrder: 0,
    });

    const elementIds = await Promise.all(
      items.map(async (item, index) => {
        const sourceStringId = await insertString(
          drizzleDB.client,
          item.sourceText,
          "en",
        );
        const [elementId] = await executeCommand(execCtx, createElements, {
          data: [
            {
              projectId: project.id,
              primaryContentNodeId: file.id,
              importerId: "test-json",
              sourceRootRef: "root",
              sourceNodeRef: `qa-review-e2e-${index}`,
              stableSourceRef: `qa-review-e2e-element-${randomUUID()}`,
              stringId: sourceStringId,
              localOrder: index,
            },
          ],
        });
        const candidateStringId = await insertString(
          drizzleDB.client,
          item.candidateText,
          "zh-Hans",
        );
        const [translationId] = await executeCommand(
          execCtx,
          createTranslations,
          {
            data: [
              {
                translatableElementId: elementId,
                translatorId: adminId,
                stringId: candidateStringId,
              },
            ],
          },
        );

        await executeCommand(execCtx, createQaReviewRunWithFindings, {
          projectId: project.id,
          elementId,
          translationId,
          branchId: null,
          layer: "DETERMINISTIC",
          status: "COMPLETED",
          riskScore: item.riskScore,
          summary: item.message,
          findings: [
            {
              layer: "DETERMINISTIC",
              checkerServiceId: null,
              qaResultItemId: null,
              ruleId: "e2e.qa",
              ruleFamily: "e2e",
              severity: item.action === "BLOCK_APPROVAL" ? "error" : "warning",
              action: item.action,
              disposition: "OPEN",
              confidenceBasisPoints: 10000,
              riskScore: item.riskScore,
              message: item.message,
              explanation: null,
              sourceSpan: null,
              targetSpan: null,
              suggestedText: null,
              meta: null,
            },
          ],
        });

        await executeCommand(execCtx, materializeQaReviewQueueItem, {
          projectId: project.id,
          languageId: "zh-Hans",
          elementId,
          translationId,
          branchId: null,
        });

        return elementId;
      }),
    );

    return { projectId: project.id, elementIds };
  } finally {
    await drizzleDB.disconnect();
  }
};

test.describe("QA review workbench", () => {
  test("approves, rejects, and reaches empty state", async ({
    refs,
    qaReviewPage,
    page,
  }) => {
    const scenario = await seedQaReviewProject(refs, [
      {
        sourceText: "Hello World",
        candidateText: "QA approved candidate",
        message: "Missing placeholder",
        action: "BLOCK_APPROVAL",
        riskScore: 100,
      },
      {
        sourceText: "Save Changes",
        candidateText: "QA rejected candidate",
        message: "Needs style review",
        action: "NEEDS_REVIEW",
        riskScore: 60,
      },
    ]);
    const [approveElementId, rejectElementId] = scenario.elementIds;

    await qaReviewPage.navigateToQa(scenario.projectId, "zh-Hans");
    await page.waitForURL(
      new RegExp(
        `/qa-review/project/${scenario.projectId}/zh-Hans/${approveElementId}(?:\\?.*)?$`,
      ),
    );
    await expect(page.getByText("阻断批准").first()).toBeVisible({
      timeout: 15_000,
    });
    await qaReviewPage.selectFirstCandidate();
    await qaReviewPage.addNote("E2E approve note");
    await qaReviewPage.approve();
    await page.waitForURL(
      new RegExp(
        `/qa-review/project/${scenario.projectId}/zh-Hans/${rejectElementId}(?:\\?.*)?$`,
      ),
      { timeout: 15_000 },
    );

    await qaReviewPage.selectFirstCandidate();
    await qaReviewPage.addNote("E2E reject note");
    await qaReviewPage.reject();
    await page.waitForURL(
      new RegExp(
        `/qa-review/project/${scenario.projectId}/zh-Hans/empty(?:\\?.*)?$`,
      ),
      { timeout: 15_000 },
    );

    await expect(page.getByText("当前筛选已处理完")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("defer keeps the candidate visible for later processing", async ({
    refs,
    qaReviewPage,
    page,
  }) => {
    const scenario = await seedQaReviewProject(refs, [
      {
        sourceText: "Profile",
        candidateText: "QA deferred candidate",
        message: "Needs reviewer follow-up",
        action: "NEEDS_REVIEW",
        riskScore: 55,
      },
    ]);
    const [deferElementId] = scenario.elementIds;

    await page.goto(
      `/qa-review/project/${scenario.projectId}/zh-Hans/${deferElementId}`,
    );
    await page.waitForURL(
      new RegExp(
        `/qa-review/project/${scenario.projectId}/zh-Hans/${deferElementId}(?:\\?.*)?$`,
      ),
    );
    await qaReviewPage.selectFirstCandidate();
    await qaReviewPage.defer();

    await page.goto(
      `/qa-review/project/${scenario.projectId}/zh-Hans/${deferElementId}`,
    );
    await expect(
      page.getByRole("button", { name: /选择候选/ }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
