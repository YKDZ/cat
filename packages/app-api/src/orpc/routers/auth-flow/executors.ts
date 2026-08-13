/**
 * App-layer auth flow node executors that replace the stubs from @cat/auth.
 */

import type { AuthNodeExecutor } from "@cat/auth";
import {
  executeQuery,
  findUserByIdentifier,
  countRecentAttempts,
  getAuthProviderByUserAndIssuer,
  getMfaServiceByFactorAndUser,
  type DbHandle,
} from "@cat/domain";
import type {
  AuthFactorExecutionContext,
  PluginManager,
} from "@cat/plugin-core";

/**
 * Extract a strongly-typed DbHandle from services.db (typed unknown in the auth package).
 */
// oxlint-disable-next-line no-unsafe-type-assertion -- services.db is always DrizzleClient passed in by buildScheduler
const dbFrom = (services: { db: unknown }) => services.db as DbHandle;

// Vite can execute the host and this router in separate module realms. A
// host-owned PluginManager therefore cannot use this realm's instanceof check.
const isPluginManager = (value: unknown): value is PluginManager =>
  typeof value === "object" &&
  value !== null &&
  typeof Reflect.get(value, "getServices") === "function";

// ====== Identity Resolver ======

/**
 * App-layer identity_resolver: looks up users in PostgreSQL.
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
 * PASSWORD factor executor: collects password and verifies via the plugin.
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

  if (!isPluginManager(ctx.services.pluginManager)) {
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
  const userId = ctx.blackboard.identity.userId;
  const passwordReference =
    userId === undefined
      ? null
      : await executeQuery(
          { db: dbFrom(ctx.services) },
          getAuthProviderByUserAndIssuer,
          { userId, providerIssuer: "PASSWORD" },
        );
  const passwordResolution =
    passwordReference === null
      ? null
      : pluginManager.resolveServiceImplementationReference(
          passwordReference,
          "AUTH_FACTOR",
        );
  const passwordService =
    passwordResolution?.kind === "RESOLVED" ? passwordResolution.service : null;

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
    ...(identifier === null || identifier === undefined ? {} : { identifier }),
    ...(ctx.blackboard.identity.userId === undefined
      ? {}
      : { userId: ctx.blackboard.identity.userId }),
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
        "identity.authProvider": passwordReference,
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
 * App-layer decision_router: supports MFA requirement check.
 */
export const appDecisionRouterExecutor: AuthNodeExecutor = async (
  ctx,
  nodeDef,
) => {
  if (nodeDef.config?.["checkMfaRequired"]) {
    if (!isPluginManager(ctx.services.pluginManager)) {
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
 * TOTP MFA factor executor: collects token and verifies via the plugin.
 */
export const totpFactorExecutor: AuthNodeExecutor = async (ctx, nodeDef) => {
  if (!ctx.input || Object.keys(ctx.input).length === 0) {
    return {
      updates: {},
      status: "wait_input",
      clientHint: nodeDef.clientHint,
    };
  }

  if (!isPluginManager(ctx.services.pluginManager)) {
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
  const userId = ctx.blackboard.identity.userId;
  const totpReference =
    userId === undefined
      ? null
      : await executeQuery(
          { db: dbFrom(ctx.services) },
          getMfaServiceByFactorAndUser,
          { userId, factorId: "TOTP" },
        );
  const totpResolution =
    totpReference === null
      ? null
      : pluginManager.resolveServiceImplementationReference(
          totpReference,
          "AUTH_FACTOR",
        );
  const totpService =
    totpResolution?.kind === "RESOLVED" ? totpResolution.service : null;

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
    ...(ctx.blackboard.identity.identifier === undefined
      ? {}
      : { identifier: ctx.blackboard.identity.identifier }),
    ...(ctx.blackboard.identity.userId === undefined
      ? {}
      : { userId: ctx.blackboard.identity.userId }),
    ...(totpReference === null ? {} : { serviceReference: totpReference }),
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
