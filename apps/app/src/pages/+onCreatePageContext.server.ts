import { executeQuery, getSetting, type DbHandle } from "@cat/domain";
import { loadUserSystemRoles } from "@cat/permissions";
import { detectMobileFromRequest, userFromSessionId } from "@cat/server-shared";
import { createHTTPHelpers, shouldUseSecureCookies } from "@cat/shared";
import { createPinia } from "pinia";
import type { PageContextServer } from "vike/types";

import { resolveDisplayLanguage } from "#/utils/display-language.ts";

const getSettingValue = async (
  drizzle: DbHandle,
  key: string,
): Promise<unknown> => await executeQuery({ db: drizzle }, getSetting, { key });

export const onCreatePageContext = async (ctx: PageContextServer) => {
  ctx.pinia = createPinia();

  const req = ctx.runtime.hono.req.raw;
  const helpers = createHTTPHelpers(
    req,
    ctx.headersResponse,
    shouldUseSecureCookies({
      isProduction: process.env["NODE_ENV"] === "production",
      requestUrl: req.url,
      forwardedProto: req.headers.get("x-forwarded-proto") ?? undefined,
    }),
  );

  ctx.isMobile = detectMobileFromRequest(req);
  ctx.sessionId = helpers.getCookie("sessionId");
  ctx.displayLanguage = await resolveDisplayLanguage({
    cookie: helpers.getCookie("displayLanguage"),
    acceptLanguage: helpers.getReqHeader("Accept-Language"),
    readDeploymentDefault: async (): Promise<unknown> =>
      await getSettingValue(
        ctx.globalContext.drizzleDB.client,
        "server.default-language",
      ),
  });
  ctx.user = await userFromSessionId(
    ctx.globalContext.drizzleDB.client,
    ctx.sessionId ?? "",
  );
  if (ctx.user) {
    const systemRoles = await loadUserSystemRoles(
      ctx.globalContext.drizzleDB.client,
      ctx.user.id,
    );
    const ip =
      helpers.getReqHeader("x-forwarded-for") ??
      helpers.getReqHeader("x-real-ip") ??
      undefined;
    const userAgent = helpers.getReqHeader("user-agent") ?? undefined;
    ctx.auth = {
      subjectType: "user",
      subjectId: ctx.user.id,
      systemRoles,
      scopes: null,
      ...(ip === undefined ? {} : { ip }),
      ...(userAgent === undefined ? {} : { userAgent }),
    };
  } else {
    ctx.auth = null;
  }
  ctx.helpers = helpers;
};
