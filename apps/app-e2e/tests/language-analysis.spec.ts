import { test, expect } from "#/fixtures.ts";

test.describe("Language Analysis policy surfaces", () => {
  test("admin CAS conflict preserves the losing operator input", async ({
    page,
  }) => {
    const competingPage = await page.context().newPage();
    try {
      await Promise.all([
        page.goto("/admin/language-analysis"),
        competingPage.goto("/admin/language-analysis"),
      ]);

      const winningLanguageInput = page.getByRole("textbox", {
        name: "Language",
      });
      const losingLanguageInput = competingPage.getByRole("textbox", {
        name: "Language",
      });
      const winningImplementationSelect = page.locator("form select");
      const losingImplementationSelect = competingPage.locator("form select");
      await winningLanguageInput.fill("en");
      await losingLanguageInput.fill("en");
      await winningImplementationSelect.selectOption({ index: 1 });
      await losingImplementationSelect.selectOption({ index: 1 });
      const losingImplementation =
        await losingImplementationSelect.inputValue();

      const winningResponse = page.waitForResponse((response) =>
        response.url().includes("/api/rpc/languageAnalysis/writeSelection"),
      );
      await page.getByRole("button", { name: "Save" }).click();
      expect((await winningResponse).ok()).toBe(true);

      const losingResponse = competingPage.waitForResponse((response) =>
        response.url().includes("/api/rpc/languageAnalysis/writeSelection"),
      );
      await competingPage.getByRole("button", { name: "Save" }).click();
      expect((await losingResponse).ok()).toBe(false);

      await expect(losingLanguageInput).toHaveValue("en");
      await expect(losingImplementationSelect).toHaveValue(
        losingImplementation,
      );
    } finally {
      await competingPage.close();
    }
  });

  test("authorized Workbench reads observations without invoking analysis", async ({
    page,
    editorPage,
    refs,
  }) => {
    const spacyUrl = process.env.SPACY_SERVER_URL;
    if (spacyUrl === undefined) throw new Error("SPACY_SERVER_URL is required");
    const requestCounts = async (): Promise<Record<string, number>> => {
      const response = await fetch(`${spacyUrl}/_test/request-counts`);
      if (!response.ok) throw new Error("spaCy request counter is unavailable");
      return (await response.json()) as Record<string, number>;
    };
    const before = await requestCounts();
    const observations = page.waitForResponse((response) =>
      response
        .url()
        .includes("/api/rpc/languageAnalysis/getProjectObservations"),
    );

    await editorPage.navigateToEditor({
      projectId: refs.project,
      languageToId: "zh-Hans",
      contentNodeId: refs["content-node:elements"],
    });

    expect((await observations).ok()).toBe(true);
    await expect(page.getByRole("status").first()).toBeVisible();
    expect(await requestCounts()).toEqual(before);
  });
});
