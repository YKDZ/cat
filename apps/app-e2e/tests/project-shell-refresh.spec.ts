import { test, expect } from "#/fixtures.ts";
import { gotoHydrated, reloadHydrated } from "#/pages/app-navigation.ts";

test.describe("Project shell SSR refresh", () => {
  test("refreshes project pull request list without losing header project data", async ({
    page,
    refs,
  }) => {
    const projectId = refs["project"];

    await gotoHydrated(page, `/project/${projectId}/pull-requests`);
    await page.waitForLoadState("networkidle");
    await reloadHydrated(page, { waitUntil: "networkidle" });

    await expect(page.getByRole("navigation")).toContainText("拉取请求");
    await expect(page.getByText("main").first()).toBeVisible();
  });

  test("refreshes project workflow list without losing shell navbar", async ({
    page,
    refs,
  }) => {
    const projectId = refs["project"];

    await gotoHydrated(page, `/project/${projectId}/workflows`);
    await page.waitForLoadState("networkidle");
    await reloadHydrated(page, { waitUntil: "networkidle" });

    await expect(page.getByRole("navigation")).toContainText("工作流");
    await expect(page.getByText("main").first()).toBeVisible();
  });
});
