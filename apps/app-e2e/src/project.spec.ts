import { test } from "@playwright/test";
import { AuthPage } from "./fixtures/auth-page";
import { ProjectPage } from "./fixtures/project-page";

test("should create project", async ({ page }) => {
  const auth = new AuthPage(page);

  await auth.login();

  const project = new ProjectPage(page);

  await project.init();
  await project.clean();
});
