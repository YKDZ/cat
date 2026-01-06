import * as auth from "./routers/auth.ts";
import * as user from "./routers/user.ts";
import * as setting from "./routers/setting.ts";
import * as document from "./routers/document.ts";
import * as element from "./routers/element.ts";
import * as glossary from "./routers/glossary.ts";
import * as language from "./routers/language.ts";
import * as memory from "./routers/memory.ts";
import * as plugin from "./routers/plugin.ts";
import * as project from "./routers/project.ts";
import * as suggestion from "./routers/suggestion.ts";
import * as translation from "./routers/translation.ts";
import * as tokenizer from "./routers/tokenizer.ts";
import * as qa from "./routers/qa.ts";

const router: AppRouter = {
  auth,
  user,
  setting,
  document,
  element,
  glossary,
  language,
  memory,
  plugin,
  project,
  suggestion,
  translation,
  tokenizer,
  qa,
};

export type AppRouter = {
  auth: typeof auth;
  user: typeof user;
  setting: typeof setting;
  document: typeof document;
  element: typeof element;
  glossary: typeof glossary;
  language: typeof language;
  memory: typeof memory;
  plugin: typeof plugin;
  project: typeof project;
  suggestion: typeof suggestion;
  translation: typeof translation;
  tokenizer: typeof tokenizer;
  qa: typeof qa;
};

export default router;
