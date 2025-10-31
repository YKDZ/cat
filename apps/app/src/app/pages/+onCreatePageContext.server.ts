import type { PageContextServer } from "vike/types";
import { createPinia } from "pinia";
import {
  createHTTPHelpers,
  userFromSessionId,
} from "@cat/app-server-shared/utils";
import { getSetting } from "@cat/db";
import { parsePreferredLanguage } from "@/server/utils/i18n.ts";

export const onCreatePageContext = async (ctx: PageContextServer) => {
  ctx.pinia = createPinia();

  const helpers = createHTTPHelpers(ctx.runtime.req!, ctx.runtime.res!);

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
