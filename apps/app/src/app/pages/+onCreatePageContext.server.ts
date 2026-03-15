import type { PageContextServer } from "vike/types";

import {
  createHTTPHelpers,
  detectMobile,
  userFromSessionId,
} from "@cat/server-shared";
import { executeQuery, getSetting } from "@cat/domain";
import { parsePreferredLanguage } from "@cat/shared/utils";
import { createPinia } from "pinia";

const getStringSetting = async (
  drizzle: PageContextServer["globalContext"]["drizzleDB"]["client"],
  key: string,
  fallback: string,
): Promise<string> => {
  const value = await executeQuery({ db: drizzle }, getSetting, { key });
  return typeof value === "string" ? value : fallback;
};

export const onCreatePageContext = async (ctx: PageContextServer) => {
  if (!ctx.runtime.req || !ctx.runtime.res) {
    throw new Error("Request or Response object is missing in vike runtime.");
  }

  ctx.pinia = createPinia();

  const helpers = createHTTPHelpers(ctx.runtime.req, ctx.runtime.res);

  ctx.isMobile = detectMobile(ctx.runtime.req);
  ctx.sessionId = helpers.getCookie("sessionId");
  ctx.displayLanguage =
    helpers.getCookie("displayLanguage") ??
    parsePreferredLanguage(helpers.getReqHeader("Accept-Language") ?? "")
      ?.toLocaleLowerCase()
      .replace("-", "_") ??
    (await getStringSetting(
      ctx.globalContext.drizzleDB.client,
      "server.default-language",
      "zh_cn",
    ));
  ctx.user = await userFromSessionId(
    ctx.globalContext.drizzleDB.client,
    ctx.sessionId ?? "",
  );
  ctx.helpers = helpers;
};
