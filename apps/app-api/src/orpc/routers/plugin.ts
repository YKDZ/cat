import * as z from "zod/v4";
import {
  PluginConfigInstanceSchema,
  PluginConfigSchema,
  PluginSchema,
} from "@cat/shared/schema/drizzle/plugin";
import {
  AuthMethodSchema,
  TranslationAdvisorDataSchema,
  type AuthMethod,
  type TranslationAdvisorData,
} from "@cat/shared/schema/misc";
import {
  plugin as pluginTable,
  pluginConfigInstance as pluginConfigInstanceTable,
  desc,
  pluginConfig,
  eq,
  and,
  pluginInstallation,
  getColumns,
  pluginService,
} from "@cat/db";
import { assertSingleNonNullish, assertSingleOrNull } from "@cat/shared/utils";
import { ComponentRecordSchema, PluginRegistry } from "@cat/plugin-core";
import { nonNullSafeZDotJson } from "@cat/shared/schema/json";
import { ScopeTypeSchema } from "@cat/shared/schema/drizzle/enum";
import { authed, base } from "@/orpc/server";
import { ORPCError } from "@orpc/client";

export const reload = authed
  .input(
    z.object({
      scopeType: ScopeTypeSchema,
      scopeId: z.string(),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { scopeType, scopeId } = input;

    const registry = PluginRegistry.get(scopeType, scopeId);

    await drizzle.transaction(async (tx) => {
      await registry.reload(tx, globalThis.app);
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
    const { pluginId, scopeId, scopeType } = input;

    const installation = assertSingleOrNull(
      await drizzle
        .select({
          id: pluginInstallation.id,
        })
        .from(pluginInstallation)
        .where(
          and(
            eq(pluginInstallation.pluginId, pluginId),
            eq(pluginInstallation.scopeType, scopeType),
            eq(pluginInstallation.scopeId, scopeId),
          ),
        ),
    );

    if (!installation) return null;

    return assertSingleOrNull(
      await drizzle
        .select(getColumns(pluginConfigInstanceTable))
        .from(pluginConfigInstanceTable)
        .innerJoin(pluginConfig, eq(pluginConfig.pluginId, pluginId))
        .where(
          and(
            eq(pluginConfigInstanceTable.configId, pluginConfig.id),
            eq(pluginConfigInstanceTable.pluginInstallationId, installation.id),
          ),
        ),
    );
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
    const { pluginId } = input;

    return assertSingleOrNull(
      await drizzle
        .select()
        .from(pluginConfig)
        .where(eq(pluginConfig.pluginId, pluginId)),
    );
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
  .output(PluginConfigInstanceSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;
    const { pluginId, scopeType, scopeId, value } = input;

    const installation = assertSingleNonNullish(
      await drizzle
        .select({
          id: pluginInstallation.id,
        })
        .from(pluginInstallation)
        .where(
          and(
            eq(pluginInstallation.pluginId, pluginId),
            eq(pluginInstallation.scopeType, scopeType),
            eq(pluginInstallation.scopeId, scopeId),
          ),
        ),
      `Plugin not installed`,
    );

    return await drizzle.transaction(async (tx) => {
      const config = assertSingleNonNullish(
        await drizzle
          .select({
            id: pluginConfig.id,
          })
          .from(pluginConfig)
          .where(eq(pluginConfig.pluginId, pluginId)),
      );

      return assertSingleNonNullish(
        await tx
          .insert(pluginConfigInstanceTable)
          .values({
            value,
            creatorId: user.id,
            configId: config.id,
            pluginInstallationId: installation.id,
          })
          .onConflictDoUpdate({
            target: [
              pluginConfigInstanceTable.pluginInstallationId,
              pluginConfigInstanceTable.configId,
            ],
            set: {
              value,
            },
          })
          .returning(),
      );
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
    const { pluginId } = input;

    return assertSingleOrNull(
      await drizzle
        .select()
        .from(pluginTable)
        .where(eq(pluginTable.id, pluginId)),
    );
  });

export const getAll = authed
  .output(z.array(PluginSchema))
  .handler(async ({ context }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await drizzle
      .select(getColumns(pluginTable))
      .from(pluginTable)
      .orderBy(desc(pluginTable.id));
  });

export const getAllAuthMethod = base
  .output(z.array(AuthMethodSchema))
  .handler(async ({ context }) => {
    const {
      drizzleDB: { client: drizzle },
      pluginRegistry,
    } = context;

    const providersData = await drizzle
      .select({
        serviceId: pluginService.serviceId,
      })
      .from(pluginService)
      .where(eq(pluginService.serviceType, "AUTH_PROVIDER"));

    const methods: AuthMethod[] = [];

    await Promise.all(
      providersData.map(async ({ serviceId }) => {
        const providers = pluginRegistry.getPluginServices("AUTH_PROVIDER");

        await Promise.all(
          providers
            .filter(({ service }) => serviceId === service.getId())
            .map(async ({ record, service }) => {
              methods.push({
                providerDBId: await pluginRegistry.getPluginServiceDbId(
                  drizzle,
                  record.pluginId,
                  record.type,
                  record.id,
                ),
                providerId: record.id,
                name: service.getName(),
                icon: service.getIcon(),
              });
            }),
        );
      }),
    );

    return methods;
  });

export const getAllTranslationAdvisors = authed
  .output(z.array(TranslationAdvisorDataSchema))
  .handler(async ({ context }) => {
    const {
      drizzleDB: { client: drizzle },
      pluginRegistry,
    } = context;

    return Promise.all(
      pluginRegistry.getPluginServices("TRANSLATION_ADVISOR").map(
        async ({ record, service }) =>
          ({
            id: await pluginRegistry.getPluginServiceDbId(
              drizzle,
              record.pluginId,
              record.type,
              record.id,
            ),
            name: service.getName(),
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
      pluginRegistry,
    } = context;
    const { advisorId } = input;

    const dbAdvisor = assertSingleNonNullish(
      await drizzle
        .select({
          pluginId: pluginInstallation.pluginId,
          serviceId: pluginService.serviceId,
          serviceType: pluginService.serviceType,
        })
        .from(pluginService)
        .innerJoin(
          pluginInstallation,
          eq(pluginService.pluginInstallationId, pluginInstallation.id),
        )
        .where(
          and(
            eq(pluginService.id, advisorId),
            eq(pluginService.serviceType, "TRANSLATION_ADVISOR"),
          ),
        ),
      "Translation Advisor not found",
    );

    const service = pluginRegistry.getPluginService(
      dbAdvisor.pluginId,
      "TRANSLATION_ADVISOR",
      dbAdvisor.serviceId,
    )!;

    if (!service) throw new ORPCError("NOT_FOUND");

    return {
      id: advisorId,
      name: service.getName(),
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
    const { pluginId, scopeId, scopeType } = input;

    const installation = assertSingleOrNull(
      await drizzle
        .select({
          id: pluginInstallation.id,
        })
        .from(pluginInstallation)
        .where(
          and(
            eq(pluginInstallation.pluginId, pluginId),
            eq(pluginInstallation.scopeType, scopeType),
            eq(pluginInstallation.scopeId, scopeId),
          ),
        ),
    );

    return !!installation;
  });

export const getComponentsOfSlot = authed
  .input(
    z.object({
      slotId: z.string(),
    }),
  )
  .output(z.array(ComponentRecordSchema))
  .handler(async ({ context, input }) => {
    const { pluginRegistry } = context;
    const { slotId } = input;

    const components = pluginRegistry.getComponentOfSlot(slotId);

    return components;
  });
