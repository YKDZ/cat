import type { PageContextServer } from "vike/types";

import { executeQuery, getSetting } from "@cat/domain";
import { loadUserSystemRoles } from "@cat/permissions";
import {
  createHTTPHelpers,
  detectMobile,
  userFromSessionId,
} from "@cat/server-shared";
import { parsePreferredLanguage } from "@cat/shared";
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
  if (ctx.user) {
    const systemRoles = await loadUserSystemRoles(
      ctx.globalContext.drizzleDB.client,
      ctx.user.id,
    );
    ctx.auth = {
      subjectType: "user",
      subjectId: ctx.user.id,
      systemRoles,
      scopes: null,
      ip:
        helpers.getReqHeader("x-forwarded-for") ??
        helpers.getReqHeader("x-real-ip") ??
        undefined,
      userAgent: helpers.getReqHeader("user-agent") ?? undefined,
    };
  } else {
    ctx.auth = null;
  }
  ctx.helpers = helpers;
};
