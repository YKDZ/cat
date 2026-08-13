import { writeFileSync } from "node:fs";

import {
  RecallDerivationReferenceSchema,
  TaskKindSchema,
  TaskStateSchema,
  TaskStatusSchema,
  type RecallDerivationReference,
  type TaskAffectedResource,
  type TaskStatus,
} from "@cat/shared";
import type { Locator, Page, Request, Response } from "@playwright/test";

import { test, expect } from "#/fixtures.ts";
import { gotoHydrated } from "#/pages/app-navigation.ts";

import {
  paginationFixtureCount,
  taskPaginationFixtureCount,
} from "../pagination-fixture.ts";

const uploadedFileName = "lite-smoke.json";

let createdProjectId: string | null = null;

const getCreatedProjectId = () => {
  if (!createdProjectId) {
    throw new Error("Lite smoke project was not created in the setup test.");
  }

  return createdProjectId;
};

type TaskListItem = Readonly<{ id: string; state: { status: TaskStatus } }>;

type TaskListPage = Readonly<{
  hasMore: boolean;
  items: readonly TaskListItem[];
  nextCursor: Readonly<{ id: string; updatedAt: string }> | null;
  total: number;
}>;

const parseTaskListPage = (body: unknown): TaskListPage => {
  if (typeof body !== "object" || body === null) {
    throw new Error("task.list response was not an object");
  }
  const payload = "json" in body ? body.json : "ret" in body ? body.ret : body;
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
  if (
    !("hasMore" in payload) ||
    typeof payload.hasMore !== "boolean" ||
    !("nextCursor" in payload) ||
    !("total" in payload) ||
    typeof payload.total !== "number"
  ) {
    throw new Error("task.list response did not contain page metadata");
  }
  const nextCursor = payload.nextCursor;
  const nextCursorId =
    nextCursor === null || typeof nextCursor !== "object"
      ? undefined
      : Reflect.get(nextCursor, "id");
  const nextCursorUpdatedAt =
    nextCursor === null || typeof nextCursor !== "object"
      ? undefined
      : Reflect.get(nextCursor, "updatedAt");
  if (
    nextCursor !== null &&
    (typeof nextCursorId !== "string" ||
      typeof nextCursorUpdatedAt !== "string")
  ) {
    throw new Error("task.list response did not contain a valid next cursor");
  }
  const items = payload.items.map((item) => {
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
  return {
    hasMore: payload.hasMore,
    items,
    nextCursor:
      nextCursor === null
        ? null
        : { id: nextCursorId, updatedAt: nextCursorUpdatedAt },
    total: payload.total,
  };
};

const parseTaskListResponse = (body: unknown): readonly TaskListItem[] =>
  parseTaskListPage(body).items;

type RecallTaskListItem = Readonly<{
  id: string;
  references: readonly RecallDerivationReference[];
  resources: readonly TaskAffectedResource[];
}>;

type RecallTaskListPage = Readonly<{
  itemCount: number;
  items: readonly RecallTaskListItem[];
}>;

type RecallTaskDetail = Readonly<{
  id: string;
  resources: readonly TaskAffectedResource[];
  state: TaskStatus;
  total: number | null;
  result: Readonly<{
    failed: number;
    fresh: number;
    superseded: number;
    total: number;
  }> | null;
}>;

const taskResourceLabel: Record<TaskAffectedResource["type"], string> = {
  ELEMENT: "元素",
  GLOSSARY: "术语库",
  MEMORY: "记忆库",
  PROJECT: "项目",
  TRANSLATION: "翻译",
};

const taskListItems = (body: unknown): readonly unknown[] => {
  if (typeof body !== "object" || body === null) {
    throw new Error("task.list response was not an object");
  }
  const payload = "json" in body ? body.json : "ret" in body ? body.ret : body;
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("items" in payload) ||
    !Array.isArray(payload.items)
  ) {
    throw new Error("task.list response did not contain items");
  }
  return payload.items;
};

const parseRecallTaskListPage = (body: unknown): RecallTaskListPage => {
  const items = taskListItems(body);
  return {
    itemCount: items.length,
    items: items.flatMap((item) => {
      if (typeof item !== "object" || item === null) {
        throw new Error("task.list item was not an object");
      }
      const id = Reflect.get(item, "id");
      if (typeof id !== "string") {
        throw new Error("task.list item did not contain an id");
      }
      const task = TaskKindSchema.parse(Reflect.get(item, "task"));
      if (task.kind !== "RECALL_DERIVATION") return [];
      const state = TaskStateSchema.parse(Reflect.get(item, "state"));
      return [
        {
          id,
          references: task.payload.references,
          resources: state.resources,
        },
      ];
    }),
  };
};

const parseRecallRebuildResponse = (
  body: unknown,
):
  | Readonly<{ status: "NO_WORK" }>
  | Readonly<{ status: "STARTED"; taskId: string }> => {
  if (typeof body !== "object" || body === null) {
    throw new Error("glossary.rebuildRecall response was not an object");
  }
  const payload = "json" in body ? body.json : "ret" in body ? body.ret : body;
  if (typeof payload !== "object" || payload === null) {
    throw new Error(
      "glossary.rebuildRecall response did not contain an object",
    );
  }
  const status = Reflect.get(payload, "status");
  if (status === "NO_WORK") return { status };
  const taskId = Reflect.get(payload, "taskId");
  if (status !== "STARTED" || typeof taskId !== "string") {
    throw new Error("glossary.rebuildRecall response did not start a Task");
  }
  return { status, taskId };
};

const parseRecallTaskDetailResponse = (body: unknown): RecallTaskDetail => {
  if (typeof body !== "object" || body === null) {
    throw new Error("task.detail response was not an object");
  }
  const payload = "json" in body ? body.json : "ret" in body ? body.ret : body;
  if (typeof payload !== "object" || payload === null) {
    throw new Error("task.detail response did not contain an object");
  }
  const task = Reflect.get(payload, "task");
  if (typeof task !== "object" || task === null) {
    throw new Error("task.detail response did not contain a Task");
  }
  const id = Reflect.get(task, "id");
  if (typeof id !== "string") {
    throw new Error("task.detail response Task did not contain an id");
  }
  const kind = TaskKindSchema.parse(Reflect.get(task, "task"));
  if (kind.kind !== "RECALL_DERIVATION") {
    throw new Error("task.detail response did not contain a Recall Task");
  }
  const state = TaskStateSchema.parse(Reflect.get(task, "state"));
  if (state.runtime.kind !== "RECALL_DERIVATION") {
    throw new Error("Recall Task detail contained another runtime kind");
  }
  return {
    id,
    resources: state.resources,
    result: state.runtime.result,
    state: state.status,
    total: state.progressTotal,
  };
};

const parseInsertTermRecallResult = (
  body: unknown,
): Readonly<{
  derivations: readonly RecallDerivationReference[];
  recallDerivationTaskId: string;
}> => {
  if (typeof body !== "object" || body === null) {
    throw new Error("glossary.insertTerm response was not an object");
  }
  const payload = "json" in body ? body.json : "ret" in body ? body.ret : body;
  if (typeof payload !== "object" || payload === null) {
    throw new Error("glossary.insertTerm response did not contain an object");
  }
  const taskId = Reflect.get(payload, "recallDerivationTaskId");
  const derivations = Reflect.get(payload, "derivations");
  if (typeof taskId !== "string" || !Array.isArray(derivations)) {
    throw new Error(
      "glossary.insertTerm response did not include a Recall derivation task",
    );
  }
  return {
    derivations: derivations.map((reference) =>
      RecallDerivationReferenceSchema.parse(reference),
    ),
    recallDerivationTaskId: taskId,
  };
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

type PagedResource = Readonly<{ id: string; name: string }>;

type TelefuncRequestPayload = Readonly<{
  args: readonly unknown[];
  name: string;
}>;

type BrowserTextContainer = Readonly<{
  clientWidth: number;
  querySelector: (selector: string) => unknown;
  scrollWidth: number;
  textContent: string | null;
}>;

const parsePagedResourceResponse = (
  body: unknown,
): Readonly<{ data: readonly PagedResource[]; total: number }> => {
  if (typeof body !== "object" || body === null) {
    throw new Error("Controlled table response was not an object.");
  }
  const payload = "json" in body ? body.json : "ret" in body ? body.ret : body;
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("data" in payload) ||
    !Array.isArray(payload.data) ||
    !("total" in payload) ||
    typeof payload.total !== "number"
  ) {
    throw new Error(
      "Controlled table response did not contain data and total.",
    );
  }
  const data = payload.data.map((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("id" in item) ||
      typeof item.id !== "string" ||
      !("name" in item) ||
      typeof item.name !== "string"
    ) {
      throw new Error(
        "Controlled table response item did not contain an id and name.",
      );
    }
    return { id: item.id, name: item.name };
  });
  return { data, total: payload.total };
};

