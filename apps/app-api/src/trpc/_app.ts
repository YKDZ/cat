import { router } from "./server.ts";
import { authRouter } from "./routers/auth.ts";
import { projectRouter } from "./routers/project.ts";
import { documentRouter } from "./routers/document.ts";
import { languageRouter } from "./routers/language.ts";
import { translationRouter } from "./routers/translation.ts";
import { suggestionRouter } from "./routers/suggestion.ts";
import { userRouter } from "./routers/user.ts";
import { memoryRouter } from "./routers/memory.ts";
import { glossaryRouter } from "./routers/glossary.ts";
import { pluginRouter } from "./routers/plugin.ts";
import { settingRouter } from "./routers/setting.ts";
import { taskRouter } from "./routers/task.ts";
// @ts-expect-error workaround for zod utils.d.cts ts(2742)
// oxlint-disable-next-line no-unused-vars no-unused-vars
import type { z } from "zod/v4";

export const appRouter = router({
  setting: settingRouter,
  task: taskRouter,
  plugin: pluginRouter,
  glossary: glossaryRouter,
  memory: memoryRouter,
  user: userRouter,
  suggestion: suggestionRouter,
  translation: translationRouter,
  language: languageRouter,
  document: documentRouter,
  auth: authRouter,
  project: projectRouter,
});

export type AppRouter = typeof appRouter;
