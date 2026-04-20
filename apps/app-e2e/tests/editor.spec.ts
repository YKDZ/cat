import { test, expect } from "@/fixtures";

test.describe("Editor - Element Loading (P0)", () => {
  test("loads elements in the sidebar", async ({ editorPage, refs }) => {
    const documentId = refs["document:elements"];
    await editorPage.navigateToEditor(documentId, "zh-Hans");

    // 20 elements seeded, 16 per page → page 1 shows 16
    const items = editorPage.getElementItems();
    await expect(items).toHaveCount(16);

    // Total count should show 20
    await editorPage.expectElementCount(20);
  });

  test("can select an element", async ({ editorPage, refs, page }) => {
    const documentId = refs["document:elements"];
    await editorPage.navigateToEditor(documentId, "zh-Hans");

    // Click the first element
    await editorPage.selectElement(0);

    // URL should contain an element ID (numeric)
    await expect(page).toHaveURL(/\/editor\/[^/]+\/zh-Hans\/\d+/);
  });
});

test.describe("Editor - Translation (P0)", () => {
  test("can input and submit a translation", async ({ editorPage, refs }) => {
    const documentId = refs["document:elements"];
    await editorPage.navigateToEditor(documentId, "zh-Hans");

    // Select first element
    await editorPage.selectElement(0);

    // Input translation
    await editorPage.inputTranslation("你好世界");

    // Submit
    await editorPage.submitTranslation();

    // Verify translation appears in "所有翻译" (All translations) section.
    // expectTranslationVisible scopes to the Translations.vue section
    // (below the heading "所有翻译") to avoid a false positive from the
    // CodeMirror editor which still shows the typed text.
    await editorPage.expectTranslationVisible("你好世界");
  });
});

test.describe("Editor - Pagination (P1)", () => {
  test("can navigate to page 2", async ({ editorPage, refs }) => {
    const documentId = refs["document:elements"];
    await editorPage.navigateToEditor(documentId, "zh-Hans");

    // Verify we're on page 1
    const pageText = await editorPage.getCurrentPageText();
    expect(pageText).toContain("1/");

    // Navigate to page 2
    await editorPage.goToNextPage();

    // Page 2 should show remaining 4 elements (20 total - 16 on page 1)
    const items = editorPage.getElementItems();
    await expect(items).toHaveCount(4);

    // Pagination text should show page 2
    const newPageText = await editorPage.getCurrentPageText();
    expect(newPageText).toContain("2/");
  });
});

test.describe("Editor - Context Panel (P1)", () => {
  test("can view element context", async ({ editorPage, refs, page }) => {
    const documentId = refs["document:elements"];
    await editorPage.navigateToEditor(documentId, "zh-Hans");

    // Select first element (el:001 has context data)
    await editorPage.selectElement(0);

    // Open context panel
    await editorPage.viewContext();

    // Verify context content is visible
    // el:001 has context: ["A greeting message displayed on the home page"]
    await expect(
      page.getByText("A greeting message displayed on the home page"),
    ).toBeVisible({ timeout: 10_000 });
  });
});
