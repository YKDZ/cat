import * as agent from "./routers/agent.ts";
import * as auth from "./routers/auth.ts";
import * as comment from "./routers/comment.ts";
import * as document from "./routers/document.ts";
import * as element from "./routers/element.ts";
import * as ghostText from "./routers/ghost-text.ts";
import * as glossary from "./routers/glossary.ts";
import * as language from "./routers/language.ts";
import * as memory from "./routers/memory.ts";
import * as plugin from "./routers/plugin.ts";
import * as project from "./routers/project.ts";
import * as qa from "./routers/qa.ts";
import * as setting from "./routers/setting.ts";
import * as suggestion from "./routers/suggestion.ts";
import * as tokenizer from "./routers/tokenizer.ts";
import * as translation from "./routers/translation.ts";
import * as user from "./routers/user.ts";

const router: AppRouter = {
  agent,
  auth,
  user,
  setting,
  document,
  element,
  ghostText,
  glossary,
  language,
  memory,
  plugin,
  project,
  suggestion,
  translation,
  tokenizer,
  qa,
  comment,
};

export type AppRouter = {
  agent: typeof agent;
  auth: typeof auth;
  user: typeof user;
  setting: typeof setting;
  document: typeof document;
  element: typeof element;
  ghostText: typeof ghostText;
  glossary: typeof glossary;
  language: typeof language;
  memory: typeof memory;
  plugin: typeof plugin;
  project: typeof project;
  suggestion: typeof suggestion;
  translation: typeof translation;
  tokenizer: typeof tokenizer;
  qa: typeof qa;
  comment: typeof comment;
};

export default router;
