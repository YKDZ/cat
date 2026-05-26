import { test, expect } from "@/fixtures";

test.describe("Project shell SSR refresh", () => {
  test("refreshes project pull request list without losing header project data", async ({
    page,
    refs,
  }) => {
    const projectId = refs["project"];

    await page.goto(`/project/${projectId}/pull-requests`);
    await page.reload({ waitUntil: "networkidle" });

    await expect(page.getByRole("navigation")).toContainText("拉取请求");
    await expect(page.getByText("main").first()).toBeVisible();
  });

  test("refreshes project workflow list without losing shell navbar", async ({
    page,
    refs,
  }) => {
    const projectId = refs["project"];

    await page.goto(`/project/${projectId}/workflows`);
    await page.reload({ waitUntil: "networkidle" });

    await expect(page.getByRole("navigation")).toContainText("工作流");
    await expect(page.getByText("main").first()).toBeVisible();
  });
});
