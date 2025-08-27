import { test, expect } from "@playwright/test";
import { join } from "path";

test("create project", async ({ page }) => {
  await page.goto("http://localhost:3000/auth");
  await page.getByTestId("EMAIL_PASSWORD").click();
  await page.locator('input[type="email"]').click();
  await page.locator('input[type="email"]').fill("admin@encmys.cn");
  await page.locator('input[type="password"]').click();
  await page.locator('input[type="password"]').fill("password");
  await page.getByRole("button", { name: "登录" }).click();
  await page.getByText("翻译文件").click();
  await page.getByRole("textbox", { name: "项目名称" }).click();
  await page.getByRole("textbox", { name: "项目名称" }).fill("Test Project");
  await page.getByRole("textbox", { name: "选择一个语言" }).click();
  await page.getByText("简体中文").first().click();
  await page.getByRole("textbox", { name: "选择一个或多个语言" }).click();
  await page.getByText("English").click();
  await page.getByRole("textbox", { name: "用于描述项目的简短文本" }).click();
  await page
    .getByRole("textbox", { name: "用于描述项目的简短文本" })
    .fill("Test Desc");
  await page.getByRole("button", { name: "创建项目" }).click();

  // 文件上传
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "选择文件" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(join(import.meta.dirname, "../assets/zh_cn.json"));
  await page.getByRole("button", { name: "上传所有" }).click();
  await page.waitForResponse(
    (response) =>
      response.url().includes("document.fileUploadURL") &&
      response.status() === 200,
  );
  await page.getByRole("button", { name: "项目" }).click();

  await page.getByRole("cell", { name: "Test Project" }).click();
  await page.getByText("文档").click();
  await expect(page.locator("#app")).toMatchAriaSnapshot(`
    - table:
      - rowgroup:
        - row /zh_cn\\.json \\d+/:
          - cell "zh_cn.json"
          - cell /\\d+/
    `);
});
