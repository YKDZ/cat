// oxlint-disable no-console
import type { BrowserContext } from "playwright";

export interface AuthOptions {
  email?: string;
  password?: string;
  storageStatePath?: string;
}

/**
 * Handle browser authentication.
 * If storageStatePath is provided and valid, restore session from it.
 * Otherwise, navigate to login page and fill the multi-step auth flow
 * (identifier → password, driven by Ory Kratos).
 */
export async function authenticateBrowser(
  context: BrowserContext,
  baseUrl: string,
  options: AuthOptions,
): Promise<void> {
  if (options.storageStatePath) {
    // storageState was already loaded via browser context options
    console.error("[INFO] Using existing auth storage state");
    return;
  }

  if (!options.email || !options.password) {
    console.error("[WARN] No auth credentials provided, skipping login");
    return;
  }

  console.error("[INFO] Logging in via browser...");
  const page = await context.newPage();

  try {
    // The app uses /auth with a multi-step Ory Kratos flow:
    // Step 1: Identifier input (email), Step 2: Password input
    await page.goto(new URL("/auth", baseUrl).href, {
      waitUntil: "networkidle",
    });

    // Step 1: Fill identifier (email)
    await page.fill(
      'input[autocomplete="username"], input[type="email"]',
      options.email,
    );
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000); // Wait for flow transition

    // Step 2: Fill password
    await page.fill(
      'input[autocomplete="current-password"], input[type="password"]',
      options.password,
    );
    await page.click('button[type="submit"]');

    // Wait for navigation away from auth page
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
      timeout: 15000,
    });

    console.error("[INFO] Login successful");
  } catch (err) {
    throw new Error(
      `Login failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    await page.close();
  }
}
