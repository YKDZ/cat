import { expect, type Page } from "@playwright/test";

export class EditorPage {
  constructor(private readonly page: Page) {}

  /**
   * The sidebar `[data-sidebar="sidebar"]` is the rendered wrapper.
   * Note: `<Sidebar :id="editor">` uses `id` only for state management
   * (via `useSidebar(props.id)`). It does NOT render `data-sidebar="editor"`
   * in the DOM. The inner wrapper always renders `data-sidebar="sidebar"`.
   * Element buttons render as `[data-sidebar="menu-button"]` via SidebarMenuButtonChild.
   */

  /**
   * Navigate to the editor for a specific document and target language.
   * Uses the `/auto` route which redirects to the first untranslated element.
   */
  async navigateToEditor(
    documentId: string,
    languageToId: string,
  ): Promise<void> {
    await this.page.goto(`/editor/${documentId}/${languageToId}/auto`);
    // Wait for the editor sidebar to load elements (skeleton disappears)
    await this.page
      .locator('[data-sidebar="group-content"] [data-sidebar="menu-button"]')
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });
    // Wait for the document breadcrumb — confirms context.document is loaded
    // so translate() will not silently early-exit with !context.document.value.
    await this.page
      .locator(".header")
      .locator("span.inline-block")
      .waitFor({ state: "visible", timeout: 10_000 });
  }

  /**
   * Navigate to editor from project dashboard.
   * DocumentTreeNode rows are clickable (entire row, no separate "编辑" button).
   * Clicking a document row triggers `handleEdit` → `navigate('/editor/...')`.
   */
  async navigateFromProject(
    projectId: string,
    languageId: string,
    documentName: string,
  ): Promise<void> {
    await this.page.goto(`/project/${projectId}/index/${languageId}`);
    // Click the document row by its name text
    await this.page.getByText(documentName).first().click();
    // Wait for editor to load
    await this.page
      .locator('[data-sidebar="group-content"] [data-sidebar="menu-button"]')
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });
  }

  /**
   * Get all visible element buttons in the sidebar.
   * Scoped to `[data-sidebar="group-content"]` to exclude header menu buttons.
   */
  getElementItems(): ReturnType<Page["locator"]> {
    return this.page.locator(
      '[data-sidebar="group-content"] [data-sidebar="menu-button"]',
    );
  }

  /**
   * Click an element in the sidebar by its index (0-based).
   * After the URL updates, waits for the translate button to be enabled,
   * confirming the element store has settled before the caller starts typing.
   */
  async selectElement(index: number): Promise<void> {
    const items = this.getElementItems();
    await items.nth(index).click();
    // Wait for the element to be selected (URL should update)
    await this.page.waitForURL(/\/editor\/[^/]+\/[^/]+\/\d+/);
    // Wait for the translate button — confirms toElement() completed and
    // elementId/context are stable before typing starts.
    await this.page
      .getByRole("button", { name: "提交", exact: true })
      .waitFor({ state: "visible", timeout: 5_000 });
  }

  /**
   * Type translation text into the CodeMirror editor.
   * CodeMirror uses a contenteditable div with role="textbox".
   */
  async inputTranslation(text: string): Promise<void> {
    // Narrow to the editable CodeMirror editor (contenteditable="true"),
    // as the page may also contain readonly source/suggestion editors.
    const editor = this.page.locator(
      '.cm-editor .cm-content[contenteditable="true"]',
    );
    await editor.waitFor({ state: "visible" });
    await editor.click();
    // Clear existing content and type new text
    await this.page.keyboard.press("ControlOrMeta+a");
    await this.page.keyboard.type(text);
  }

  /**
   * Click the "提交" (Submit) button to submit the current translation.
   */
  async submitTranslation(): Promise<void> {
    await this.page.getByRole("button", { name: "提交", exact: true }).click();
  }

  /**
   * Click the "提交并继续" (Submit & Continue) button.
   */
  async submitAndContinue(): Promise<void> {
    await this.page.getByRole("button", { name: "提交并继续" }).click();
  }

  /**
   * Assert the total element count shown in the pagination footer.
   * The pagination text format is: "显示 {from} - {to} 条，共 {total} 条"
   */
  async expectElementCount(total: number): Promise<void> {
    await expect(
      this.page.getByText(`共 ${total} 条`, { exact: false }),
    ).toBeVisible({ timeout: 15_000 });
  }

  /**
   * Navigate to next page using PaginationNext button in the sidebar footer.
   * PaginationNext wraps a ChevronRightIcon (single chevron, not double).
   */
  async goToNextPage(): Promise<void> {
    await this.page
      .locator('[data-sidebar="footer"]')
      .locator("button")
      .filter({ has: this.page.locator("svg.lucide-chevron-right") })
      .click();
  }

  /**
   * Get the currently displayed page number from the pagination.
   * Format: "currentPage/totalPages" rendered in a `.tabular-nums` span.
   */
  async getCurrentPageText(): Promise<string> {
    const paginationText = this.page
      .locator('[data-sidebar="footer"]')
      .locator(".tabular-nums");
    return (await paginationText.textContent()) ?? "";
  }

  /**
   * Open the context panel by clicking the "上下文" (Context) tab.
   */
  async viewContext(): Promise<void> {
    await this.page.getByRole("tab", { name: "上下文" }).click();
  }

  /**
   * Open the source file panel by clicking the "源文件" (Source) tab.
   */
  async viewSource(): Promise<void> {
    await this.page.getByRole("tab", { name: "源文件" }).click();
  }

  /**
   * Open the discussion panel by clicking the "讨论" (Discussion) tab.
   */
  async viewDiscussion(): Promise<void> {
    await this.page.getByRole("tab", { name: "讨论" }).click();
  }

  /**
   * Get the source text of the currently selected element.
   */
  getSourceText(): ReturnType<Page["locator"]> {
    return this.page.locator(".cm-editor").first();
  }

  /**
   * Assert that a translation was saved by checking the "所有翻译" section.
   * Scoped to the Translations.vue section to avoid false positives
   * from the CodeMirror editor still showing the typed text.
   */
  async expectTranslationVisible(text: string): Promise<void> {
    // The heading "所有翻译" is rendered by Translations.vue.
    // Scope the search to the parent container following that heading.
    const translationsSection = this.page
      .locator("h3", { hasText: "所有翻译" })
      .locator("..");
    await expect(translationsSection.getByText(text).first()).toBeVisible({
      timeout: 10_000,
    });
  }
}
