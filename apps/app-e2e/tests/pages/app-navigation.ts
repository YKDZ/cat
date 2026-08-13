import { expect, type Page, type Response } from "@playwright/test";

export const waitForAppHydration = async (page: Page): Promise<void> => {
  await expect(page.locator("body")).toHaveClass(/hydrated/, {
    timeout: 30_000,
  });
};

export const gotoHydrated = async (
  page: Page,
  url: string,
  options?: Parameters<Page["goto"]>[1],
): Promise<null | Response> => {
  const response = await page.goto(url, options);
  await waitForAppHydration(page);
  return response;
};

export const reloadHydrated = async (
  page: Page,
  options?: Parameters<Page["reload"]>[0],
): Promise<null | Response> => {
  const response = await page.reload(options);
  await waitForAppHydration(page);
  return response;
};
