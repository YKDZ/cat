import { router } from "./server";
import { authRouter } from "./routers/auth";
import { projectRouter } from "./routers/project";
import { documentRouter } from "./routers/document";
import { languageRouter } from "./routers/language";
import { translationRouter } from "./routers/translation";
import { suggestionRouter } from "./routers/suggestion";
import { userRouter } from "./routers/user";
import { memoryRouter } from "./routers/memory";
import { glossaryRouter } from "./routers/glossary";
import { pluginRouter } from "./routers/plugin";
import { settingRouter } from "./routers/setting";
import { taskRouter } from "./routers/task";

export const appRouter = router({
  auth: authRouter,
  project: projectRouter,
  document: documentRouter,
  language: languageRouter,
  translation: translationRouter,
  suggestion: suggestionRouter,
  user: userRouter,
  memory: memoryRouter,
  glossary: glossaryRouter,
  plugin: pluginRouter,
  setting: settingRouter,
  task: taskRouter,
});

export type AppRouter = typeof appRouter;
