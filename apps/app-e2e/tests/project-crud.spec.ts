import { expect, test } from "@/fixtures.ts";

test("project lifecycle: create, update, delete", async ({ page, testId }) => {
  const projectName = `CRUD-${testId}`;
  const updatedName = `Updated-${testId}`;

  // 1. Create Project
  // Note: Authentication is handled by the fixture
  await page.goto("http://localhost:3000/");

  // Click "Create Project" on creation card or dashboard
  await page.getByRole("button", { name: "创建项目" }).click();

  // Fill Project Name
  await page.getByRole("textbox", { name: "名称" }).click();
  await page.getByRole("textbox", { name: "名称" }).fill(projectName);

  // Fill Description (Optional but good practice)
  await page.getByRole("textbox", { name: "简介" }).click();
  await page
    .getByRole("textbox", { name: "简介" })
    .fill(`Description for ${testId}`);

  // Select Target Language "en"
  await page
    .getByTestId("create-project-multi-language-picker")
    .getByRole("button", { name: "Show popup" })
    .click();
  await page.getByRole("combobox", { name: "选择一个或多个语言" }).click();
  await page.getByRole("combobox", { name: "选择一个或多个语言" }).fill("en");
  await page.getByRole("option", { name: "en", exact: true }).click();
  // Close popup by clicking "Create Project" (assuming it overlaps or closes on create)
  // Or simply click Create.
  await page.getByRole("button", { name: "创建项目" }).click();

  // Skip File Upload
  await page.getByRole("button", { name: "先不上传文件" }).click();

  // Go to Project Dashboard
  await page.getByRole("button", { name: "前往项目界面" }).click();

  // 2. Verify Project Dashboard
  // URL should confirm we are in a project
  await expect(page).toHaveURL(/\/project\/[\w-]+/);
  // Navbar should contain "设置" (Settings)
  await expect(page.getByRole("link", { name: "设置" })).toBeVisible();

  // 3. Rename Project
  await page.getByRole("link", { name: "设置" }).click();
  await expect(page).toHaveURL(/\/settings$/);

  // Fill new name
  await page.getByLabel("项目名称").click();
  await page.getByLabel("项目名称").fill(updatedName);
  await page.getByRole("button", { name: "重命名" }).click();

  // Verify Rename (Check input value persists)
  await expect(page.getByLabel("项目名称")).toHaveValue(updatedName);

  // 4. Delete Project
  // Handle any potential dialogs (though implementation suggests direct delete)
  page.on("dialog", (dialog) => dialog.accept());

  await page.getByRole("button", { name: "删除项目" }).click();

  // 5. Verify Deletion
  // Should redirect to /projects
  await expect(page).toHaveURL(/\/projects$/);

  // The deleted project should not be visible in the list
  await expect(page.getByText(updatedName)).not.toBeVisible();
});
