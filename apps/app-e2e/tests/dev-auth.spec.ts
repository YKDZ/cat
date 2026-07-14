import { expect, test } from "#/fixtures.ts";

test.use({ storageState: { cookies: [], origins: [] } });

test("development login reaches the home page without client errors", async ({
  page,
}) => {
  await page.goto("/auth");

  const email = page.locator('input[type="email"]');
  await expect(email).toBeVisible();
  await email.fill("admin@cat.dev");
  await page.getByRole("button", { name: "继续" }).click();

  const password = page.locator('input[type="password"]');
  await expect(password).toBeVisible();
  await password.fill("password");
  await page.getByRole("button", { name: "验证" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "翻译文件" })).toBeVisible();
});
