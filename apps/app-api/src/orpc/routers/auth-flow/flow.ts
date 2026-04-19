import {
  AuthFlowRegistry,
  AuthFlowScheduler,
  AuthNodeRegistry,
  RedisFlowStorage,
  credentialCollectorExecutor,
  pluginCustomExecutor,
  sessionFinalizerExecutor,
  standardLoginFlow,
  registerFlow,
} from "@cat/auth";
import * as z from "zod";

import type { Context } from "@/utils/context";

import {
  appDecisionRouterExecutor,
  appIdentityResolverExecutor,
  passwordFactorExecutor,
  totpFactorExecutor,
} from "@/orpc/routers/auth-flow/executors.ts";
import { finishLogin } from "@/orpc/routers/auth/schemas.ts";
import { base } from "@/orpc/server";

// ====== Schemas ======

const FlowStateSchema = z.object({
  flowId: z.string(),
  status: z.enum(["pending", "in_progress", "completed", "failed", "expired"]),
  currentNode: z
    .object({
      nodeId: z.string(),
      hint: z.object({
        componentType: z.string(),
        displayInfo: z
          .object({
            title: z.string().optional(),
            description: z.string().optional(),
            formSchema: z.custom<Record<string, unknown>>().optional(),
          })
          .optional(),
      }),
    })
    .nullable(),
  progress: z.object({
    completedSteps: z.int(),
    totalEstimatedSteps: z.int(),
  }),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      retriesRemaining: z.int().optional(),
    })
    .optional(),
  /** Set on completed login flows so the caller can create the UI session. */
  sessionCreated: z.boolean().optional(),
});

// ====== Scheduler factory ======

type SchedulerCtx = Pick<
  Context,
  "redis" | "sessionStore" | "cacheStore" | "drizzleDB" | "pluginManager"
>;

const buildScheduler = (ctx: SchedulerCtx): AuthFlowScheduler => {
  const storage = new RedisFlowStorage(ctx.redis.redis);

  const flowRegistry = new AuthFlowRegistry();
  flowRegistry.register(standardLoginFlow);
  flowRegistry.register(registerFlow);

  const nodeRegistry = new AuthNodeRegistry();
  nodeRegistry.register("credential_collector", credentialCollectorExecutor);
  nodeRegistry.register("challenge_verifier", totpFactorExecutor);
  nodeRegistry.register("decision_router", appDecisionRouterExecutor);
  nodeRegistry.register("identity_resolver", appIdentityResolverExecutor);
  nodeRegistry.register("session_finalizer", sessionFinalizerExecutor);
  nodeRegistry.register("plugin_custom", pluginCustomExecutor);
  nodeRegistry.register("PASSWORD", passwordFactorExecutor);
  nodeRegistry.register("TOTP", totpFactorExecutor);

  return new AuthFlowScheduler({
    flowRegistry,
    nodeRegistry,
    storage,
    services: {
      sessionStore: ctx.sessionStore,
      cacheStore: ctx.cacheStore,
      db: ctx.drizzleDB.client,
      pluginManager: ctx.pluginManager,
    },
  });
};

const buildHttpContext = (context: Context) => ({
  ip:
    context.helpers.getReqHeader("x-forwarded-for") ??
    context.helpers.getReqHeader("x-real-ip") ??
    "unknown",
  userAgent: context.helpers.getReqHeader("user-agent") ?? "unknown",
  csrfToken:
    context.helpers.getCookie("csrfToken") ??
    context.helpers.getReqHeader("x-csrf-token") ??
    context.csrfToken ??
    "",
  cookies: {},
});

// ====== Handlers ======

export const initFlow = base
  .input(
    z.object({
      flowType: z.enum(["login", "register"]),
    }),
  )
  .output(FlowStateSchema)
  .handler(async ({ context, input }) => {
    const scheduler = buildScheduler(context);

    const flowDefId =
      input.flowType === "login" ? "standard-login" : "register";

    const state = await scheduler.initFlow({
      flowDefId,
      httpContext: buildHttpContext(context),
    });

    return { ...state };
  });

export const advanceFlow = base
  .input(
    z.object({
      flowId: z.uuidv4(),
      input: z.record(z.string(), z.unknown()).optional(),
    }),
  )
  .output(FlowStateSchema)
  .handler(async ({ context, input }) => {
    const scheduler = buildScheduler(context);

    const state = await scheduler.advanceFlow({
      flowId: input.flowId,
      input: input.input,
      httpContext: buildHttpContext(context),
    });

    // On flow completion, create the browser session from the blackboard.
    if (state.status === "completed") {
      const storage = new RedisFlowStorage(context.redis.redis);
      const snap = await storage.load(input.flowId);

      const userId = snap?.data?.identity?.userId;
      if (userId) {
        const authFactorDbId = (snap?.data as Record<string, unknown>)?.[
          "authFactorDbId"
        ];
        const snapData = snap?.data;
        await finishLogin(
          context.sessionStore,
          context.drizzleDB.client,
          userId,
          {
            authProviderId:
              typeof authFactorDbId === "number" ? authFactorDbId : 0,
            ...(snapData?.aal !== undefined ? { aal: snapData.aal } : {}),
            ...(snapData?.completedFactors?.length
              ? { completedFactors: JSON.stringify(snapData.completedFactors) }
              : {}),
            flowTraceId: input.flowId,
          },
          context.helpers,
        );
        return { ...state, sessionCreated: true };
      }
    }

    return { ...state };
  });

export const getFlowState = base
  .input(
    z.object({
      flowId: z.uuidv4(),
    }),
  )
  .output(FlowStateSchema.nullable())
  .handler(async ({ context, input }) => {
    const scheduler = buildScheduler(context);

    const state = await scheduler.getFlowState(input.flowId);
    if (!state) return null;

    return { ...state };
  });