const parseTelefuncRequest = (
  request: Request,
): TelefuncRequestPayload | null => {
  if (
    request.method() !== "POST" ||
    new URL(request.url()).pathname !== "/_telefunc"
  ) {
    return null;
  }

  let payload: unknown;
  try {
    payload = request.postDataJSON() as unknown;
  } catch {
    return null;
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("name" in payload) ||
    typeof payload.name !== "string" ||
    !("args" in payload) ||
    !Array.isArray(payload.args)
  ) {
    return null;
  }

  return { args: payload.args, name: payload.name };
};

const waitForTelefuncResponse = (page: Page, name: string): Promise<Response> =>
  page.waitForResponse(
    (response) => parseTelefuncRequest(response.request())?.name === name,
  );

const selectOpenLanguage = async (
  page: Page,
  trigger: Locator,
  language: string,
): Promise<void> => {
  await expect(trigger).toHaveCount(1);
  await trigger.click();

  const search = page.locator(
    'input[role="combobox"][placeholder="选择一个语言..."][aria-expanded="true"]',
  );
  await expect(search).toHaveCount(1);
  await search.fill(language);

  const option = page.getByRole("option", { name: language, exact: true });
  await expect(option).toHaveCount(1);
  await option.click();
};

const expectOffsetRequest = (
  response: Response,
  pageIndex: number,
  pageSize: number,
): void => {
  const payload = parseTelefuncRequest(response.request());
  if (payload === null) {
    throw new Error(
      "Controlled table request did not include serialized args.",
    );
  }
  expect(payload.args).toEqual([pageIndex, pageSize]);
};

