// oxlint-disable no-console
// oxlint-disable no-await-in-loop -- Playwright browser operations are inherently sequential (single page context)
// oxlint-disable typescript-eslint/no-unsafe-member-access -- Playwright evaluate() callbacks run in browser context
import type { CollectionElement } from "@cat/shared";
import type { CaptureResult, ExtractionResult } from "@cat/shared";
import type { Page } from "playwright";

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

import type { AuthOptions } from "./auth.ts";
import type {
  CapturedScreenshot,
  NavigationStep,
  ScreenshotCollectOptions,
  ScreenshotRoute,
} from "./types.ts";

import { authenticateBrowser } from "./auth.ts";

/**
 * @zh 按文本在页面中查找元素，先尝试文本节点，再 fallback 到 placeholder 属性。
 * @en Find an element by text, first as a text node, then falling back to placeholder attribute.
 */
const findLocatorByText = (page: Page, text: string) => {
  const byText = page.getByText(text, { exact: true });
  return {
    async first() {
      const textCount = await byText.count();
      if (textCount > 0) {
        return byText.first();
      }
      return page.getByPlaceholder(text, { exact: true }).first();
    },
    async count() {
      const textCount = await byText.count();
      if (textCount > 0) return textCount;
      return page.getByPlaceholder(text, { exact: true }).count();
    },
  };
};

/**
 * Collect screenshots: launch browser, traverse routes, locate elements and screenshot.
 * For each route, iterates unique element texts and takes one screenshot per text.
 * Each screenshot is associated with the first element matching that text (not all).
 */
