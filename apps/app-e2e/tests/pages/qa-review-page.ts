import { expect, type Page } from "@playwright/test";

export class QaReviewPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async navigateToQa(projectId: string, languageToId: string): Promise<void> {
    await this.page.goto(
      `/qa-review/project/${projectId}/${languageToId}/auto`,
    );
    await this.page.waitForURL(
      /\/qa-review\/project\/[^/]+\/[^/]+\/(?:empty|\d+)(?:\?.*)?$/,
    );
  }

  async selectFirstCandidate(): Promise<void> {
    await this.page
      .getByRole("button", { name: /选择候选/ })
      .first()
      .click();
    await expect(
      this.page.getByRole("button", { name: /同意|批注并同意/ }),
    ).toBeVisible();
  }

  async addNote(text: string): Promise<void> {
    await this.page.getByPlaceholder("写入审校批注").fill(text);
  }

  async approve(): Promise<void> {
    await this.submitAction(async () => {
      await this.page.getByRole("button", { name: /批注并同意|同意/ }).click();
      const dialog = this.page.getByRole("dialog", {
        name: /确认覆盖阻断风险/,
      });
      if (await dialog.isVisible().catch(() => false)) {
        await dialog.getByRole("button", { name: "确认同意" }).click();
      }
    });
  }

  async reject(): Promise<void> {
    await this.submitAction(async () => {
      await this.page.getByRole("button", { name: /批注并拒绝|拒绝/ }).click();
    });
  }

  async defer(): Promise<void> {
    await this.submitAction(async () => {
      await this.page.getByRole("button", { name: /批注并跳过|跳过/ }).click();
    });
  }

  private async submitAction(click: () => Promise<void>): Promise<void> {
    for (const attempt of [0, 1]) {
      const response = this.page
        .waitForResponse(
          (candidate) =>
            candidate.url().includes("/api/rpc/qaReview/submitAction"),
          { timeout: 15_000 },
        )
        .catch(() => null);
      await click();
      const result = await response;
      if (result?.ok()) return;
      if (attempt === 0) {
        const handledError = this.page.getByText("Failed to fetch").last();
        if (await handledError.isVisible({ timeout: 1_000 }).catch(() => false))
          continue;
      }
      throw new Error(
        result === null
          ? "QA review action did not reach the server"
          : `QA review action failed with HTTP ${result.status()}`,
      );
    }
  }
}
