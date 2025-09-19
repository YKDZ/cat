import * as z from "zod/v4";
import { TRPCError } from "@trpc/server";
import {
  PluginConfigInstanceSchema,
  PluginSchema,
} from "@cat/shared/schema/prisma/plugin";
import {
  AuthMethodSchema,
  TranslationAdvisorDataSchema,
  type AuthMethod,
  type TranslationAdvisorData,
} from "@cat/shared/schema/misc";
import { authedProcedure, publicProcedure, router } from "@/trpc/server.ts";

export const pluginRouter = router({
  delete: authedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { id } = input;

      await prisma.plugin.delete({
        where: {
          id,
        },
      });
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
        prismaDB: { client: prisma },
      } = ctx;
      const { configId, pluginId, scopeId, scopeType } = input;

      const installation = await prisma.pluginInstallation.findUnique({
        where: { scopeId_scopeType_pluginId: { pluginId, scopeType, scopeId } },
      });

      if (!installation) return null;

      return await prisma.pluginConfigInstance.findUnique({
        where: {
          pluginInstallationId_configId: {
            configId,
            pluginInstallationId: installation.id,
          },
        },
      });
    }),
  upsertConfigInstance: authedProcedure
    .input(
      z.object({
        pluginId: z.string(),
        configId: z.int(),
        scopeType: z.enum(["GLOBAL", "USER", "PROJECT"]),
        scopeId: z.string(),
        value: z.json(),
      }),
    )
    .output(PluginConfigInstanceSchema)
    .mutation(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
        user,
      } = ctx;
      const { configId, pluginId, scopeType, scopeId, value } = input;

      const installation = await prisma.pluginInstallation.findUnique({
        where: { scopeId_scopeType_pluginId: { pluginId, scopeType, scopeId } },
      });

      if (!installation)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Plugin not installed",
        });

      return await prisma.pluginConfigInstance.upsert({
        where: {
          pluginInstallationId_configId: {
            pluginInstallationId: installation.id,
            configId,
          },
        },
        create: {
          value: z.json().parse(value) ?? {},
          creatorId: user.id,
          configId,
          pluginInstallationId: installation.id,
        },
        update: {
          value: z.json().parse(value) ?? {},
        },
      });
    }),
  query: authedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .output(
      PluginSchema.required({
        Installations: true,
      }).nullable(),
    )
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { id } = input;

      return PluginSchema.required({
        Installations: true,
      })
        .nullable()
        .parse(
          await prisma.plugin.findUnique({
            where: {
              id,
            },
            include: {
              Config: true,
              Installations: true,
            },
          }),
        );
    }),
  listAll: authedProcedure
    .output(
      z.array(
        PluginSchema.required({
          Installations: true,
        }),
      ),
    )
    .query(async ({ ctx }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;

      return await prisma.plugin.findMany({
        include: {
          Versions: true,
          Permissions: true,
          Tags: true,
          Installations: true,
        },
        orderBy: {
          id: "asc",
        },
      });
    }),
  availableAuthMethod: publicProcedure
    .output(z.array(AuthMethodSchema))
    .query(async ({ ctx }) => {
      const {
        prismaDB: { client: prisma },
        pluginRegistry,
      } = ctx;

      const providersData = await prisma.pluginService.findMany({
        where: {
          serviceType: "AUTH_PROVIDER",
        },
        select: {
          serviceId: true,
        },
      });

      const methods: AuthMethod[] = [];
      for (const { serviceId } of providersData) {
        const providers = await pluginRegistry.getPluginServices(
          prisma,
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
      }

      return methods;
    }),
  listAllAvailableAdvisors: authedProcedure
    .output(z.array(TranslationAdvisorDataSchema))
    .query(async ({ ctx }) => {
      const {
        prismaDB: { client: prisma },
        pluginRegistry,
      } = ctx;
      return (
        await pluginRegistry.getPluginServices(prisma, "TRANSLATION_ADVISOR")
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
        prismaDB: { client: prisma },
        pluginRegistry,
      } = ctx;
      const { advisorId } = input;

      const dbAdvisor = await prisma.pluginService.findUnique({
        where: { id: advisorId, serviceType: "TRANSLATION_ADVISOR" },
        select: {
          serviceId: true,
          serviceType: true,
          PluginInstallation: {
            select: { pluginId: true },
          },
        },
      });

      if (!dbAdvisor) throw new TRPCError({ code: "NOT_FOUND" });

      const { service } = (await pluginRegistry.getPluginService(
        prisma,
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