const expectFilteredOffsetRequest = (
  response: Response,
  pageIndex: number,
  pageSize: number,
  search: string,
): void => {
  const payload = parseTelefuncRequest(response.request());
  if (payload === null) {
    throw new Error(
      "Controlled table filter request did not include serialized args.",
    );
  }
  expect(payload.args).toEqual([pageIndex, pageSize, search]);
};

const expectSortedOffsetRequest = (
  response: Response,
  pageIndex: number,
  pageSize: number,
  desc: boolean,
): void => {
  const payload = parseTelefuncRequest(response.request());
  if (payload === null) {
    throw new Error(
      "Controlled table sort request did not include serialized args.",
    );
  }
  expect(payload.args).toEqual([
    pageIndex,
    pageSize,
    null,
    { desc, id: "name" },
  ]);
};

const expectTaskListRequest = (
  response: Response,
  input: Readonly<{
    cursor?: Readonly<{ id: string; updatedAt: string }>;
    projectId: string;
    status?: TaskStatus;
  }>,
): void => {
  let body: unknown;
  try {
    body = response.request().postDataJSON() as unknown;
  } catch {
    throw new Error("task.list request did not include JSON input");
  }
  if (typeof body !== "object" || body === null || !("json" in body)) {
    throw new Error("task.list request did not include an oRPC JSON envelope");
  }
  const payload = body.json;
  if (typeof payload !== "object" || payload === null) {
    throw new Error("task.list request did not include an object input");
  }
  expect(payload).toMatchObject({ pageSize: 20, projectId: input.projectId });
  if (input.cursor === undefined) expect("cursor" in payload).toBe(false);
  else expect(Reflect.get(payload, "cursor")).toEqual(input.cursor);
  if (input.status === undefined) expect("status" in payload).toBe(false);
  else expect(Reflect.get(payload, "status")).toBe(input.status);
};

const expectTableControlsToFit = async (
  page: import("@playwright/test").Page,
  viewportWidth: number,
): Promise<void> => {
  const table = page.locator("[data-data-table]");
  const textOverflow = await table.evaluate((element) => {
    const regions = [
      element.querySelector(":scope > div:first-child"),
      element.querySelector(":scope > footer"),
    ];
    const toolbarOrFooterOverflow = regions.some((region) => {
      if (region === null || region.scrollWidth <= region.clientWidth + 1) {
        return false;
      }
      return region.textContent?.trim() !== "";
    });
    const tableTextEscapesCell = (
      Array.from(element.querySelectorAll("th, td")) as BrowserTextContainer[]
    ).some((cell) => {
      return (
        cell.textContent?.trim() !== "" &&
        cell.scrollWidth > cell.clientWidth + 1 &&
        cell.querySelector("[class*='truncate']") === null
      );
    });
    return toolbarOrFooterOverflow || tableTextEscapesCell;
  });
  expect(textOverflow).toBe(false);

  const controls = await table
    .locator(
      ":scope > div:first-child button, :scope > div:first-child select, :scope > footer button, :scope > footer select",
    )
    .evaluateAll((elements) =>
      elements
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            top: rect.top,
          };
        })
        .filter((rect) => rect.right > rect.left && rect.bottom > rect.top),
    );
  for (const control of controls) {
    expect(control.right).toBeLessThanOrEqual(viewportWidth);
    expect(control.left).toBeGreaterThanOrEqual(0);
  }
  for (const [index, control] of controls.entries()) {
    for (const other of controls.slice(index + 1)) {
      const overlaps =
        control.left < other.right &&
        control.right > other.left &&
        control.top < other.bottom &&
        control.bottom > other.top;
      expect(overlaps).toBe(false);
    }
  }
};

