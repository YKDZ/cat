import {
  executeQuery,
  getPlugin,
  getPluginConfig,
  getPluginConfigInstance,
  isPluginInstalled,
  listPluginServiceIdsByType,
  listPlugins,
} from "@cat/domain";
import { ComponentRecordSchema } from "@cat/plugin-core";
import {
  PluginConfigInstanceSchema,
  PluginConfigSchema,
  PluginSchema,
  ServiceImplementationReferenceSchema,
} from "@cat/shared";
import { ScopeTypeSchema } from "@cat/shared";
import {
  AuthMethodSchema,
  TranslationAdvisorDataSchema,
  type AuthMethod,
  type TranslationAdvisorData,
} from "@cat/shared";
import { ORPCError } from "@orpc/client";
import * as z from "zod";

import { authed, base, checkPermission } from "#/orpc/server.ts";
import {
  installPluginToScope,
  getPluginDetailModel,
  migratePluginConfigAndApply,
  reloadPluginRuntime,
  resolvePluginManager,
  savePluginConfigAndApply,
  uninstallPluginFromScope,
} from "#/services/plugin-management.ts";
import { probePluginConfig } from "#/services/plugin-probe.ts";
import {
  PluginActionResultSchema,
  PluginDetailSchema,
  MigratePluginConfigAndApplyInputSchema,
  PluginProbeResultSchema,
  PluginScopeInputSchema,
  ProbePluginConfigInputSchema,
  SavePluginConfigAndApplyInputSchema,
} from "#/services/plugin-schemas.ts";

export const getDetail = authed
  .input(PluginScopeInputSchema)
  .use(checkPermission("system", "admin"), () => "*")
  .output(PluginDetailSchema.nullable())
  .handler(async ({ context, input }) => {
    return await getPluginDetailModel(context, input);
  });

export const install = authed
  .input(PluginScopeInputSchema)
  .use(checkPermission("system", "admin"), () => "*")
  .output(PluginActionResultSchema)
  .handler(async ({ context, input }) => {
    return await installPluginToScope(context, input);
  });

export const uninstall = authed
  .input(PluginScopeInputSchema)
  .use(checkPermission("system", "admin"), () => "*")
  .output(PluginActionResultSchema)
  .handler(async ({ context, input }) => {
    return await uninstallPluginFromScope(context, input);
  });

export const saveConfigAndApply = authed
  .input(SavePluginConfigAndApplyInputSchema)
  .use(checkPermission("system", "admin"), () => "*")
  .output(PluginActionResultSchema)
  .handler(async ({ context, input }) => {
    return await savePluginConfigAndApply(context, input);
  });

export const migrateConfigAndApply = authed
  .input(MigratePluginConfigAndApplyInputSchema)
  .use(checkPermission("system", "admin"), () => "*")
  .output(PluginActionResultSchema)
  .handler(async ({ context, input }) => {
    return await migratePluginConfigAndApply(context, input);
  });

export const probeConfig = authed
  .input(ProbePluginConfigInputSchema)
  .use(checkPermission("system", "admin"), () => "*")
  .output(PluginProbeResultSchema)
  .handler(async ({ context, input }) => {
    return await probePluginConfig(context, input);
  });

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

    const registry = resolvePluginManager(context, { scopeType, scopeId });

    await registry.restore(drizzle);
  });

export const reloadPlugin = authed
  .input(PluginScopeInputSchema)
  .use(checkPermission("system", "admin"), () => "*")
  .output(PluginActionResultSchema)
  .handler(async ({ context, input }) => {
    return await reloadPluginRuntime(context, input);
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

    for (const { id, service } of pluginManager.getServices("AUTH_FACTOR")) {
      if (service.getAal() === 1 && providersData.includes(service.getId())) {
        methods.push({
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
        async (registered) =>
          ({
            reference:
              pluginManager.createServiceImplementationReference(registered),
            name: registered.service.getDisplayName(),
          }) satisfies TranslationAdvisorData,
      ),
    );
  });

export const getTranslationAdvisor = authed
  .input(
    z.object({
      advisor: ServiceImplementationReferenceSchema,
    }),
  )
  .output(TranslationAdvisorDataSchema)
  .handler(async ({ context, input }) => {
    const { pluginManager } = context;
    const service = pluginManager.resolveServiceImplementationReference(
      input.advisor,
      "TRANSLATION_ADVISOR",
    );
    if (service.kind !== "RESOLVED") throw new ORPCError("NOT_FOUND");

    return {
      reference: input.advisor,
      name: service.service.service.getDisplayName(),
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
