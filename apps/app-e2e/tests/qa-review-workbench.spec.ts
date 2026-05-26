import { test, expect } from "./fixtures";

test.describe("QA review workbench", () => {
  test("approves, rejects, and reaches empty state", async ({
    refs,
    qaReviewPage,
    page,
  }) => {
    await qaReviewPage.navigateToQa(refs.project, "zh-Hans");
    await expect(page.getByText("阻断批准").first()).toBeVisible();
    await qaReviewPage.selectFirstCandidate();
    await qaReviewPage.addNote("E2E approve note");
    await qaReviewPage.approve();

    await qaReviewPage.selectFirstCandidate();
    await qaReviewPage.addNote("E2E reject note");
    await qaReviewPage.reject();

    await expect(page.getByText("当前筛选已处理完")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("defer keeps the candidate visible for later processing", async ({
    refs,
    qaReviewPage,
    page,
  }) => {
    await qaReviewPage.navigateToQa(refs.project, "zh-Hans");
    await qaReviewPage.selectFirstCandidate();
    await qaReviewPage.defer();

    await page.goto(
      `/qa-review/project/${refs.project}/zh-Hans/${refs["qa:element:approve"]}`,
    );
    await expect(
      page.getByRole("button", { name: /选择候选/ }).first(),
    ).toBeVisible();
  });
});
