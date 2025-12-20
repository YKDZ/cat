import type { PageContextServer } from "vike/types";
import { createPinia } from "pinia";
import {
  createHTTPHelpers,
  detectMobile,
  userFromSessionId,
} from "@cat/app-server-shared/utils";
import { getSetting } from "@cat/db";
import { parsePreferredLanguage } from "@cat/shared/utils";

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
    (await getSetting(
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
