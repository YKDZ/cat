// oxlint-disable no-console
// oxlint-disable no-await-in-loop -- Playwright browser operations are inherently sequential (single page context)
// oxlint-disable typescript-eslint/no-unsafe-member-access -- Playwright evaluate() callbacks run in browser context
import type { CollectionElement } from "@cat/shared/schema/collection";
import type { Page } from "playwright";

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

import type {
  CapturedScreenshot,
  NavigationStep,
  ScreenshotCollectOptions,
} from "./types.ts";

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
        await page.goto(url, { waitUntil: "networkidle" });
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
          const locator = page.getByText(text, { exact: true });
          const count = await locator.count();
          if (count === 0) continue;

          // Take the first visible match
          const firstVisible = locator.first();
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
