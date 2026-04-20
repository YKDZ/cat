import { expect, type Page } from "@playwright/test";

export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto("/auth");
  }

  /**
   * Perform a full email+password login.
   * The auth flow is a multi-step process:
   *   Step 1 — IdentifierInput: enter email, click "继续" (Continue)
   *   Step 2 — PasswordInput: enter password, click "验证" (Verify)
   */
  async login(email: string, password: string): Promise<void> {
    // Step 1: Identifier input (email)
    const emailInput = this.page.getByRole("textbox", { name: "邮箱" });
    await emailInput.waitFor({ state: "visible" });
    await emailInput.fill(email);
    await this.page.getByRole("button", { name: "继续" }).click();

    // Step 2: Password input
    const passwordInput = this.page.locator('input[type="password"]');
    await passwordInput.waitFor({ state: "visible" });
    await passwordInput.fill(password);
    await this.page.getByRole("button", { name: "验证" }).click();
  }

  async expectLoggedIn(): Promise<void> {
    // After successful login, the auth flow store sets sessionCreated=true
    // which navigates to "/". The page title should be "CAT".
    await expect(this.page).toHaveURL("/");
    await expect(this.page).toHaveTitle("CAT");
  }

  async loginAndVerify(email: string, password: string): Promise<void> {
    await this.goto();
    await this.login(email, password);
    await this.expectLoggedIn();
  }
}
