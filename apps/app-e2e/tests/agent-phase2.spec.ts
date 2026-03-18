import type { Page } from "@playwright/test";

import { expect, test } from "@/fixtures.ts";

type RpcResponse<T> = {
  status: number;
  body: T;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const callRpc = async <T>(
  page: Page,
  procedure: string,
  payload: Record<string, unknown>,
): Promise<RpcResponse<T>> => {
  const response = await page.request.post(`/api/rpc/${procedure}`, {
    data: payload,
  });

  const body = (await response.json()) as unknown;
  if (!isRecord(body)) {
    throw new Error(`RPC ${procedure} returned non-object JSON`);
  }

  return {
    status: response.status(),
    // oxlint-disable-next-line no-unsafe-type-assertion -- body is narrowed to Record<string, unknown> via isRecord guard above
    body: body as T,
  };
};

test("phase2 agent page: enable and disable builtin agent", async ({
  page,
  testId,
}) => {
  const projectName = `AGENT-${testId}`;

  // 1) Create project
  await page.goto("http://localhost:3000/");
  await page.getByRole("button", { name: "创建项目" }).click();
  await page.getByRole("textbox", { name: "名称" }).fill(projectName);
  await page
    .getByRole("textbox", { name: "简介" })
    .fill(`Agent E2E project ${testId}`);

  await page
    .getByTestId("create-project-multi-language-picker")
    .getByRole("button", { name: "Show popup" })
    .click();
  await page.getByRole("combobox", { name: "选择一个或多个语言" }).fill("en");
  await page.getByRole("option", { name: "en", exact: true }).click();
  await page.getByRole("button", { name: "创建项目" }).click();
  await page.getByRole("button", { name: "先不上传文件" }).click();
  await page.getByRole("button", { name: "前往项目界面" }).click();

  await expect(page).toHaveURL(/\/project\/[\w-]+/);

  // 2) Navigate to Agent management page
  await page.getByRole("link", { name: "Agent" }).click();
  await expect(page).toHaveURL(/\/project\/[\w-]+\/agents$/);
  await expect(page.getByRole("heading", { name: "内置 Agent" })).toBeVisible();

  // 3) Enable one builtin agent
  await page.getByRole("button", { name: "启用" }).first().click();
  await expect(page.getByRole("button", { name: "确认启用" })).toBeVisible();
  await page.getByRole("button", { name: "确认启用" }).click();

  await expect(page.getByText("已启用").first()).toBeVisible();

  // 4) Disable the enabled builtin agent
  await page.getByRole("button", { name: "停用" }).first().click();
  await expect(
    page.getByRole("button", { name: "启用" }).first(),
  ).toBeVisible();

  // 5) Cleanup project
  await page.getByRole("link", { name: "设置" }).click();
  page.on("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除项目" }).click();
  await expect(page).toHaveURL(/\/projects$/);
});

test("phase2 graph api: lifecycle and confirmation endpoints", async ({
  page,
}) => {
  await page.goto("http://localhost:3000/");

  const start = await callRpc<{ runId?: string }>(page, "agent/graphStart", {
    graphId: "react-loop",
    input: { source: "e2e-ci" },
  });
  expect(start.status).toBe(200);

  const runId = start.body.runId;
  expect(typeof runId).toBe("string");
  expect(runId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );

  const pause = await callRpc<{ ok?: boolean }>(page, "agent/graphPause", {
    runId,
  });
  expect(pause.status).toBe(200);
  expect(pause.body.ok).toBe(true);

  const resume = await callRpc<{ ok?: boolean }>(page, "agent/graphResume", {
    runId,
  });
  expect(resume.status).toBe(200);
  expect(resume.body.ok).toBe(true);

  const status = await callRpc<{
    metadata?: unknown;
    snapshot?: unknown;
  }>(page, "agent/graphStatus", { runId });
  expect(status.status).toBe(200);
  expect(isRecord(status.body)).toBe(true);
  expect("metadata" in status.body).toBe(true);

  const confirm = await callRpc<{ ok?: boolean }>(
    page,
    "agent/submitToolConfirmResponse",
    {
      runId,
      nodeId: "act",
      response: {
        callId: "e2e-call-id",
        decision: "allow_once",
      },
    },
  );
  expect(confirm.status).toBe(200);
  expect(confirm.body.ok).toBe(true);

  const cancel = await callRpc<{ ok?: boolean }>(page, "agent/graphCancel", {
    runId,
  });
  expect(cancel.status).toBe(200);
  expect(cancel.body.ok).toBe(true);
});
