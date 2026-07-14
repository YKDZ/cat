import { resolve } from "node:path";

import {
  defineConfig,
  devices,
  type ReporterDescription,
} from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: resolve(import.meta.dirname, ".env") });

const port = process.env.PORT ?? "3000";
const baseURL = process.env.CAT_E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
const reporters: ReporterDescription[] = process.env.CI
  ? [["html", { open: "never" }]]
  : [["line"], ["html", { open: "never" }]];

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: reporters,
  timeout: 90_000,
  outputDir: process.env.CAT_E2E_OUTPUT_DIR ?? "test-results/playwright",
  use: {
    baseURL,
    locale: "zh-CN",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "dev-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "standalone-chromium",
      grepInvert: /@dev-mechanism/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "standalone-firefox",
      grepInvert: /@dev-mechanism/,
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "runtime-chromium",
      grepInvert: /@dev-mechanism/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "runtime-firefox",
      grepInvert: /@dev-mechanism/,
      use: { ...devices["Desktop Firefox"] },
    },
  ],
});
