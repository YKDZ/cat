import { test, expect } from "#/fixtures.ts";

test.describe("Plugin management", () => {
  test("administrator probes the official spaCy segmenter candidate through the product API", async ({
    page,
  }) => {
    test.setTimeout(150_000);

    await page.goto("/admin/plugin/spacy-segmenter");
    await expect(
      page.getByRole("heading", { name: "spacy-segmenter" }),
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
      page.getByText("NLP_WORD_SEGMENTER · spacy-word-segmenter").last(),
    ).toBeVisible();
    await expect(page.locator("pre")).toContainText(/"tokenCount":\s*[1-9]/);
  });

  test("admin can open a no-config plugin without being redirected home", async ({
    page,
  }) => {
    await page.goto("/admin/plugin/basic-tokenizer");

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
    await page.goto("/admin/plugin/basic-tokenizer");

    await expect(page.getByText("不支持检测").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "检测当前运行配置" }),
    ).toBeDisabled();
  });
});
