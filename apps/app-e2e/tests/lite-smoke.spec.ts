import { writeFileSync } from "node:fs";

import { test, expect } from "#/fixtures.ts";

const uploadedFileName = "lite-smoke.json";

let createdProjectId: string | null = null;

const getCreatedProjectId = () => {
  if (!createdProjectId) {
    throw new Error("Lite smoke project was not created in the setup test.");
  }

  return createdProjectId;
};

test.describe("CAT Lite smoke", () => {
  test.describe.configure({ mode: "serial" });

  test("confirms the official spaCy Language Analyzer through application readiness", async ({
    page,
  }) => {
    const response = await page.request.get("/_health/ready");
    expect(response.ok()).toBe(true);
    await expect(response.json()).resolves.toMatchObject({
      components: { spacy: { code: "OK", status: "ready" } },
      status: "ready",
    });
  });

  test("@lite-smoke admits a first source distinct from project targets without changing membership", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /创建项目/ }).click();
    await expect(page).toHaveURL(/\/init\/file/);

    await page
      .getByPlaceholder("项目名称")
      .fill(`Lite Smoke ${test.info().project.name} ${Date.now()}`);
    await page.getByPlaceholder("项目简介").fill("Lite smoke project");
    await page
      .getByTestId("create-project-multi-language-picker")
      .getByRole("button")
      .click();
    await page.getByPlaceholder("选择一个或多个语言").fill("zh-Hans");
    await page.getByRole("option", { name: "zh-Hans", exact: true }).click();
    await page.getByRole("button", { name: "创建项目" }).click();
    await expect(page.getByRole("button", { name: /选择文件/ })).toBeVisible();

    const filePath = test.info().outputPath(uploadedFileName);
    writeFileSync(filePath, JSON.stringify({ hello: "world" }));
    const targetMembershipRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/rpc/project/addTargetLanguages")) {
        targetMembershipRequests.push(request.url());
      }
    });
    await page.locator('input[type="file"]').setInputFiles(filePath);

    const row = page.getByRole("row", { name: /lite-smoke\.json/ });
    await expect(row).toBeVisible();
    await row.getByRole("button").first().click();
    await page.getByPlaceholder("选择一个语言...").fill("en");
    await page.getByRole("option", { name: "en", exact: true }).click();
    const prepareCreateFromFile = page.waitForResponse(
      (response) =>
        response.url().includes("/api/rpc/file/prepareCreateFromFile") &&
        response.request().method() === "POST",
    );
    const finishCreateFromFile = page.waitForResponse(
      (response) =>
        response.url().includes("/api/rpc/file/finishCreateFromFile") &&
        response.request().method() === "POST",
    );
    await row.getByRole("button").last().click();
    const prepareResponse = await prepareCreateFromFile;
    if (!prepareResponse.ok()) {
      throw new Error(
        `prepareCreateFromFile failed with ${prepareResponse.status()}: ${await prepareResponse.text()}`,
      );
    }
    const finishResponse = await finishCreateFromFile;
    if (!finishResponse.ok()) {
      throw new Error(
        `finishCreateFromFile failed with ${finishResponse.status()}: ${await finishResponse.text()}`,
      );
    }
    expect(targetMembershipRequests).toEqual([]);

    await page.getByRole("button", { name: "先不上传文件" }).click();
    await expect(
      page.getByRole("button", { name: "前往项目界面" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "前往项目界面" }).click();
    await expect(page).toHaveURL(/\/project\/[^/]+$/);

    createdProjectId = new URL(page.url()).pathname.split("/")[2] ?? null;
    expect(createdProjectId).toBeTruthy();

    await page.goto(`/project/${createdProjectId}/zh-Hans`);
    await expect(page.getByText(uploadedFileName, { exact: true })).toBeVisible(
      {
        timeout: 30_000,
      },
    );
  });

  test("@lite-smoke edits seeded content and exports imported content", async ({
    page,
    editorPage,
    refs,
  }) => {
    const projectId = getCreatedProjectId();
    const seededProjectId = refs["project"];
    const contentNodeId = refs["content-node:elements"];

    await editorPage.navigateToEditor({
      projectId: seededProjectId,
      languageToId: "zh-Hans",
      contentNodeId,
    });
    await editorPage.selectElement(0);
    await editorPage.inputTranslation("Lite smoke translation");
    await editorPage.submitTranslation();
    await editorPage.expectTranslationVisible("Lite smoke translation");

    const projectResponse = await page.goto(`/project/${projectId}/zh-Hans`);
    if (!projectResponse)
      throw new Error("Imported content page did not return an SSR response");
    expect(await projectResponse.text()).toContain(uploadedFileName);
    const fileRow = page
      .getByText(uploadedFileName, { exact: true })
      .locator(
        "xpath=ancestor::div[contains(@class, 'group') and contains(@class, 'cursor-pointer')][1]",
      );
    await expect(fileRow).toBeVisible({ timeout: 30_000 });

    const exportButton = fileRow.getByRole("button", {
      name: "导出翻译后文件",
    });
    await expect(exportButton).toBeVisible({ timeout: 10_000 });
    await exportButton.click();
    await expect(page.getByText("成功创建导出任务")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("@lite-smoke schedules and inspects a localization task", async ({
    page,
  }) => {
    const projectId = getCreatedProjectId();
    await page.goto(`/project/${projectId}/zh-Hans`);
    const trigger = page.getByTitle("自动翻译").first();
    await expect(trigger).toBeVisible({ timeout: 30_000 });
    await trigger.click();

    const scheduled = page.waitForResponse(
      (response) =>
        response.url().includes("/api/rpc/translation/autoTranslate") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "确认", exact: true }).click();
    const response = await scheduled;
    if (!response.ok()) {
      throw new Error(
        `autoTranslate failed with ${response.status()}: ${await response.text()}`,
      );
    }
    await expect(page).toHaveURL(/\/workflows\/[0-9a-f-]+$/);

    await page.goto(`/project/${projectId}/tasks`);
    const taskLink = page.getByRole("button", { name: "批量自动翻译" }).first();
    await expect(taskLink).toBeVisible({ timeout: 30_000 });
    await taskLink.click();
    await expect(page.getByRole("heading", { name: "任务详情" })).toBeVisible();
    await expect(page.getByText("zh-Hans", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "受影响资源" }),
    ).toBeVisible();
  });
});
