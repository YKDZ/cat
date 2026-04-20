import { test as baseTest } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { EditorPage } from "@/pages/editor-page";
import { LoginPage } from "@/pages/login-page";

// ── Types ────────────────────────────────────────────────────────────

export type E2ERefs = Record<string, string>;

interface E2EFixtures {
  /** Ref→ID mapping from seeded data (e.g., refs["project"], refs["el:001"]) */
  refs: E2ERefs;
  /** LoginPage Page Object for the current page */
  loginPage: LoginPage;
  /** EditorPage Page Object for the current page */
  editorPage: EditorPage;
  /** Pre-built URL to the seeded project dashboard */
  projectUrl: string;
}

interface E2EWorkerFixtures {
  /** Path to the admin user's storageState file (worker-scoped, reused across tests) */
  adminStorageState: string;
}

// ── Load refs from globalSetup output ────────────────────────────────

const REFS_PATH = resolve(import.meta.dirname, "../test-results/e2e-refs.json");

let _cachedRefs: E2ERefs | undefined;

const loadRefs = (): E2ERefs => {
  if (_cachedRefs) return _cachedRefs;
  try {
    const raw = readFileSync(REFS_PATH, "utf-8");
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    _cachedRefs = JSON.parse(raw) as E2ERefs;
  } catch {
    throw new Error(
      `[e2e fixtures] Failed to load refs from ${REFS_PATH}. ` +
        "Did globalSetup run successfully?",
    );
  }

  // Validate required refs
  const required = ["project", "user:admin", "document:elements"];
  for (const ref of required) {
    if (!_cachedRefs[ref]) {
      throw new Error(
        `[e2e fixtures] Required ref "${ref}" not found in ${REFS_PATH}.`,
      );
    }
  }

  return _cachedRefs;
};

// ── Credentials (must match datasets/e2e/seed/users.json) ───────────

const ADMIN_EMAIL = "admin@cat.dev";
const ADMIN_PASSWORD = "password";

// ── Extend Playwright test ──────────────────────────────────────────

export const test = baseTest.extend<E2EFixtures, E2EWorkerFixtures>({
  // Worker-scoped: authenticate admin once, reuse storageState
  adminStorageState: [
    async ({ browser }, use) => {
      const id = test.info().parallelIndex;
      const fileName = resolve(
        test.info().project.outputDir,
        `.auth/admin-${id}.json`,
      );

      // Reuse existing auth if available
      const { existsSync } = await import("node:fs");
      if (existsSync(fileName)) {
        await use(fileName);
        return;
      }

      // Authenticate via UI
      // browser.newPage() does not inherit project-level baseURL; pass it explicitly.
      const context = await browser.newContext({
        baseURL: `http://localhost:${process.env.PORT ?? 3000}`,
        storageState: undefined,
      });
      const page = await context.newPage();
      const loginPage = new LoginPage(page);
      await loginPage.loginAndVerify(ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.context().storageState({ path: fileName });
      await context.close();
      await use(fileName);
    },
    { scope: "worker" },
  ],

  // Every test gets a page with admin auth
  storageState: async ({ adminStorageState }, use) => use(adminStorageState),

  // oxlint-disable-next-line no-empty-pattern
  refs: async ({}, use) => {
    await use(loadRefs());
  },

  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  editorPage: async ({ page }, use) => {
    await use(new EditorPage(page));
  },

  projectUrl: async ({ refs }, use) => {
    await use(`/project/${refs["project"]}`);
  },
});

export { expect } from "@playwright/test";
