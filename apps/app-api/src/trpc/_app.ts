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

type AppRouterRecord = {
  setting: typeof settingRouter;
  task: typeof taskRouter;
  plugin: typeof pluginRouter;
  glossary: typeof glossaryRouter;
  memory: typeof memoryRouter;
  user: typeof userRouter;
  suggestion: typeof suggestionRouter;
  translation: typeof translationRouter;
  language: typeof languageRouter;
  document: typeof documentRouter;
  auth: typeof authRouter;
  project: typeof projectRouter;
};

const appRouterRecord: AppRouterRecord = {
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
};

export const appRouter = router(appRouterRecord);

export type AppRouter = typeof appRouter;
