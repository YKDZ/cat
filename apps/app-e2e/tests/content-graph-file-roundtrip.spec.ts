import { expect } from "@playwright/test";

import { test } from "@/fixtures";

test.describe("Content graph file round-trip", () => {
  test("navigates to seeded content node and shows elements", async ({
    editorPage,
    refs,
  }) => {
    const contentNodeId = refs["content-node:elements"];
    await editorPage.navigateToEditor(contentNodeId, "zh-Hans");

    // E2E dataset seeds 20 elements, 16 per page → page 1 shows 16
    const items = editorPage.getElementItems();
    await expect(items).toHaveCount(16);

    // Total count shows 20
    await editorPage.expectElementCount(20);
  });

  test("can translate elements via the content node document", async ({
    editorPage,
    refs,
  }) => {
    const contentNodeId = refs["content-node:elements"];
    await editorPage.navigateToEditor(contentNodeId, "zh-Hans");

    // Select first element and add a translation
    await editorPage.selectElement(0);
    await editorPage.inputTranslation("图内容节点翻译");
    await editorPage.submitTranslation();
    await editorPage.expectTranslationVisible("图内容节点翻译");
  });
});
