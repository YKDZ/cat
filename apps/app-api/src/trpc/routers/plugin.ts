import * as z from "zod/v4";
import { TRPCError } from "@trpc/server";
import {
  PluginConfigInstanceSchema,
  PluginConfigSchema,
  PluginInstallationSchema,
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
  getTableColumns,
} from "@cat/db";
import { assertSingleNonNullish, assertSingleOrNull } from "@cat/shared/utils";
import { permissionProcedure, publicProcedure, router } from "@/trpc/server.ts";
import { PluginRegistry } from "@cat/plugin-core";
import { nonNullSafeZDotJson } from "@cat/shared/schema/json";
import { ScopeTypeSchema } from "@cat/shared/schema/drizzle/enum";

export const pluginRouter = router({
  reload: permissionProcedure("PLUGIN", "reload")
    .input(
      z.object({
        scopeType: ScopeTypeSchema,
        scopeId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { scopeType, scopeId } = input;

      const registry = PluginRegistry.get(scopeType, scopeId);
      await registry.reload(drizzle);
    }),
  getConfigInstance: permissionProcedure(
    "PLUGIN",
    "config-instance.get",
    z.object({
      pluginId: z.string(),
    }),
  )
    .input(
      z.object({
        scopeType: ScopeTypeSchema,
        scopeId: z.string(),
      }),
    )
    .output(PluginConfigInstanceSchema.nullable())
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
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
          .select(getTableColumns(pluginConfigInstanceTable))
          .from(pluginConfigInstanceTable)
          .innerJoin(pluginConfig, eq(pluginConfig.pluginId, pluginId))
          .where(
            and(
              eq(pluginConfigInstanceTable.configId, pluginConfig.id),
              eq(
                pluginConfigInstanceTable.pluginInstallationId,
                installation.id,
              ),
            ),
          ),
      );
    }),
  getConfig: permissionProcedure(
    "PLUGIN",
    "config.get",
    z.object({
      pluginId: z.string(),
    }),
  )
    .output(PluginConfigSchema.nullable())
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { pluginId } = input;

      return assertSingleOrNull(
        await drizzle
          .select()
          .from(pluginConfig)
          .where(eq(pluginConfig.pluginId, pluginId)),
      );
    }),
  upsertConfigInstance: permissionProcedure(
    "PLUGIN",
    "config-instance.upsert",
    z.object({
      pluginId: z.string(),
    }),
  )
    .input(
      z.object({
        scopeType: ScopeTypeSchema,
        scopeId: z.string(),
        value: nonNullSafeZDotJson,
      }),
    )
    .output(PluginConfigInstanceSchema)
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        user,
      } = ctx;
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
    }),
  get: permissionProcedure(
    "PLUGIN",
    "get",
    z.object({
      pluginId: z.string(),
    }),
  )
    .output(PluginSchema.nullable())
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { pluginId } = input;

      return assertSingleOrNull(
        await drizzle
          .select()
          .from(pluginTable)
          .where(eq(pluginTable.id, pluginId)),
      );
    }),
  getAll: permissionProcedure("PLUGIN", "get.all")
    .output(
      z.array(
        PluginSchema.extend({
          PluginInstallations: z.array(PluginInstallationSchema),
        }),
      ),
    )
    .query(async ({ ctx }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;

      return await drizzle.query.plugin.findMany({
        with: {
          PluginInstallations: true,
        },
        orderBy: desc(pluginTable.id),
      });
    }),
  getAllAuthMethod: publicProcedure
    .output(z.array(AuthMethodSchema))
    .query(async ({ ctx }) => {
      const {
        drizzleDB: { client: drizzle },
        pluginRegistry,
      } = ctx;

      const providersData = await drizzle.query.pluginService.findMany({
        where: (service, { eq }) => eq(service.serviceType, "AUTH_PROVIDER"),
        columns: {
          serviceId: true,
        },
      });

      const methods: AuthMethod[] = [];

      await Promise.all(
        providersData.map(async ({ serviceId }) => {
          const providers = pluginRegistry.getPluginServices("AUTH_PROVIDER");

          await Promise.all(
            providers
              .filter(({ service }) => serviceId === service.getId())
              .map(async ({ record, service }) => {
                methods.push({
                  providerId: await pluginRegistry.getPluginServiceDbId(
                    drizzle,
                    record,
                  ),
                  name: service.getName(),
                  icon: service.getIcon(),
                });
              }),
          );
        }),
      );

      return methods;
    }),
  getAllTranslationAdvisors: permissionProcedure(
    "PLUGIN",
    "translation-advisor.get.all",
  )
    .output(z.array(TranslationAdvisorDataSchema))
    .query(async ({ ctx }) => {
      const {
        drizzleDB: { client: drizzle },
        pluginRegistry,
      } = ctx;

      return Promise.all(
        pluginRegistry.getPluginServices("TRANSLATION_ADVISOR").map(
          async ({ record, service }) =>
            ({
              id: await pluginRegistry.getPluginServiceDbId(drizzle, record),
              name: service.getName(),
            }) satisfies TranslationAdvisorData,
        ),
      );
    }),
  getTranslationAdvisor: permissionProcedure(
    "PLUGIN",
    "translation-advisor.get",
  )
    .input(
      z.object({
        advisorId: z.int(),
      }),
    )
    .output(TranslationAdvisorDataSchema)
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        pluginRegistry,
      } = ctx;
      const { advisorId } = input;

      const dbAdvisor = await drizzle.query.pluginService.findFirst({
        where: (service, { and, eq }) =>
          and(
            eq(service.id, advisorId),
            eq(service.serviceType, "TRANSLATION_ADVISOR"),
          ),
        columns: {
          serviceId: true,
          serviceType: true,
        },
        with: {
          PluginInstallation: {
            columns: {
              pluginId: true,
            },
          },
        },
      });

      if (!dbAdvisor) throw new TRPCError({ code: "NOT_FOUND" });

      const service = pluginRegistry.getPluginService(
        dbAdvisor.PluginInstallation.pluginId,
        "TRANSLATION_ADVISOR",
        dbAdvisor.serviceId,
      )!;

      if (!service) throw new TRPCError({ code: "NOT_FOUND" });

      return {
        id: advisorId,
        name: service.getName(),
      };
    }),
});
