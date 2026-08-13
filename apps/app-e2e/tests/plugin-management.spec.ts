import { test, expect } from "#/fixtures.ts";
import { gotoHydrated } from "#/pages/app-navigation.ts";

test.describe("Plugin management", () => {
  test("administrator probes the official spaCy Language Analyzer through the product API", async ({
    page,
  }) => {
    test.setTimeout(150_000);

    await gotoHydrated(page, "/admin/plugin/spacy-language-analyzer");
    await expect(
      page.getByRole("heading", { name: "spacy-language-analyzer" }),
    ).toBeVisible();

    const configPanel = page.getByTestId("plugin-config-editor");
    const probeButton = configPanel.getByRole("button", {
      name: "检测当前配置",
      exact: true,
    });
    await expect(probeButton).toBeEnabled();
    await probeButton.scrollIntoViewIfNeeded();
    await probeButton.click();
    const successResult = page.getByText("检测结果：SUCCESS");
    await Promise.any([
      expect(
        configPanel.getByRole("button", { name: "检测中…" }),
      ).toBeVisible(),
      expect(successResult).toBeVisible(),
    ]);

    await expect(successResult).toBeVisible({
      timeout: 120_000,
    });
    await expect(
      page.getByText("LANGUAGE_ANALYZER · spacy-language-analyzer").last(),
    ).toBeVisible();
    await expect(page.locator("pre")).toContainText(/"tokenCount":\s*[1-9]/);
  });

  test("admin can open a no-config plugin without being redirected home", async ({
    page,
  }) => {
    await gotoHydrated(page, "/admin/plugin/basic-tokenizer");

    await expect(page).toHaveURL(/\/admin\/plugin\/basic-tokenizer/);
    await expect(
      page.getByRole("heading", { name: "basic-tokenizer" }),
    ).toBeVisible();
    await expect(page.getByText("此插件没有配置项")).toBeVisible();
    await expect(page.getByText("TOKENIZER").first()).toBeVisible();
  });

  test("admin sees unsupported probe state for tokenizer-only plugin", async ({
    page,
  }) => {
    await gotoHydrated(page, "/admin/plugin/basic-tokenizer");

    await expect(page.getByText("不支持检测").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "检测当前运行配置" }),
    ).toBeDisabled();
  });
});
