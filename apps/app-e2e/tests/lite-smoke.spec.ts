import { writeFileSync } from "node:fs";

import { TaskStatusSchema, type TaskStatus } from "@cat/shared";

import { test, expect } from "#/fixtures.ts";

const uploadedFileName = "lite-smoke.json";

let createdProjectId: string | null = null;

const getCreatedProjectId = () => {
  if (!createdProjectId) {
    throw new Error("Lite smoke project was not created in the setup test.");
  }

  return createdProjectId;
};

const parseTaskListResponse = (
  body: unknown,
): Array<{ id: string; state: { status: TaskStatus } }> => {
  if (typeof body !== "object" || body === null) {
    throw new Error("task.list response was not an object");
  }
  const payload = "json" in body ? body.json : body;
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("items" in payload)
  ) {
    throw new Error("task.list response did not contain items");
  }
  if (!Array.isArray(payload.items)) {
    throw new Error("task.list response items were not an array");
  }
  return payload.items.map((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("id" in item) ||
      typeof item.id !== "string" ||
      !("state" in item)
    ) {
      throw new Error("task.list response item did not contain id/state");
    }
    const state = item.state;
    if (typeof state !== "object" || state === null || !("status" in state)) {
      throw new Error("task.list response state did not contain status");
    }
    return {
      id: item.id,
      state: { status: TaskStatusSchema.parse(state.status) },
    };
  });
};

const taskStatusLabel = (status: TaskStatus): string =>
  (
    ({
      PENDING: "等待中",
      RUNNING: "运行中",
      BLOCKED: "已阻塞",
      CANCEL_REQUESTED: "取消请求中",
      COMPLETED: "已完成",
      FAILED: "失败",
      CANCELED: "已取消",
    }) satisfies Record<TaskStatus, string>
  )[status];

