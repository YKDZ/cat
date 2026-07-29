import { test, expect } from "./fixtures.ts";

test.describe("QA review workbench", () => {
  test("approves, rejects, and reaches empty state", async ({
    refs,
    qaReviewPage,
    page,
  }) => {
    const projectId = refs.project;
    const approveElementId = refs["qa:element:approve"];
    const rejectElementId = refs["qa:element:reject"];
    if (!approveElementId || !rejectElementId)
      throw new Error("Missing QA fixture refs");

    await qaReviewPage.navigateToQa(projectId, "zh-Hans");
    await page.waitForURL(
      new RegExp(
        `/qa-review/project/${projectId}/zh-Hans/${approveElementId}(?:\\?.*)?$`,
      ),
    );
    await expect(
      page.getByRole("button", { name: /选择候选/ }).first(),
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("阻断批准").first()).toBeVisible({
      timeout: 30_000,
    });
    await qaReviewPage.selectFirstCandidate();
    await qaReviewPage.addNote("E2E approve note");
    await qaReviewPage.approve();
    await page.waitForURL(
      new RegExp(
        `/qa-review/project/${projectId}/zh-Hans/${rejectElementId}(?:\\?.*)?$`,
      ),
      { timeout: 15_000 },
    );

    await qaReviewPage.selectFirstCandidate();
    await qaReviewPage.addNote("E2E reject note");
    await qaReviewPage.reject();
    await page.waitForURL(
      new RegExp(`/qa-review/project/${projectId}/zh-Hans/empty(?:\\?.*)?$`),
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
    const projectId = refs["qa:project:defer"];
    const deferElementId = refs["qa:element:defer"];
    if (!projectId || !deferElementId)
      throw new Error("Missing QA defer fixture refs");

    await page.goto(
      `/qa-review/project/${projectId}/zh-Hans/${deferElementId}`,
    );
    await page.waitForURL(
      new RegExp(
        `/qa-review/project/${projectId}/zh-Hans/${deferElementId}(?:\\?.*)?$`,
      ),
    );
    await qaReviewPage.selectFirstCandidate();
    await qaReviewPage.defer();
    await page.waitForLoadState("networkidle");

    await qaReviewPage.navigateToQa(projectId, "zh-Hans");
    await page.waitForURL(
      new RegExp(
        `/qa-review/project/${projectId}/zh-Hans/${deferElementId}(?:\\?.*)?$`,
      ),
      { timeout: 15_000 },
    );
    await expect(
      page.getByRole("button", { name: /选择候选/ }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
