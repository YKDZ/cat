import { test as baseTest, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { randomUUID } from "node:crypto";
import { acquireAccount } from "@/utils/account";

export * from "@playwright/test";

interface TestFixtures {
  testId: string;
}

export const test = baseTest.extend<
  TestFixtures,
  { workerStorageState: string }
>({
  testId: async ({}, use) => {
    // 为每个测试生成唯一的 ID
    const id = randomUUID().split("-")[0];
    await use(id);
  },
  // Use the same storage state for all tests in this worker.
  storageState: ({ workerStorageState }, use) => use(workerStorageState),

  // Authenticate once per worker with a worker-scoped fixture.
  workerStorageState: [
    async ({ browser }, use) => {
      // Use parallelIndex as a unique identifier for each worker.
      const id = test.info().parallelIndex;
      const fileName = path.resolve(
        test.info().project.outputDir,
        `.auth/${id}.json`,
      );

      if (fs.existsSync(fileName)) {
        // Reuse existing authentication state if any.
        await use(fileName);
        return;
      }

      // Important: make sure we authenticate in a clean environment by unsetting storage state.
      const page = await browser.newPage({ storageState: undefined });

      // Acquire a unique account, for example create a new one.
      // Alternatively, you can have a list of precreated accounts for testing.
      // Make sure that accounts are unique, so that multiple team members
      // can run tests at the same time without interference.
      const account = await acquireAccount(randomUUID().split("-")[0]);

      // Perform authentication steps. Replace these actions with your own.
      await page.goto("http://localhost:3000/");
      await page.getByRole("textbox", { name: "邮箱" }).click();
      await page.getByRole("textbox", { name: "邮箱" }).fill(account.email);
      await page.getByTestId("PASSWORD").click();
      await page.locator('input[type="password"]').click();
      await page.locator('input[type="password"]').fill(account.password);
      await page.getByRole("button", { name: "登录" }).click();

      await expect(page).toHaveURL("http://localhost:3000/");
      await expect(page).toHaveTitle("CAT");

      // End of authentication steps.

      await page.context().storageState({ path: fileName });
      await page.close();
      await use(fileName);
    },
    { scope: "worker" },
  ],
});
