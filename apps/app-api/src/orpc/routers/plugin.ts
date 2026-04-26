import {
  executeCommand,
  executeQuery,
  getPlugin,
  getPluginConfig,
  getPluginConfigInstance,
  getPluginServiceById,
  isPluginInstalled,
  listPluginServiceIdsByType,
  listPlugins,
  upsertPluginConfigInstance,
} from "@cat/domain";
import { ComponentRecordSchema, PluginManager } from "@cat/plugin-core";
import {
  PluginConfigInstanceSchema,
  PluginConfigSchema,
  PluginSchema,
} from "@cat/shared";
import { ScopeTypeSchema } from "@cat/shared";
import { nonNullSafeZDotJson } from "@cat/shared";
import {
  AuthMethodSchema,
  TranslationAdvisorDataSchema,
  type AuthMethod,
  type TranslationAdvisorData,
} from "@cat/shared";
import { ORPCError } from "@orpc/client";
import * as z from "zod";

import { authed, base, checkPermission } from "@/orpc/server";

export const reload = authed
  .input(
    z.object({
      scopeType: ScopeTypeSchema,
      scopeId: z.string(),
    }),
  )
  .use(checkPermission("system", "admin"), () => "*")
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { scopeType, scopeId } = input;

    const registry = PluginManager.get(scopeType, scopeId);

    await registry.restore(drizzle);
  });

export const reloadPlugin = authed
  .input(
    z.object({
      pluginId: z.string(),
      scopeType: ScopeTypeSchema,
      scopeId: z.string(),
    }),
  )
  .use(checkPermission("system", "admin"), () => "*")
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { pluginId, scopeType, scopeId } = input;

    const registry = PluginManager.get(scopeType, scopeId);

    await drizzle.transaction(async (tx) => {
      await registry.reloadPlugin(tx, pluginId);
    });
  });

export const getConfigInstance = authed
  .input(
    z.object({
      pluginId: z.string(),
      scopeType: ScopeTypeSchema,
      scopeId: z.string(),
    }),
  )
  .output(PluginConfigInstanceSchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    return executeQuery({ db: drizzle }, getPluginConfigInstance, input);
  });

export const getConfig = authed
  .input(
    z.object({
      pluginId: z.string(),
    }),
  )
  .output(PluginConfigSchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    return executeQuery({ db: drizzle }, getPluginConfig, input);
  });

export const upsertConfigInstance = authed
  .input(
    z.object({
      pluginId: z.string(),
      scopeType: ScopeTypeSchema,
      scopeId: z.string(),
      value: nonNullSafeZDotJson,
    }),
  )
  .use(checkPermission("system", "admin"), () => "*")
  .output(PluginConfigInstanceSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;
    return executeCommand({ db: drizzle }, upsertPluginConfigInstance, {
      ...input,
      creatorId: user.id,
    });
  });

export const get = authed
  .input(
    z.object({
      pluginId: z.string(),
    }),
  )
  .output(PluginSchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    return executeQuery({ db: drizzle }, getPlugin, input);
  });

export const getAll = authed
  .output(z.array(PluginSchema))
  .handler(async ({ context }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return executeQuery({ db: drizzle }, listPlugins, {});
  });

export const getAllAuthMethod = base
  .output(z.array(AuthMethodSchema))
  .handler(async ({ context }) => {
    const {
      drizzleDB: { client: drizzle },
      pluginManager,
    } = context;

    const providersData = await executeQuery(
      { db: drizzle },
      listPluginServiceIdsByType,
      { serviceType: "AUTH_FACTOR" },
    );

    const methods: AuthMethod[] = [];

    for (const { dbId, id, service } of pluginManager.getServices(
      "AUTH_FACTOR",
    )) {
      if (service.getAal() === 1 && providersData.includes(service.getId())) {
        methods.push({
          providerDBId: dbId,
          providerId: id,
          name: service.getName(),
          icon: service.getIcon(),
          flowType: "CREDENTIAL",
        });
      }
    }

    return methods;
  });

export const getAllTranslationAdvisors = authed
  .output(z.array(TranslationAdvisorDataSchema))
  .handler(async ({ context }) => {
    const { pluginManager } = context;

    return Promise.all(
      pluginManager.getServices("TRANSLATION_ADVISOR").map(
        async ({ dbId, service }) =>
          ({
            id: dbId,
            name: service.getDisplayName(),
          }) satisfies TranslationAdvisorData,
      ),
    );
  });

export const getTranslationAdvisor = authed
  .input(
    z.object({
      advisorId: z.int(),
    }),
  )
  .output(TranslationAdvisorDataSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      pluginManager,
    } = context;
    const { advisorId } = input;

    const dbAdvisor = await executeQuery(
      { db: drizzle },
      getPluginServiceById,
      {
        serviceDbId: advisorId,
        serviceType: "TRANSLATION_ADVISOR",
      },
    );

    if (!dbAdvisor) {
      throw new ORPCError("NOT_FOUND", {
        message: "Translation Advisor not found",
      });
    }

    const service = pluginManager.getService(
      dbAdvisor.pluginId,
      "TRANSLATION_ADVISOR",
      dbAdvisor.serviceId,
    );

    if (!service) throw new ORPCError("NOT_FOUND");

    return {
      id: advisorId,
      name: service.service.getDisplayName(),
    };
  });

export const isInstalled = authed
  .input(
    z.object({
      pluginId: z.string(),
      scopeType: ScopeTypeSchema,
      scopeId: z.string(),
    }),
  )
  .output(z.boolean())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    return executeQuery({ db: drizzle }, isPluginInstalled, input);
  });

export const getComponentsOfSlot = authed
  .input(
    z.object({
      slotId: z.string(),
    }),
  )
  .output(z.array(ComponentRecordSchema))
  .handler(async ({ context, input }) => {
    const { pluginManager } = context;
    const { slotId } = input;

    const components = pluginManager.getComponentOfSlot(slotId);

    return components;
  });