const expectTaskRowsToMatchResponse = async (
  page: import("@playwright/test").Page,
  items: readonly TaskListItem[],
): Promise<void> => {
  const rows = page.locator("tbody tr[data-row-id]");
  await expect(rows).toHaveCount(items.length);
  const domItems = await rows.evaluateAll((elements) =>
    elements.map((element) => ({
      id: element.getAttribute("data-row-id"),
      status: element.children[1]?.textContent?.trim() ?? null,
    })),
  );
  expect(domItems).toEqual(
    items.map((item) => ({
      id: item.id,
      status: taskStatusLabel(item.state.status),
    })),
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
      components: {
        "language-analysis": { code: "OK", status: "ready" },
      },
      status: "ready",
    });
  });

  test("@lite-smoke admits a first source distinct from project targets without changing membership", async ({
    page,
  }) => {
    await gotoHydrated(page, "/");
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

    await gotoHydrated(page, `/project/${createdProjectId}/zh-Hans`);
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

    const projectResponse = await gotoHydrated(
      page,
      `/project/${projectId}/zh-Hans`,
    );
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

  test("@lite-smoke lists projects, memories, and glossaries through the controlled table", async ({
    page,
    refs,
  }) => {
    const tables = [
      {
        request: "onRequestProjects",
        resource: "project",
        route: "/projects",
        target: "/project/",
      },
      {
        request: "onRequestMemories",
        resource: "memory",
        route: "/memories",
        target: "/memory/",
      },
      {
        request: "onRequestGlossaries",
        resource: "glossary",
        route: "/glossaries",
        target: "/glossary/",
      },
    ] as const;

    for (const table of tables) {
      const initialRequest = waitForTelefuncResponse(page, table.request);
      await gotoHydrated(page, table.route);
      const initialResponse = await initialRequest;
      if (!initialResponse.ok()) {
        throw new Error(
          `${table.request} failed with ${initialResponse.status()}: ${await initialResponse.text()}`,
        );
      }
      const firstPage = parsePagedResourceResponse(
        await initialResponse.json(),
      );
      expect(firstPage.total).toBeGreaterThanOrEqual(paginationFixtureCount);
      expect(firstPage.data).toHaveLength(10);

      const firstPageRows = page.locator("tbody tr[data-row-id]");
      await expect(firstPageRows).toHaveCount(firstPage.data.length);
      await expect(firstPageRows.first()).toHaveAttribute(
        "data-row-id",
        firstPage.data[0]?.id ?? "",
      );

      const pageSizeRequest = waitForTelefuncResponse(page, table.request);
      await page.getByLabel("每页条数").selectOption("20");
      const pageSizeResponse = await pageSizeRequest;
      if (!pageSizeResponse.ok()) {
        throw new Error(
          `${table.request} page-size request failed with ${pageSizeResponse.status()}: ${await pageSizeResponse.text()}`,
        );
      }
      expectOffsetRequest(pageSizeResponse, 0, 20);
      expect(
        parsePagedResourceResponse(await pageSizeResponse.json()).data,
      ).toHaveLength(Math.min(firstPage.total, 20));

      const resetPageSizeRequest = waitForTelefuncResponse(page, table.request);
      await page.getByLabel("每页条数").selectOption("10");
      const resetPageSizeResponse = await resetPageSizeRequest;
      if (!resetPageSizeResponse.ok()) {
        throw new Error(
          `${table.request} reset page-size request failed with ${resetPageSizeResponse.status()}: ${await resetPageSizeResponse.text()}`,
        );
      }
      expectOffsetRequest(resetPageSizeResponse, 0, 10);

      const nextPageRequest = waitForTelefuncResponse(page, table.request);
      await page.getByTitle("下一页").click();
      const nextPageResponse = await nextPageRequest;
      if (!nextPageResponse.ok()) {
        throw new Error(
          `${table.request} next page request failed with ${nextPageResponse.status()}: ${await nextPageResponse.text()}`,
        );
      }
      expectOffsetRequest(nextPageResponse, 1, 10);
      const secondPage = parsePagedResourceResponse(
        await nextPageResponse.json(),
      );
      expect(secondPage.data).not.toEqual(firstPage.data);
      await expect(
        page.getByText(`2 / ${Math.ceil(firstPage.total / 10)}`),
      ).toBeVisible();
      await expect(firstPageRows).toHaveCount(secondPage.data.length);
      await expect(firstPageRows.first()).toHaveAttribute(
        "data-row-id",
        secondPage.data[0]?.id ?? "",
      );

      const previousPageRequest = waitForTelefuncResponse(page, table.request);
      await page.getByTitle("上一页").click();
      const previousPageResponse = await previousPageRequest;
      if (!previousPageResponse.ok()) {
        throw new Error(
          `${table.request} previous page request failed with ${previousPageResponse.status()}: ${await previousPageResponse.text()}`,
        );
      }
      expectOffsetRequest(previousPageResponse, 0, 10);
      expect(
        parsePagedResourceResponse(await previousPageResponse.json()).data,
      ).toEqual(firstPage.data);
      await expect(
        page.getByText(`1 / ${Math.ceil(firstPage.total / 10)}`),
      ).toBeVisible();

      const searchText = `E2E pagination ${table.resource} 11`;
      const filteredRequest = waitForTelefuncResponse(page, table.request);
      await page.getByLabel("搜索名称或描述").fill(searchText);
      const filteredResponse = await filteredRequest;
      if (!filteredResponse.ok()) {
        throw new Error(
          `${table.request} search request failed with ${filteredResponse.status()}: ${await filteredResponse.text()}`,
        );
      }
      expectFilteredOffsetRequest(filteredResponse, 0, 10, searchText);
      const filteredPage = parsePagedResourceResponse(
        await filteredResponse.json(),
      );
      expect(filteredPage.total).toBe(1);
      expect(filteredPage.data).toHaveLength(1);
      await expect(firstPageRows).toHaveCount(filteredPage.data.length);
      await expect(page.getByText("1 / 1")).toBeVisible();
      await expect(firstPageRows.first()).toHaveAttribute(
        "data-row-id",
        filteredPage.data[0]?.id ?? "",
      );
      await expect(firstPageRows.first()).toContainText(searchText);

      const clearedRequest = waitForTelefuncResponse(page, table.request);
      await page.getByLabel("搜索名称或描述").fill("");
      const clearedResponse = await clearedRequest;
      if (!clearedResponse.ok()) {
        throw new Error(
          `${table.request} clear-filter request failed with ${clearedResponse.status()}: ${await clearedResponse.text()}`,
        );
      }
      expectOffsetRequest(clearedResponse, 0, 10);

      const ascendingRequest = waitForTelefuncResponse(page, table.request);
      await page.getByRole("button", { name: "名称", exact: true }).click();
      const ascendingResponse = await ascendingRequest;
      if (!ascendingResponse.ok()) {
        throw new Error(
          `${table.request} ascending sort request failed with ${ascendingResponse.status()}: ${await ascendingResponse.text()}`,
        );
      }
      expectSortedOffsetRequest(ascendingResponse, 0, 10, false);
      const ascendingPage = parsePagedResourceResponse(
        await ascendingResponse.json(),
      );
      const ascendingNames = ascendingPage.data.map((item) => item.name);
      expect(ascendingNames.length).toBeGreaterThan(1);
      expect(ascendingNames).toEqual(
        ascendingNames.toSorted((left, right) => left.localeCompare(right)),
      );
      await expect(firstPageRows).toHaveCount(ascendingNames.length);
      expect(
        await firstPageRows.locator("td:first-child").allTextContents(),
      ).toEqual(ascendingNames);

      const descendingRequest = waitForTelefuncResponse(page, table.request);
      await page.getByRole("button", { name: "名称", exact: true }).click();
      const descendingResponse = await descendingRequest;
      if (!descendingResponse.ok()) {
        throw new Error(
          `${table.request} descending sort request failed with ${descendingResponse.status()}: ${await descendingResponse.text()}`,
        );
      }
      expectSortedOffsetRequest(descendingResponse, 0, 10, true);
      const descendingPage = parsePagedResourceResponse(
        await descendingResponse.json(),
      );
      const descendingNames = descendingPage.data.map((item) => item.name);
      expect(descendingNames).toEqual(
        descendingNames.toSorted((left, right) => right.localeCompare(left)),
      );
      await expect(firstPageRows).toHaveCount(descendingNames.length);
      expect(
        await firstPageRows.locator("td:first-child").allTextContents(),
      ).toEqual(descendingNames);

      const firstRow = page.locator("tbody tr[data-row-id]").first();
      await expect(firstRow).toBeVisible();
      await firstRow.locator("button[data-row-action]").press("Enter");
      await expect(page).toHaveURL(new RegExp(`^.+${table.target}`));
    }

    const tableRoutes = [
      "/projects",
      "/memories",
      "/glossaries",
      `/project/${refs.project}/tasks`,
    ];
    for (const route of tableRoutes) {
      await page.setViewportSize({ width: 1280, height: 960 });
      await gotoHydrated(page, route);
      await expect(page.locator("[data-data-table]")).toBeVisible();
      await expectTableControlsToFit(page, 1280);

      await page.setViewportSize({ width: 390, height: 844 });
      await expectTableControlsToFit(page, 390);
    }
  });

  test("@lite-smoke schedules and inspects a localization task", async ({
    page,
  }) => {
    const projectId = getCreatedProjectId();
    await gotoHydrated(page, `/project/${projectId}/zh-Hans`);
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

    await gotoHydrated(page, `/project/${projectId}/tasks`);
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
    await expectTaskRowsToMatchResponse(page, responseItems);
    for (const item of responseItems) {
      await expect(page.locator(`tr[data-row-id="${item.id}"]`)).toContainText(
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
    await expectTaskRowsToMatchResponse(page, filteredItems);
    for (const item of filteredItems) {
      expect(item.state.status).toBe(scheduledTask.state.status);
      await expect(page.locator(`tr[data-row-id="${item.id}"]`)).toContainText(
        taskStatusLabel(item.state.status),
      );
    }
  });

  test("@lite-smoke cursor-paginates, filters, and opens Task rows", async ({
    page,
    refs,
  }) => {
    const projectId = refs.project;
    await gotoHydrated(page, `/project/${projectId}/tasks`);

    const firstRequest = page.waitForResponse(
      (response) =>
        response.url().includes("/api/rpc/task/list") &&
        response.request().method() === "POST",
    );
    await page.getByTitle("刷新").click();
    const firstResponse = await firstRequest;
    if (!firstResponse.ok()) {
      throw new Error(
        `first Task page failed with ${firstResponse.status()}: ${await firstResponse.text()}`,
      );
    }
    expectTaskListRequest(firstResponse, { projectId });
    const firstPage = parseTaskListPage(await firstResponse.json());
    expect(firstPage.total).toBeGreaterThanOrEqual(taskPaginationFixtureCount);
    expect(firstPage.hasMore).toBe(true);
    if (firstPage.nextCursor === null) {
      throw new Error(
        "first Task page did not expose a cursor for the next page",
      );
    }
    await expectTaskRowsToMatchResponse(page, firstPage.items);

    const nextRequest = page.waitForResponse(
      (response) =>
        response.url().includes("/api/rpc/task/list") &&
        response.request().method() === "POST",
    );
    await page.getByTitle("下一页").click();
    const nextResponse = await nextRequest;
    if (!nextResponse.ok()) {
      throw new Error(
        `next Task page failed with ${nextResponse.status()}: ${await nextResponse.text()}`,
      );
    }
    expectTaskListRequest(nextResponse, {
      cursor: firstPage.nextCursor,
      projectId,
    });
    const secondPage = parseTaskListPage(await nextResponse.json());
    expect(secondPage.items).not.toEqual(firstPage.items);
    await expectTaskRowsToMatchResponse(page, secondPage.items);
    await expect(page.getByTitle("上一页")).toBeEnabled();
    if (secondPage.hasMore) {
      await expect(page.getByTitle("下一页")).toBeEnabled();
    } else {
      await expect(page.getByTitle("下一页")).toBeDisabled();
    }

    const previousRequest = page.waitForResponse(
      (response) =>
        response.url().includes("/api/rpc/task/list") &&
        response.request().method() === "POST",
    );
    await page.getByTitle("上一页").click();
    const previousResponse = await previousRequest;
    if (!previousResponse.ok()) {
      throw new Error(
        `previous Task page failed with ${previousResponse.status()}: ${await previousResponse.text()}`,
      );
    }
    expectTaskListRequest(previousResponse, { projectId });
    expect(parseTaskListPage(await previousResponse.json()).items).toEqual(
      firstPage.items,
    );
    await expectTaskRowsToMatchResponse(page, firstPage.items);

    const filteredRequest = page.waitForResponse(
      (response) =>
        response.url().includes("/api/rpc/task/list") &&
        response.request().method() === "POST",
    );
    await page.getByLabel("状态").selectOption("COMPLETED");
    const filteredResponse = await filteredRequest;
    if (!filteredResponse.ok()) {
      throw new Error(
        `Task status filter failed with ${filteredResponse.status()}: ${await filteredResponse.text()}`,
      );
    }
    expectTaskListRequest(filteredResponse, { projectId, status: "COMPLETED" });
    const filteredPage = parseTaskListPage(await filteredResponse.json());
    expect(filteredPage.items.length).toBeGreaterThan(0);
    expect(
      filteredPage.items.every((item) => item.state.status === "COMPLETED"),
    ).toBe(true);
    await expectTaskRowsToMatchResponse(page, filteredPage.items);

    const firstRow = page.locator("tbody tr[data-row-id]").first();
    const selectedTaskId = await firstRow.getAttribute("data-row-id");
    if (selectedTaskId === null) {
      throw new Error("Task row did not expose its task ID");
    }
    await firstRow.locator("button[data-row-action]").press("Enter");
    await expect(page).toHaveURL(/\/tasks\?taskId=[0-9a-f-]+$/);
    expect(new URL(page.url()).searchParams.get("taskId")).toBe(selectedTaskId);
    await expect(page.getByRole("heading", { name: "任务详情" })).toBeVisible();
  });

  test("@lite-smoke creates and filters a Recall derivation Task through the glossary UI", async ({
    page,
    refs,
  }) => {
    const projectId = refs["project"];
    const glossaryId = refs["glossary"];

    await gotoHydrated(page, `/project/${projectId}/glossaries`);
    const glossaryLink = page.getByRole("link", {
      name: "E2E Glossary",
      exact: true,
    });
    await expect(glossaryLink).toHaveAttribute(
      "href",
      `/glossary/${glossaryId}`,
    );
    await glossaryLink.click();
    await expect(page).toHaveURL(`/glossary/${glossaryId}`);

    await page.getByRole("button", { name: "插入术语" }).click();
    await page.getByRole("tab", { name: "文本" }).click();
    await selectOpenLanguage(
      page,
      page
        .getByRole("group", { name: "术语语言", exact: true })
        .getByRole("button", { name: "选择一个语言...", exact: true }),
      "en",
    );
    await selectOpenLanguage(
      page,
      page
        .getByRole("group", { name: "翻译语言", exact: true })
        .getByRole("button", { name: "选择一个语言...", exact: true }),
      "zh-Hans",
    );
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
    const insertedRecall = parseInsertTermRecallResult(
      await insertResponse.json(),
    );
    expect(insertedRecall.derivations.length).toBeGreaterThan(0);
    await gotoHydrated(page, `/project/${projectId}/tasks`);
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
    let recallPage = parseRecallTaskListPage(await response.json());
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (
        recallPage.items.some(
          (item) => item.id === insertedRecall.recallDerivationTaskId,
        )
      ) {
        break;
      }
      const refreshed = page.waitForResponse(
        (candidate) =>
          candidate.url().includes("/api/rpc/task/list") &&
          candidate.request().method() === "POST",
      );
      await page.getByTitle("刷新").click();
      const refreshedResponse = await refreshed;
      if (!refreshedResponse.ok()) {
        throw new Error(
          `Recall task refresh failed with ${refreshedResponse.status()}: ${await refreshedResponse.text()}`,
        );
      }
      recallPage = parseRecallTaskListPage(await refreshedResponse.json());
    }
    expect(recallPage.itemCount).toBe(recallPage.items.length);
    const createdRecallTask = recallPage.items.find(
      (item) => item.id === insertedRecall.recallDerivationTaskId,
    );
    if (createdRecallTask === undefined) {
      throw new Error(
        `task.list did not include newly created Recall task ${insertedRecall.recallDerivationTaskId}`,
      );
    }
    expect(createdRecallTask.references).toEqual(insertedRecall.derivations);
    expect(createdRecallTask.resources).toEqual(
      expect.arrayContaining([
        { type: "PROJECT", id: projectId },
        { type: "GLOSSARY", id: glossaryId },
      ]),
    );
    const rows = page.locator("tbody tr[data-row-id]");
    await expect(rows).toHaveCount(recallPage.items.length);
    const createdRow = page.locator(
      `tbody tr[data-row-id="${insertedRecall.recallDerivationTaskId}"]`,
    );
    await expect(createdRow).toContainText("召回派生");
    await expect(createdRow.locator("button[data-row-action]")).toBeVisible();
    await expect(page.getByTitle("重试")).toHaveCount(0);
    await expect(page.getByTitle("恢复")).toHaveCount(0);
    await createdRow.locator("button[data-row-action]").click();
    await expect(page).toHaveURL(
      new RegExp(`\\?taskId=${insertedRecall.recallDerivationTaskId}$`),
    );
    await expect(page.getByRole("heading", { name: "任务详情" })).toBeVisible();
  });

  test("@lite-smoke rebuilds glossary Recall through the UI and observes its public Task", async ({
    page,
    refs,
  }) => {
    const projectId = refs.project;
    const glossaryId = refs.glossary;
    await gotoHydrated(page, `/project/${projectId}/glossaries`);

    const glossaryRow = page.getByRole("row").filter({
      has: page.getByRole("link", { name: "E2E Glossary", exact: true }),
    });
    const rebuild = glossaryRow.getByTitle("重建术语召回");
    await expect(rebuild).toBeVisible();

    const rebuildResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/rpc/glossary/rebuildRecall") &&
        response.request().method() === "POST",
    );
    await rebuild.click();
    const response = await rebuildResponse;
    if (!response.ok()) {
      throw new Error(
        `glossary rebuild failed with ${response.status()}: ${await response.text()}`,
      );
    }
    const rebuildResult = parseRecallRebuildResponse(await response.json());
    if (rebuildResult.status !== "STARTED") {
      throw new Error("E2E glossary must contain terms to rebuild Recall");
    }

    const taskId = rebuildResult.taskId;
    await expect(page).toHaveURL(
      new RegExp(`/project/${projectId}/tasks\\?taskId=${taskId}$`),
    );
    await expect(page.getByRole("heading", { name: "任务详情" })).toBeVisible();

    const taskDetailButton = page.locator(
      `tbody tr[data-row-id="${taskId}"] button[data-row-action]`,
    );
    let detail: RecallTaskDetail | undefined;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const detailResponse = page.waitForResponse(
        (candidate) =>
          candidate.url().includes("/api/rpc/task/detail") &&
          candidate.request().method() === "POST",
      );
      await taskDetailButton.click();
      const response = await detailResponse;
      if (!response.ok()) {
        throw new Error(
          `Task detail failed with ${response.status()}: ${await response.text()}`,
        );
      }
      detail = parseRecallTaskDetailResponse(await response.json());
      if (
        detail.state === "COMPLETED" ||
        detail.state === "FAILED" ||
        detail.state === "CANCELED"
      ) {
        break;
      }
      await page.waitForTimeout(250);
    }

    if (
      detail === undefined ||
      detail.result === null ||
      detail.total === null
    ) {
      throw new Error(
        "Completed Recall rebuild did not expose a result and total.",
      );
    }
    expect(detail.id).toBe(taskId);
    expect(detail.state).toBe("COMPLETED");
    expect(detail.total).toBeGreaterThan(0);
    expect(detail.result.total).toBe(detail.total);
    expect(detail.result.fresh).toBe(detail.total);
    expect(detail.result.failed).toBe(0);
    expect(detail.result.superseded).toBe(0);
    expect(detail.resources).toEqual(
      expect.arrayContaining([
        { type: "PROJECT", id: projectId },
        { type: "GLOSSARY", id: glossaryId },
      ]),
    );

    const renderedDetail = page.locator('section[aria-label="任务详情"]');
    await expect(renderedDetail).toBeVisible();
    await expect(renderedDetail).toContainText("派生需求");
    const renderedResults = renderedDetail
      .getByRole("heading", { name: "结果" })
      .locator("..");
    await expect(renderedResults).toContainText(`新鲜: ${detail.result.fresh}`);
    await expect(renderedResults).toContainText("失败: 0");
    await expect(renderedResults).toContainText("已被替代: 0");
    const renderedResources = renderedDetail
      .getByRole("heading", { name: "受影响资源" })
      .locator("..");
    const renderedResourceItems = renderedResources.locator("li");
    await expect(renderedResourceItems).toHaveCount(detail.resources.length);
    await expect(renderedResourceItems).toHaveText(
      detail.resources.map(
        (resource) => `${taskResourceLabel[resource.type]} · ${resource.id}`,
      ),
    );
  });
});
