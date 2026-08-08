import { expect, test } from "#/fixtures.ts";
import { gotoHydrated } from "#/pages/app-navigation.ts";

import {
  writeDevHmrProbe,
  type DevProbeWorkspace,
} from "../dev-probe-workspace.ts";

test.use({ storageState: { cookies: [], origins: [] } });

const probeWorkspace = (): DevProbeWorkspace => {
  const directory = process.env.CAT_E2E_HMR_PROBE_DIRECTORY;
  if (directory === undefined) {
    throw new Error("Development HMR probe workspace is not configured");
  }
  return {
    applicationSourcePath: `${directory}/application-probe.vue`,
    cacheDirectory: `${directory}/optimizer-cache`,
    directory,
    privateJitPackageRoot: `${directory}/private-jit`,
    privateJitSourcePath: `${directory}/private-jit/src/probe.vue`,
  };
};

test(
  "cold dependency optimization renders authentication and home without invalid nodes",
  { tag: "@dev-mechanism" },
  async ({ page }) => {
    await gotoHydrated(page, "/auth");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator("body")).not.toBeEmpty();

    await page.locator('input[type="email"]').fill("admin@cat.dev");
    await page.getByRole("button", { name: "继续" }).click();
    await page.locator('input[type="password"]').fill("password");
    await page.getByRole("button", { name: "验证" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "翻译文件" })).toBeVisible();
  },
);

test(
  "native HMR updates application and private JIT workspace sources",
  { tag: "@dev-mechanism" },
  async ({ page }) => {
    await gotoHydrated(page, "/__e2e/hmr");
    const mainFrame = page.mainFrame();
    let mainFrameNavigations = 0;
    let documentRequests = 0;
    page.on("framenavigated", (frame) => {
      if (frame === mainFrame) mainFrameNavigations += 1;
    });
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === mainFrame)
        documentRequests += 1;
    });
    const sentinel = `hmr-sentinel-${crypto.randomUUID()}`;
    await page.evaluate((value) => {
      Reflect.set(globalThis, "__CAT_E2E_HMR_SENTINEL__", value);
    }, sentinel);
    const assertNativeUpdate = async (): Promise<void> => {
      await expect
        .poll(() =>
          page.evaluate(() =>
            Reflect.get(globalThis, "__CAT_E2E_HMR_SENTINEL__"),
          ),
        )
        .toBe(sentinel);
      expect(mainFrameNavigations).toBe(0);
      expect(documentRequests).toBe(0);
    };
    const beginNativeUpdateCheck = (): void => {
      mainFrameNavigations = 0;
      documentRequests = 0;
    };
    const workspace = probeWorkspace();
    const applicationProbe = page.getByTestId("hmr-application");
    const privateJitProbe = page.getByTestId("hmr-private-jit");
    await expect(applicationProbe).toHaveAttribute(
      "data-value",
      "application-initial",
    );
    await expect(privateJitProbe).toHaveAttribute(
      "data-value",
      "private-initial",
    );

    beginNativeUpdateCheck();
    await writeDevHmrProbe(workspace, "application", "application-updated");
    await expect(applicationProbe).toHaveAttribute(
      "data-value",
      "application-updated",
    );
    await assertNativeUpdate();

    beginNativeUpdateCheck();
    await writeDevHmrProbe(workspace, "private-jit", "private-updated");
    await expect(privateJitProbe).toHaveAttribute(
      "data-value",
      "private-updated",
    );
    await assertNativeUpdate();
  },
);
