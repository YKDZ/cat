import { prisma, setting } from "@cat/db";
import { expect, test } from "@playwright/test";

test("should have basic outlook", async ({ page }) => {
  await page.goto("/auth");

  const name = await setting("server.name", "CAT", prisma);

  await expect(page).toHaveTitle(`${name} | Auth`);
  await expect(page.locator("#app")).toMatchAriaSnapshot(`
    - img
    - heading "登录到 ${name}" [level=1]
    - button "通过 邮箱 + 密码 登录"
    - button "通过 My OIDC 登录"
    `);
});

test("should login and redirected to index", async ({ page }) => {
  await page.goto("/auth");

  const emailPasswordAuthBtn = page.locator("#EMAIL_PASSWORD");

  await emailPasswordAuthBtn.click();
  await expect(page).toHaveURL("/auth/callback");

  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="text"]');
  const loginBtn = page.getByRole("button", { name: "登录" });

  await expect(emailInput).toBeVisible();
  await expect(passwordInput).toBeVisible();
  await expect(loginBtn).toBeVisible();

  await emailInput.fill("admin@encmys.cn");
  await passwordInput.fill("password");
  await loginBtn.click();

  await expect(page).toHaveURL("/");
});
