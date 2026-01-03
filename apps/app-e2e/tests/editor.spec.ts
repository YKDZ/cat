import { expect, test } from "@/fixtures.ts";

test("user create project", async ({ page, testId }) => {
  const projectName = `Test-${testId}`;

  await page.goto("http://localhost:3000/");

  await page.getByRole("button", { name: "创建项目" }).click();
  await page.getByRole("textbox", { name: "名称" }).click();
  await page.getByRole("textbox", { name: "名称" }).fill(projectName);
  await page.getByRole("textbox", { name: "简介" }).click();
  await page
    .getByRole("textbox", { name: "简介" })
    .fill(`My Test Project @${testId}`);
  await page
    .getByTestId("create-project-multi-language-picker")
    .getByRole("button", { name: "Show popup" })
    .click();
  await page.getByRole("combobox", { name: "选择一个或多个语言" }).click();
  await page.getByRole("combobox", { name: "选择一个或多个语言" }).fill("en");
  await page.getByRole("option", { name: "en", exact: true }).click();
  await page.getByRole("button", { name: "创建项目" }).click();
  await page.getByRole("button", { name: "先不上传文件" }).click();
  await page.getByRole("button", { name: "前往项目界面" }).click();

  await expect(page.getByRole("paragraph")).toMatchAriaSnapshot(
    `- paragraph: My Test Project @${testId}`,
  );
  await expect(page.getByRole("row")).toMatchAriaSnapshot(`- cell "en"`);
});
