import type { PageContextServer } from "vike/types";
import { createPinia } from "pinia";
import { createHTTPHelpers } from "@cat/shared/utils";
import { userFromSessionId } from "@cat/app-server-shared/utils";
import { setting } from "@cat/db";
import { parsePreferredLanguage } from "@/server/utils/i18n.ts";

export const onCreatePageContext = async (ctx: PageContextServer) => {
  ctx.pinia = createPinia();

  const helpers = createHTTPHelpers(
    ctx.runtime.hono.req.raw,
    ctx.runtime.hono.res.headers,
  );

  ctx.sessionId = helpers.getCookie("sessionId");
  ctx.displayLanguage =
    helpers.getCookie("displayLanguage") ??
    parsePreferredLanguage(helpers.getReqHeader("Accept-Language") ?? "")
      ?.toLocaleLowerCase()
      .replace("-", "_") ??
    (await setting(
      "server.default-language",
      "zh_cn",
      ctx.globalContext.prismaDB.client,
    ));
  ctx.user = await userFromSessionId(ctx.sessionId ?? "");
  ctx.helpers = helpers;
};
