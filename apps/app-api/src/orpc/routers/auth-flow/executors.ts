/**
 * @zh 应用层认证流程节点执行器，替换 @cat/auth 包中的桩实现。
 * @en App-layer auth flow node executors that replace the stubs from @cat/auth.
 */

import type { AuthNodeExecutor } from "@cat/auth";
import type { AuthFactorExecutionContext } from "@cat/plugin-core";

import {
  executeQuery,
  findUserByIdentifier,
  countRecentAttempts,
  type DbHandle,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";

/**
 * @zh 从 services.db 提取强类型 DbHandle（auth 包中定义为 unknown）。
 * @en Extract a strongly-typed DbHandle from services.db (typed unknown in the auth package).
 */
// oxlint-disable-next-line no-unsafe-type-assertion -- services.db is always DrizzleClient passed in by buildScheduler
const dbFrom = (services: { db: unknown }) => services.db as DbHandle;

// ====== Identity Resolver ======

/**
 * @zh 应用层 identity_resolver：通过数据库查找用户。
 * @en App-layer identity_resolver: looks up users in PostgreSQL.
 */
export const appIdentityResolverExecutor: AuthNodeExecutor = async (
  ctx,
  nodeDef,
) => {
  // oxlint-disable-next-line no-unsafe-type-assertion
  const identifierOutput = ctx.blackboard.nodeOutputs["collect-identifier"] as
    | Record<string, unknown>
    | undefined;

  const identifier =
    typeof identifierOutput?.identifier === "string"
      ? identifierOutput.identifier
      : typeof identifierOutput?.email === "string"
        ? identifierOutput.email
        : null;

  if (!identifier) {
    return {
      updates: {},
      status: "failed",
      error: {
        code: "IDENTIFIER_MISSING",
        message: "No identifier found on blackboard",
      },
    };
  }

  // Rate‑limiting: block after 10 failures in 15 min
  const recentFailures = await executeQuery(
    { db: dbFrom(ctx.services) },
    countRecentAttempts,
    { identifier, ip: ctx.httpContext.ip, windowMinutes: 15 },
  );
  if (recentFailures >= 10) {
    return {
      updates: {},
      status: "failed",
      error: {
        code: "RATE_LIMITED",
        message: "Too many failed login attempts. Please try again later.",
      },
    };
  }

  const user = await executeQuery(
    { db: dbFrom(ctx.services) },
    findUserByIdentifier,
    { identifier },
  );

  if (user) {
    return {
      updates: {
        [`nodeOutputs.${nodeDef.id}`]: { userFound: true, identifier },
        "identity.userId": user.id,
        "identity.identifier": identifier,
      },
      status: "advance",
    };
  }

  return {
    updates: {
      [`nodeOutputs.${nodeDef.id}`]: { userFound: false, identifier },
      "identity.identifier": identifier,
    },
    status: "advance",
  };
};

// ====== PASSWORD factor executor ======

/**
 * @zh PASSWORD 认证因子执行器：收集密码并通过插件验证。
 * @en PASSWORD factor executor: collects password and verifies via the plugin.
 */
export const passwordFactorExecutor: AuthNodeExecutor = async (
  ctx,
  nodeDef,
) => {
  if (!ctx.input || Object.keys(ctx.input).length === 0) {
    return {
      updates: {},
      status: "wait_input",
      clientHint: nodeDef.clientHint,
    };
  }

  if (!(ctx.services.pluginManager instanceof PluginManager)) {
    return {
      updates: {},
      status: "failed",
      error: {
        code: "INTERNAL_ERROR",
        message: "pluginManager is not available",
      },
    };
  }

  const pluginManager = ctx.services.pluginManager;
  const passwordService = pluginManager
    .getServices("AUTH_FACTOR")
    .find(({ service }) => service.getId() === "PASSWORD");

  if (!passwordService) {
    return {
      updates: {},
      status: "failed",
      error: {
        code: "FACTOR_NOT_CONFIGURED",
        message: "PASSWORD factor not available",
      },
    };
  }

  const factor = passwordService.service;
  const identifier =
    ctx.blackboard.identity.identifier ?? ctx.blackboard.identity.email;

  const factorCtx: AuthFactorExecutionContext = {
    identifier: identifier ?? undefined,
    userId: ctx.blackboard.identity.userId,
    input: ctx.input,
    httpContext: {
      ip: ctx.httpContext.ip,
      userAgent: ctx.httpContext.userAgent,
    },
  };

  const result = await factor.execute(factorCtx);

  if (result.status === "success") {
    return {
      updates: {
        [`nodeOutputs.${nodeDef.id}`]: { verified: true },
        aal: result.aal,
        completedFactors: [
          ...ctx.blackboard.completedFactors,
          {
            factorType: "PASSWORD",
            factorId: passwordService.id,
            completedAt: new Date().toISOString(),
            aal: result.aal,
          },
        ],
        authFactorDbId: passwordService.dbId,
      },
      status: "advance",
    };
  }

  return {
    updates: {
      [`nodeOutputs.${nodeDef.id}`]: { verified: false },
    },
    status: "wait_input",
    clientHint: nodeDef.clientHint,
    error: result.error,
  };
};

// ====== MFA-aware decision router ======

/**
 * @zh 应用层 decision_router：支持 MFA 检查。
 * @en App-layer decision_router: supports MFA requirement check.
 */
export const appDecisionRouterExecutor: AuthNodeExecutor = async (
  ctx,
  nodeDef,
) => {
  if (nodeDef.config?.["checkMfaRequired"]) {
    if (!(ctx.services.pluginManager instanceof PluginManager)) {
      return {
        updates: {
          [`nodeOutputs.${nodeDef.id}`]: { mfaRequired: false },
        },
        status: "advance",
      };
    }

    const pluginManager = ctx.services.pluginManager;
    const mfaFactors = pluginManager
      .getServices("AUTH_FACTOR")
      .filter(({ service }) => service.getAal() === 2);

    return {
      updates: {
        [`nodeOutputs.${nodeDef.id}`]: { mfaRequired: mfaFactors.length > 0 },
      },
      status: "advance",
    };
  }

  // Default: just advance
  return {
    updates: {},
    status: "advance",
  };
};

// ====== TOTP factor executor ======

/**
 * @zh TOTP MFA 因子执行器：收集验证码并通过插件验证。
 * @en TOTP MFA factor executor: collects token and verifies via the plugin.
 */
export const totpFactorExecutor: AuthNodeExecutor = async (ctx, nodeDef) => {
  if (!ctx.input || Object.keys(ctx.input).length === 0) {
    return {
      updates: {},
      status: "wait_input",
      clientHint: nodeDef.clientHint,
    };
  }

  if (!(ctx.services.pluginManager instanceof PluginManager)) {
    return {
      updates: {},
      status: "failed",
      error: {
        code: "INTERNAL_ERROR",
        message: "pluginManager is not available",
      },
    };
  }

  const pluginManager = ctx.services.pluginManager;
  const totpService = pluginManager
    .getServices("AUTH_FACTOR")
    .find(({ service }) => service.getId() === "TOTP");

  if (!totpService) {
    return {
      updates: {},
      status: "failed",
      error: {
        code: "FACTOR_NOT_CONFIGURED",
        message: "TOTP factor not available",
      },
    };
  }

  const factor = totpService.service;

  const factorCtx: AuthFactorExecutionContext = {
    identifier: ctx.blackboard.identity.identifier ?? undefined,
    userId: ctx.blackboard.identity.userId,
    input: ctx.input,
    httpContext: {
      ip: ctx.httpContext.ip,
      userAgent: ctx.httpContext.userAgent,
    },
  };

  const result = await factor.execute(factorCtx);

  if (result.status === "success") {
    return {
      updates: {
        [`nodeOutputs.${nodeDef.id}`]: { verified: true },
        aal: result.aal,
        completedFactors: [
          ...ctx.blackboard.completedFactors,
          {
            factorType: "TOTP",
            factorId: totpService.id,
            completedAt: new Date().toISOString(),
            aal: result.aal,
          },
        ],
      },
      status: "advance",
    };
  }

  return {
    updates: {
      [`nodeOutputs.${nodeDef.id}`]: { verified: false },
    },
    status: "wait_input",
    clientHint: nodeDef.clientHint,
    error: result.error,
  };
};