export async function collectScreenshots(
  options: ScreenshotCollectOptions,
): Promise<CapturedScreenshot[]> {
  const { baseUrl, routes, elements, outputDir, headless = true } = options;

  await mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless });
  const captured: CapturedScreenshot[] = [];

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Build lookup: text → first element with that text (take first to avoid fan-out)
    const textToElement = new Map<string, CollectionElement>();
    for (const el of elements) {
      if (!textToElement.has(el.text)) {
        textToElement.set(el.text, el);
      }
    }

    const uniqueTexts = [...textToElement.keys()];

    for (const route of routes) {
      const url = new URL(route.path, baseUrl).href;
      console.error(`[INFO] Navigating to ${url}`);

      try {
        await page.goto(url, { waitUntil: route.waitUntil ?? "networkidle" });
      } catch (err) {
        console.warn(
          `[WARN] Failed to navigate to ${url}: ${err instanceof Error ? err.message : String(err)}`,
        );
        continue;
      }

      // Execute optional navigation steps
      if (route.steps) {
        await executeNavigationSteps(page, route.steps);
      }

      // Wait for page to stabilize
      const waitMs = route.waitAfterLoad ?? 1000;
      await page.waitForTimeout(waitMs);

      // For each unique text, try to locate it on the page
      for (const text of uniqueTexts) {
        const element = textToElement.get(text);
        if (!element) continue;

        try {
          const locator = findLocatorByText(page, text);
          const count = await locator.count();
          if (count === 0) continue;

          // Take the first visible match
          const firstVisible = await locator.first();
          if (!(await firstVisible.isVisible())) continue;

          // Get bounding box before highlight
          const boundingBox = await firstVisible.boundingBox();
          if (!boundingBox) continue;

          // Highlight the element with CSS outline
          await firstVisible.evaluate((el: HTMLElement) => {
            el.style.outline = "3px solid #ff4444";
            el.style.outlineOffset = "2px";
          });

          // Screenshot the page with the element highlighted
          const safeText = text
            .slice(0, 30)
            .replace(/[^\w\u4e00-\u9fff-]/g, "_");
          const safePath = route.path.replace(/\//g, "_").replace(/^_/, "");
          const fileName = `${safePath}_${safeText}_${Date.now()}.png`;
          const filePath = join(outputDir, fileName);

          await page.screenshot({
            path: filePath,
            fullPage: false,
            animations: "disabled",
            type: "png",
          });

          // Remove highlight
          await firstVisible.evaluate((el: HTMLElement) => {
            el.style.outline = "";
            el.style.outlineOffset = "";
          });

          captured.push({
            filePath,
            element,
            highlightRegion: {
              x: Math.round(boundingBox.x),
              y: Math.round(boundingBox.y),
              width: Math.round(boundingBox.width),
              height: Math.round(boundingBox.height),
            },
          });
        } catch (err) {
          console.warn(
            `[WARN] Screenshot failed for text "${text.slice(0, 50)}" on ${route.path}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  } finally {
    await browser.close();
  }

  console.error(`[INFO] Captured ${captured.length} screenshots`);
  return captured;
}

export interface CaptureOptions {
  baseUrl: string;
  routes: ScreenshotRoute[];
  elements: ExtractionResult["elements"];
  outputDir: string;
  headless?: boolean;
  auth?: AuthOptions;
}

/**
 * Capture screenshots for elements across routes, returning CaptureResult.
 * Similar to collectScreenshots but works with ExtractionResult elements
 * and returns the new CaptureResult format.
 */
export async function captureScreenshots(
  options: CaptureOptions,
): Promise<CaptureResult> {
  const {
    baseUrl,
    routes,
    elements,
    outputDir,
    headless = true,
    auth,
  } = options;

  await mkdir(outputDir, { recursive: true });

  const storageState = auth?.storageStatePath || undefined;
  const browser = await chromium.launch({ headless });
  const screenshots: CaptureResult["screenshots"] = [];

  try {
    const context = await browser.newContext(
      storageState ? { storageState } : {},
    );

    // Handle auth once globally for authenticated routes.
    const needsAuth =
      auth && !auth.storageStatePath && auth.email && auth.password;
    if (needsAuth) {
      await authenticateBrowser(context, baseUrl, auth);
    }

    // Separate authenticated and unauthenticated routes
    const authRoutes = routes.filter((r) => r.auth !== false);
    const noAuthRoutes = routes.filter((r) => r.auth === false);

    const page = await context.newPage();

    // Build text→element lookup
    const textToElement = new Map<
      string,
      ExtractionResult["elements"][number]
    >();
    for (const el of elements) {
      if (!textToElement.has(el.text)) {
        textToElement.set(el.text, el);
      }
    }

    const uniqueTexts = [...textToElement.keys()];

    // Helper to capture screenshots on a given page for a list of routes
    const captureForRoutes = async (
      targetPage: Page,
      targetRoutes: ScreenshotRoute[],
    ) => {
      for (const route of targetRoutes) {
        const url = new URL(route.path, baseUrl).href;
        console.error(`[INFO] Navigating to ${url}`);

        try {
          await targetPage.goto(url, {
            waitUntil: route.waitUntil ?? "networkidle",
          });
        } catch (err) {
          console.warn(
            `[WARN] Failed to navigate to ${url}: ${err instanceof Error ? err.message : String(err)}`,
          );
          continue;
        }

        if (route.steps) {
          await executeNavigationSteps(targetPage, route.steps);
        }

        const waitMs = route.waitAfterLoad ?? 1000;
        await targetPage.waitForTimeout(waitMs);

        for (const text of uniqueTexts) {
          const element = textToElement.get(text);
          if (!element) continue;

          try {
            const locator = findLocatorByText(targetPage, text);
            const count = await locator.count();
            if (count === 0) continue;

            const firstVisible = await locator.first();
            if (!(await firstVisible.isVisible())) continue;

            const boundingBox = await firstVisible.boundingBox();
            if (!boundingBox) continue;

            await firstVisible.evaluate((el: HTMLElement) => {
              el.style.outline = "3px solid #ff4444";
              el.style.outlineOffset = "2px";
            });

            const safeText = text
              .slice(0, 30)
              .replace(/[^\w\u4e00-\u9fff-]/g, "_");
            const safePath = route.path.replace(/\//g, "_").replace(/^_/, "");
            const fileName = `${safePath}_${safeText}_${Date.now()}.png`;
            const filePath = join(outputDir, fileName);

            await targetPage.screenshot({
              path: filePath,
              fullPage: false,
              animations: "disabled",
              type: "png",
            });

            await firstVisible.evaluate((el: HTMLElement) => {
              el.style.outline = "";
              el.style.outlineOffset = "";
            });

            screenshots.push({
              filePath,
              elementRef: element.ref,
              elementMeta: element.meta,
              route: route.path,
              highlightRegion: {
                x: Math.round(boundingBox.x),
                y: Math.round(boundingBox.y),
                width: Math.round(boundingBox.width),
                height: Math.round(boundingBox.height),
              },
            });
          } catch (err) {
            console.warn(
              `[WARN] Screenshot failed for text "${text.slice(0, 50)}" on ${route.path}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }
    };

    // Capture authenticated routes on the current (auth'd) page
    await captureForRoutes(page, authRoutes);

    // Capture unauthenticated routes in a fresh context (no auth cookies)
    if (noAuthRoutes.length > 0) {
      const noAuthContext = await browser.newContext();
      const noAuthPage = await noAuthContext.newPage();
      await captureForRoutes(noAuthPage, noAuthRoutes);
      await noAuthPage.close();
      await noAuthContext.close();
    }
  } finally {
    await browser.close();
  }

  console.error(`[INFO] Captured ${screenshots.length} screenshots`);

  return {
    screenshots,
    metadata: {
      baseUrl,
      timestamp: new Date().toISOString(),
    },
  };
}

async function executeNavigationSteps(
  page: Page,
  steps: NavigationStep[],
): Promise<void> {
  for (const step of steps) {
    switch (step.action) {
      case "click":
        await page.click(step.selector);
        break;
      case "fill":
        await page.fill(step.selector, step.value);
        break;
      case "wait":
        await page.waitForTimeout(step.ms);
        break;
    }
  }
}
