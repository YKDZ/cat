import { expect, Page } from "@playwright/test";
import { randomBytes } from "crypto";
import { join } from "path";

export class ProjectPage {
  constructor(
    public readonly page: Page,
    public readonly projectName: string = `Test Project ${randomBytes(4).toString("hex")}`,
  ) {}

  async init() {
    await this.page.goto("http://localhost:3000/");
    await this.page.waitForSelector("body.hydrated");

    await this.page.getByText("翻译文件").click();
    await this.page.getByRole("textbox", { name: "项目名称" }).click();
    await this.page
      .getByRole("textbox", { name: "项目名称" })
      .fill(this.projectName);
    await this.page.getByRole("textbox", { name: "选择一个语言" }).click();
    await this.page.getByText("简体中文").first().click();
    await this.page
      .getByRole("textbox", { name: "选择一个或多个语言" })
      .click();
    await this.page.getByText("English").click();
    await this.page
      .getByRole("textbox", { name: "用于描述项目的简短文本" })
      .click();
    await this.page
      .getByRole("textbox", { name: "用于描述项目的简短文本" })
      .fill("Test Desc");
    await this.page.getByRole("button", { name: "创建项目" }).click();

    // 文件上传
    const fileChooserPromise = this.page.waitForEvent("filechooser");
    await this.page.getByRole("button", { name: "选择文件" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(
      join(import.meta.dirname, "../../assets/zh_cn.json"),
    );
    await this.page.getByRole("button", { name: "上传所有" }).click();
  }

  async goto() {
    await this.page.goto("http://localhost:3000/projects");
    await this.page.waitForSelector("body.hydrated");
    await this.page.getByRole("cell", { name: this.projectName }).click();
    await this.page.waitForSelector("body.hydrated");
    await expect(this.page).toHaveURL(/\/project(\/|$)/);
  }

  async clean() {
    await this.goto();
    await this.page.getByRole("button", { name: "设置" }).click();
    await this.page.waitForSelector("body.hydrated");
    await this.page.getByRole("button", { name: "删除项目" }).click();
    await expect(this.page).toHaveURL(`/projects`);
  }
}
