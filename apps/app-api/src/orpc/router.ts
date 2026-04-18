import * as agent from "./routers/agent.ts";
import * as authFlow from "./routers/auth-flow/index.ts";
import * as auth from "./routers/auth/index.ts";
import * as changeset from "./routers/changeset.ts";
import * as comment from "./routers/comment.ts";
import * as document from "./routers/document.ts";
import * as element from "./routers/element.ts";
import * as ghostText from "./routers/ghost-text.ts";
import * as glossary from "./routers/glossary.ts";
import * as issueComment from "./routers/issue-comment.ts";
import * as issue from "./routers/issue.ts";
import * as language from "./routers/language.ts";
import * as memory from "./routers/memory.ts";
import * as notification from "./routers/notification.ts";
import * as permission from "./routers/permission.ts";
import * as plugin from "./routers/plugin.ts";
import * as projectFeatures from "./routers/project-features.ts";
import * as projectSettings from "./routers/project-settings.ts";
import * as project from "./routers/project.ts";
import * as pullRequest from "./routers/pull-request.ts";
import * as qa from "./routers/qa.ts";
import * as setting from "./routers/setting.ts";
import * as suggestion from "./routers/suggestion.ts";
import * as tokenizer from "./routers/tokenizer.ts";
import * as translation from "./routers/translation.ts";
import * as trustSettings from "./routers/trust-settings.ts";
import * as user from "./routers/user.ts";

const router: AppRouter = {
  agent,
  changeset,
  issue,
  issueComment,
  pullRequest,
  projectFeatures,
  projectSettings,
  trustSettings,
  auth,
  authFlow,
  user,
  setting,
  document,
  element,
  ghostText,
  glossary,
  language,
  memory,
  permission,
  plugin,
  project,
  suggestion,
  translation,
  tokenizer,
  qa,
  comment,
  notification,
};

export type AppRouter = {
  agent: typeof agent;
  changeset: typeof changeset;
  issue: typeof issue;
  issueComment: typeof issueComment;
  pullRequest: typeof pullRequest;
  projectFeatures: typeof projectFeatures;
  projectSettings: typeof projectSettings;
  trustSettings: typeof trustSettings;
  auth: typeof auth;
  authFlow: typeof authFlow;
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
  permission: typeof permission;
  notification: typeof notification;
};

export default router;
