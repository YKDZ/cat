import { type Page, expect } from "@playwright/test";

export class AuthPage {
  constructor(public readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto("http://localhost:3000/auth");
    await this.page.waitForSelector("body.hydrated");
  }

  async login(): Promise<void> {
    await this.goto();
    await expect(this.page.locator("#app")).toMatchAriaSnapshot(`
      - img
      - heading "登录到 CAT" [level=1]
      - button "通过 邮箱 + 密码 登录"
      `);
    await this.page.getByTestId("EMAIL_PASSWORD").click();
    await expect(this.page.locator("#app")).toMatchAriaSnapshot(`
      - text: email
      - textbox
      - text: password
      - textbox
      - button "登录"
      `);
    await this.page.locator('input[type="email"]').click();
    await this.page.locator('input[type="email"]').fill("admin@encmys.cn");
    await this.page.locator('input[type="password"]').click();
    await this.page.locator('input[type="password"]').fill("password");
    await this.page.locator("span").nth(1).click();
    await this.page.locator('input[type="text"]').click();
    await expect(this.page.locator("#app")).toMatchAriaSnapshot(`
      - text: email
      - textbox: admin@encmys.cn
      - text: password
      - textbox: password
      - button "登录"
      `);
    await this.page.locator("span").nth(1).click();
    await this.page.getByRole("button", { name: "登录" }).click();
    await expect(this.page).toHaveURL("/");
  }
}
