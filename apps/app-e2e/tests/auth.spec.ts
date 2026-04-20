import { test, expect } from "@/fixtures";
import { LoginPage } from "@/pages/login-page";

test.describe("Authentication", () => {
  test.describe("Login flow", () => {
    // Override storageState to empty — these tests need a fresh (unauthenticated) browser context
    test.use({ storageState: { cookies: [], origins: [] } });

    test("admin can log in with seeded credentials", async ({ page }) => {
      const loginPage = new LoginPage(page);

      await loginPage.goto();

      // Verify we're on the login page
      await expect(page).toHaveURL(/\/auth/);
      await expect(page.getByText("登录")).toBeVisible();

      // Perform login
      await loginPage.login("admin@cat.dev", "password");

      // Verify successful login
      await loginPage.expectLoggedIn();
    });

    test("unauthenticated user is redirected to /auth", async ({ page }) => {
      await page.goto("/");
      // The guard should redirect to auth
      await expect(page).toHaveURL(/\/auth/);
    });
  });

  test.describe("Auth guard", () => {
    // Uses default storageState (admin auth from fixture)
    test("authenticated user is redirected from /auth to home", async ({
      page,
    }) => {
      await page.goto("/auth");
      // The auth guard redirects authenticated users away from /auth
      await expect(page).toHaveURL("/");
    });
  });
});
