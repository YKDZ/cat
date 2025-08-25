import { getPrismaDB, setting } from "@cat/db";
import { expect, test } from "@playwright/test";

test("should basic outlook", async ({ page }) => {
  const { client: prisma } = await getPrismaDB();

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

test("email & password auth", async ({ page }) => {
  await page.goto("http://localhost:3000/auth");
  await expect(page.locator("#app")).toMatchAriaSnapshot(`
    - img
    - heading "登录到 CAT" [level=1]
    - button "通过 邮箱 + 密码 登录"
    - button "通过 My OIDC 登录"
    `);
  await page.getByTestId("EMAIL_PASSWORD").click();
  await expect(page.locator("#app")).toMatchAriaSnapshot(`
    - text: email
    - textbox
    - text: password
    - textbox
    - button "登录"
    `);
  await page.locator('input[type="email"]').click();
  await page.locator('input[type="email"]').fill("admin@encmys.cn");
  await page.locator('input[type="password"]').click();
  await page.locator('input[type="password"]').fill("password");
  await page.locator("span").nth(1).click();
  await page.locator('input[type="text"]').click();
  await expect(page.locator("#app")).toMatchAriaSnapshot(`
    - text: email
    - textbox: admin@encmys.cn
    - text: password
    - textbox: password
    - button "登录"
    `);
  await page.locator("span").nth(1).click();
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page).toHaveURL("/");
});