const expectTaskTableToMatchResponse = async (
  page: import("@playwright/test").Page,
  items: Array<{ id: string; state: { status: TaskStatus } }>,
): Promise<void> => {
  const rows = page.locator("tbody tr[data-task-id]");
  await expect(rows).toHaveCount(items.length);
  const domItems = await rows.evaluateAll((elements) =>
    elements.map((element) => ({
      id: element.getAttribute("data-task-id"),
      status: element.getAttribute("data-task-status"),
    })),
  );
  expect(domItems).toEqual(
    items.map((item) => ({ id: item.id, status: item.state.status })),
  );
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
    await expect(page).toHaveURL(
      new RegExp(`/project/${projectId}/tasks\\?taskId=[0-9a-f-]+$`),
    );
    const taskId = new URL(page.url()).searchParams.get("taskId");
    if (!taskId) throw new Error("autoTranslate did not navigate to a taskId");
    await expect(page.getByRole("heading", { name: "任务详情" })).toBeVisible();
    await expect(page.getByText("zh-Hans", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "受影响资源" }),
    ).toBeVisible();

    await page.goto(`/project/${projectId}/tasks`);
    await expect(page).toHaveURL(`/project/${projectId}/tasks`);
    const unfilteredList = page.waitForResponse(
      (candidate) =>
        candidate.url().includes("/api/rpc/task/list") &&
        candidate.request().method() === "POST",
    );
    await page.getByTitle("刷新").click();
    const unfilteredResponse = await unfilteredList;
    if (!unfilteredResponse.ok()) {
      throw new Error(
        `unfiltered task list failed with ${unfilteredResponse.status()}: ${await unfilteredResponse.text()}`,
      );
    }
    const responseItems = parseTaskListResponse(
      await unfilteredResponse.json(),
    );
    expect(responseItems.length).toBeGreaterThan(0);
    expect(new Set(responseItems.map((item) => item.id)).size).toBe(
      responseItems.length,
    );
    const scheduledTask = responseItems.find((item) => item.id === taskId);
    if (!scheduledTask) {
      throw new Error(`task.list did not include scheduled task ${taskId}`);
    }
    await expectTaskTableToMatchResponse(page, responseItems);
    for (const item of responseItems) {
      await expect(page.locator(`tr[data-task-id="${item.id}"]`)).toContainText(
        taskStatusLabel(item.state.status),
      );
    }

    const filteredList = page.waitForResponse(
      (candidate) =>
        candidate.url().includes("/api/rpc/task/list") &&
        candidate.request().method() === "POST",
    );
    await page.getByLabel("状态").selectOption(scheduledTask.state.status);
    const filteredResponse = await filteredList;
    if (!filteredResponse.ok()) {
      throw new Error(
        `task list filter failed with ${filteredResponse.status()}: ${await filteredResponse.text()}`,
      );
    }
    expect(filteredResponse.request().postData() ?? "").toContain(
      `"status":"${scheduledTask.state.status}"`,
    );
    const filteredItems = parseTaskListResponse(await filteredResponse.json());
    expect(filteredItems.length).toBeGreaterThan(0);
    expect(new Set(filteredItems.map((item) => item.id)).size).toBe(
      filteredItems.length,
    );
    expect(filteredItems.some((item) => item.id === taskId)).toBe(true);
    await expectTaskTableToMatchResponse(page, filteredItems);
    for (const item of filteredItems) {
      expect(item.state.status).toBe(scheduledTask.state.status);
      await expect(page.locator(`tr[data-task-id="${item.id}"]`)).toContainText(
        taskStatusLabel(item.state.status),
      );
    }
  });

  test("@lite-smoke creates and filters a Recall derivation Task through the glossary UI", async ({
    page,
    refs,
  }) => {
    const projectId = refs["project"];
    const glossaryId = refs["glossary"];
    if (!projectId || !glossaryId) {
      throw new Error(
        "Lite smoke seed did not provide a project and glossary.",
      );
    }

    await page.goto(`/project/${projectId}/glossaries`);
    const glossaryRow = page.locator("tbody tr").first();
    await expect(glossaryRow).toBeVisible();
    await glossaryRow.click();
    await expect(page).toHaveURL(`/glossary/${glossaryId}`);

    await page.getByRole("button", { name: "插入术语" }).click();
    await page.getByRole("tab", { name: "文本" }).click();
    const languagePickers = page.getByPlaceholder("选择一个语言...");
    await languagePickers.nth(0).fill("en");
    await page.getByRole("option", { name: "en", exact: true }).click();
    await languagePickers.nth(1).fill("zh-Hans");
    await page.getByRole("option", { name: "zh-Hans", exact: true }).click();
    const textareas = page.locator("textarea");
    await textareas.nth(0).fill("recall source");
    await textareas.nth(1).fill("召回目标");
    const inserted = page.waitForResponse(
      (response) =>
        response.url().includes("/api/rpc/glossary/insertTerm") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "提交", exact: true }).click();
    const insertResponse = await inserted;
    if (!insertResponse.ok()) {
      throw new Error(
        `glossary insert failed with ${insertResponse.status()}: ${await insertResponse.text()}`,
      );
    }

    await page.goto(`/project/${projectId}/tasks`);
    const filteredList = page.waitForResponse(
      (response) =>
        response.url().includes("/api/rpc/task/list") &&
        response.request().method() === "POST",
    );
    await page.getByLabel("任务类型").selectOption("RECALL_DERIVATION");
    const response = await filteredList;
    if (!response.ok()) {
      throw new Error(
        `Recall task filter failed with ${response.status()}: ${await response.text()}`,
      );
    }
    expect(response.request().postData() ?? "").toContain(
      '"kind":"RECALL_DERIVATION"',
    );
    const body = await response.json();
    const payload =
      typeof body === "object" && body !== null && "json" in body
        ? body.json
        : body;
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("items" in payload) ||
      !Array.isArray(payload.items)
    ) {
      throw new Error("Recall task filter response did not contain items.");
    }
    expect(payload.items.length).toBeGreaterThan(0);
    expect(
      payload.items.every(
        (item: unknown) =>
          typeof item === "object" &&
          item !== null &&
          "task" in item &&
          typeof item.task === "object" &&
          item.task !== null &&
          "kind" in item.task &&
          item.task.kind === "RECALL_DERIVATION",
      ),
    ).toBe(true);
    const rows = page.locator("tbody tr[data-task-id]");
    await expect(rows).toHaveCount(payload.items.length);
    await expect(rows).toContainText("召回派生");
    await expect(page.getByTitle("重试")).toHaveCount(0);
    await expect(page.getByTitle("恢复")).toHaveCount(0);
    await rows.first().getByRole("button", { name: "召回派生" }).click();
    await expect(page.getByRole("heading", { name: "任务详情" })).toBeVisible();
  });
});
