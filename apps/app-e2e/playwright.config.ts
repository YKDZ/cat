import dotenv from "dotenv";
import { resolve } from "node:path";

// Load .env from the app-e2e directory (not CWD, which may differ)
dotenv.config({ path: resolve(import.meta.dirname, ".env") });

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  timeout: 90_000,

  globalSetup: "./global-setup.ts",

  /* Ignore old spec files pending Phase 2 migration */
  testIgnore: ["**/project-crud.spec.ts", "**/agent-phase2.spec.ts"],

  use: {
    baseURL: `http://localhost:${process.env.PORT ?? 3000}`,
    trace: "on-first-retry",
    // Force zh-CN locale so the server reads Accept-Language: zh-CN and
    // serves Chinese i18n strings. Without this, Chromium defaults to en-US
    // and the app renders English text ("Submit", "Showing … of …") which
    // breaks assertions that check for Chinese strings ("提交", "共 N 条").
    locale: "zh-CN",
  },

  webServer: {
    command: "pnpm moon run app:preview",
    url: `http://localhost:${process.env.PORT ?? 3000}/_health`,
    reuseExistingServer: true,
    timeout: 300_000,
    env: {
      PORT: process.env.PORT ?? "3000",
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      REDIS_URL: process.env.REDIS_URL ?? "",
    },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
  ],
});
