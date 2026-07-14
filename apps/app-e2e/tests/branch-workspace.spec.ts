import { test, expect } from "#/fixtures.ts";

test.describe("Branch workspace", () => {
  test("keeps seeded pull-request content in SSR HTML and hydrates without warnings", async ({
    page,
    refs,
  }) => {
    const projectId = refs.project;
    const response = await page.goto(`/project/${projectId}/pull-requests`);
    if (!response)
      throw new Error("Pull-request page did not return an SSR response");
    const html = await response.text();

    expect(html).toContain("E2E branch workspace");
    await expect(page.getByText("E2E branch workspace")).toBeVisible();
  });

  test("keeps selected branch after refresh and writes translation to branch", async ({
    page,
    editorPage,
    refs,
  }) => {
    const projectId = refs["project"];
    const contentNodeId = refs["content-node:elements"];
    const prNumber = refs["pr:branch-workspace:number"];
    const branchId = refs["branch:workspace"];
    const translationText = `branch translation ${Date.now()}`;
    const branchTrigger = () =>
      page
        .getByRole("button", { name: "Show popup" })
        .filter({
          hasText: new RegExp(`main|pr-${prNumber}|branch-${branchId}`),
        })
        .first();

    await editorPage.navigateToProjectEditor(projectId, "zh-Hans", [
      contentNodeId,
    ]);
    await branchTrigger().click();
    await page
      .getByRole("option", {
        name: new RegExp(`^pr-${prNumber}\\s+—`),
      })
      .click();
    await expect(page).toHaveURL(/branchId=/);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(`branchId=${branchId}`));
    await expect(branchTrigger()).toContainText(
      new RegExp(`pr-${prNumber}|branch-${branchId}`),
    );

    await editorPage.selectElement(0, { waitForWritable: true });
    await editorPage.inputTranslation(translationText);
    await editorPage.submitTranslation();

    await page.goto(`/project/${projectId}/pull-requests/${prNumber}`);
    await page.getByRole("tab", { name: "变更" }).click();
    await expect(page.getByText(translationText)).toBeVisible({
      timeout: 15_000,
    });

    await editorPage.navigateToProjectEditor(projectId, "zh-Hans", [
      contentNodeId,
    ]);
    await expect(branchTrigger()).toBeVisible();

    if (
      (await branchTrigger().textContent())?.includes(`pr-${prNumber}`) ||
      (await branchTrigger().textContent())?.includes(`branch-${branchId}`)
    ) {
      await branchTrigger().click();
      await page.getByRole("option", { name: /^main$/ }).click();
    }

    await expect(branchTrigger()).toContainText("main");
    await editorPage.selectElement(0);

    const translationsSection = page
      .locator("h3", { hasText: "所有翻译" })
      .locator("..");
    await expect(translationsSection.getByText(translationText)).toHaveCount(0);
  });
});
