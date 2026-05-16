import { test, expect } from "@/fixtures";

test.describe("Plugin management", () => {
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
