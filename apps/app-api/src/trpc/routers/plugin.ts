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
} from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import { authedProcedure, publicProcedure, router } from "@/trpc/server.ts";
import { PluginRegistry } from "@cat/plugin-core";
import { nonNullSafeZDotJson } from "@cat/shared/schema/json";

export const pluginRouter = router({
  reload: authedProcedure
    .input(
      z.object({
        scopeType: z.enum(["GLOBAL", "PROJECT", "USER"]),
        scopeId: z.string(),
      }),
    )
    .mutation(({ input }) => {
      const { scopeType, scopeId } = input;

      const registry = PluginRegistry.get(scopeType, scopeId);
      registry.reload();
    }),
  queryConfigInstance: authedProcedure
    .input(
      z.object({
        configId: z.int(),
        pluginId: z.string(),
        scopeType: z.enum(["GLOBAL", "USER", "PROJECT"]),
        scopeId: z.string(),
      }),
    )
    .output(PluginConfigInstanceSchema.nullable())
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { configId, pluginId, scopeId, scopeType } = input;

      const installation = await drizzle.query.pluginInstallation.findFirst({
        where: (installation, { eq, and }) =>
          and(
            eq(installation.pluginId, pluginId),
            eq(installation.scopeType, scopeType),
            eq(installation.scopeId, scopeId),
          ),
      });

      if (!installation) return null;

      return (
        (await drizzle.query.pluginConfigInstance.findFirst({
          where: (instance, { eq, and }) =>
            and(
              eq(instance.pluginInstallationId, installation.id),
              eq(instance.configId, configId),
            ),
        })) ?? null
      );
    }),
  upsertConfigInstance: authedProcedure
    .input(
      z.object({
        pluginId: z.string(),
        configId: z.int(),
        scopeType: z.enum(["GLOBAL", "USER", "PROJECT"]),
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
      const { configId, pluginId, scopeType, scopeId, value } = input;

      const installation = await drizzle.query.pluginInstallation.findFirst({
        where: (installation, { eq, and }) =>
          and(
            eq(installation.pluginId, pluginId),
            eq(installation.scopeType, scopeType),
            eq(installation.scopeId, scopeId),
          ),
      });

      if (!installation)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Plugin not installed",
        });

      return assertSingleNonNullish(
        await drizzle
          .insert(pluginConfigInstanceTable)
          .values({
            value,
            creatorId: user.id,
            configId,
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
    }),
  get: authedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .output(
      PluginSchema.extend({
        PluginConfig: PluginConfigSchema.nullable(),
        PluginInstallations: z.array(PluginInstallationSchema),
      }).nullable(),
    )
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { id } = input;

      return (
        (await drizzle.query.plugin.findFirst({
          where: (plugin, { eq }) => eq(plugin.id, id),
          with: {
            PluginConfig: true,
            PluginInstallations: true,
          },
        })) ?? null
      );
    }),
  listAll: authedProcedure
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
          const providers = await pluginRegistry.getPluginServices(
            drizzle,
            "AUTH_PROVIDER",
          );
          providers
            .filter(({ service }) => serviceId === service.getId())
            .forEach(({ id, service }) => {
              methods.push({
                providerId: id,
                name: service.getName(),
                icon: service.getIcon(),
              });
            });
        }),
      );

      return methods;
    }),
  getAllTranslationAdvisors: authedProcedure
    .output(z.array(TranslationAdvisorDataSchema))
    .query(async ({ ctx }) => {
      const {
        drizzleDB: { client: drizzle },
        pluginRegistry,
      } = ctx;
      return (
        await pluginRegistry.getPluginServices(drizzle, "TRANSLATION_ADVISOR")
      ).map(
        ({ id, service }) =>
          ({
            id,
            name: service.getName(),
          }) satisfies TranslationAdvisorData,
      );
    }),
  getTranslationAdvisor: authedProcedure
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

      const { service } = (await pluginRegistry.getPluginService(
        drizzle,
        dbAdvisor.PluginInstallation.pluginId,
        "TRANSLATION_ADVISOR",
        dbAdvisor.serviceId,
      ))!;

      if (!service) throw new TRPCError({ code: "NOT_FOUND" });

      return {
        id: advisorId,
        name: service.getName(),
      };
    }),
});
