import { test, expect } from "@playwright/test";

test("test", async ({ page }) => {
  await page.goto("http://localhost:3000/auth");
  await page.getByTestId("EMAIL_PASSWORD").click();
  await page.locator('input[type="email"]').click();
  await page.locator('input[type="email"]').fill("admin@encmys.cn");
  await page.locator('input[type="password"]').click();
  await page.locator('input[type="password"]').fill("password");
  await page.locator('input[type="password"]').press("Enter");
  await page.getByRole("button", { name: "项目" }).click();
  await page.getByRole("cell", { name: "test" }).click();
  await page
    .locator("div")
    .filter({ hasText: /^Aadmintest$/ })
    .first()
    .click();
  await page.getByText("文档").click();
  await expect(page.locator("#app")).toMatchAriaSnapshot(`
    - table:
      - rowgroup:
        - row /zh_cn\\.json \\d+/:
          - cell "zh_cn.json"
          - cell /\\d+/
    `);
});
