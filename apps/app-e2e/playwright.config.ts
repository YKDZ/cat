import { defineConfig, devices } from "@playwright/test";
import { workspaceRoot } from "@nx/devkit";
import { join } from "path";

// For CI, you may want to set BASE_URL to the deployed application.
const baseURL = process.env["BASE_URL"] || "http://localhost:3000";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./src",

  reporter: [
    ["html", { open: process.env.CI ? "never" : "on-failure" }],
    ["github"],
  ],

  workers: process.env.CI ? 1 : 3,

  fullyParallel: !process.env.CI,

  retries: process.env.CI ? 2 : 0,

  timeout: 30 * 1000,
  expect: {
    timeout: 5 * 1000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: process.env.CI ? "retain-on-failure" : "retain-on-failure",
    actionTimeout: process.env.CI ? 10 * 1000 : 5 * 1000,
  },
  webServer: {
    command: "",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    cwd: join(workspaceRoot, "apps", "app-e2e"),
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
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },

    // Uncomment for mobile browsers support
    /* {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    }, */

    // Uncomment for branded browsers
    /* {
      name: 'Microsoft Edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
    {
      name: 'Google Chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    } */
  ],
});
