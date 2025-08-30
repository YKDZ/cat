import { getPrismaDB, setting } from "@cat/db";
import { expect, test } from "@playwright/test";
import { AuthPage } from "./fixtures/auth-page";

test("should have basic auth outlook", async ({ page }) => {
  const { client: prisma } = await getPrismaDB();
  const name = await setting("server.name", "CAT", prisma);

  const auth = new AuthPage(page);

  await auth.goto();

  await expect(page).toHaveTitle(`${name} | Auth`);
  await expect(page.locator("#app")).toMatchAriaSnapshot(`
    - img
    - heading "登录到 ${name}" [level=1]
    - button "通过 邮箱 + 密码 登录"
    - button "通过 My OIDC 登录"
    `);
});

test("email & password auth", async ({ page }) => {
  const auth = new AuthPage(page);

  await auth.login();
});
