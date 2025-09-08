import {
  logger,
  PluginConfigInstanceSchema,
  PluginConfigSchema,
  PluginInstallationSchema,
  PluginSchema,
  TranslationAdvisorDataSchema,
} from "@cat/shared";
import { z } from "zod";
import { authedProcedure, router } from "../server";
import { pauseAllProcessors, resumeAllProcessors } from "@/server/processor";
import { TRPCError } from "@trpc/server";

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

      if (!installation)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Plugin ${pluginId} not installed in scope ${scopeType} ${scopeId}`,
        });

      return PluginConfigInstanceSchema.nullable().parse(
        await prisma.pluginConfigInstance.findUnique({
          where: {
            pluginInstallationId_configId: {
              configId,
              pluginInstallationId: installation.id,
            },
          },
        }),
      );
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
    .output(z.void())
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

      await prisma.pluginConfigInstance.upsert({
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
      PluginSchema.extend({
        Configs: z.array(PluginConfigSchema),
        Installations: z.array(PluginInstallationSchema),
      }).nullable(),
    )
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { id } = input;
      return PluginSchema.extend({
        Configs: z.array(PluginConfigSchema),
        Installations: z.array(PluginInstallationSchema),
      })
        .nullable()
        .parse(
          await prisma.plugin.findUnique({
            where: {
              id,
            },
            include: {
              Configs: true,
              Installations: true,
            },
          }),
        );
    }),
  listAll: authedProcedure
    .output(z.array(PluginSchema))
    .query(async ({ ctx }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      return z.array(PluginSchema).parse(
        await prisma.plugin.findMany({
          include: {
            Versions: true,
            Permissions: true,
            Tags: true,
          },
          orderBy: {
            id: "asc",
          },
        }),
      );
    }),
  listAllWithOverridableConfig: authedProcedure
    .output(z.array(PluginSchema))
    .query(async ({ ctx }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      return z.array(PluginSchema).parse(
        await prisma.plugin.findMany({
          where: {
            Configs: {
              some: {
                overridable: true,
              },
            },
          },
          include: {
            Configs: true,
            Versions: true,
            Permissions: true,
            Tags: true,
          },
          orderBy: {
            id: "asc",
          },
        }),
      );
    }),
  reload: authedProcedure.output(z.void()).mutation(async ({ ctx }) => {
    const {
      prismaDB: { client: prisma },
      pluginRegistry,
    } = ctx;

    logger.info("PROCESSOR", {
      msg: "About to pause all processors to reload plugin",
    });
    await pauseAllProcessors()
      .then(() => {
        logger.info("PROCESSOR", { msg: "Successfully paused all processors" });
      })
      .catch((e) => {
        logger.info(
          "PROCESSOR",
          { msg: "Error when pausing all processors" },
          e,
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Plugin reload was cancelled because error when pausing all processors",
        });
      });

    await pluginRegistry.reload(prisma);

    logger.info("PROCESSOR", {
      msg: "About to resume all processors after plugin reloaded",
    });
    await resumeAllProcessors()
      .then(() => {
        logger.info("PROCESSOR", {
          msg: "Successfully resumed all processors",
        });
      })
      .catch((e) => {
        logger.info(
          "PROCESSOR",
          { msg: "Error when resuming all processors" },
          e,
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Error when resuming all processors after plugin reloaded. Please check console",
        });
      });
  }),
  queryAdvisor: authedProcedure
    .input(z.object({ advisorId: z.string(), advisorPluginId: z.string() }))
    .output(TranslationAdvisorDataSchema.nullable())
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
        pluginRegistry,
      } = ctx;
      const { advisorId, advisorPluginId } = input;

      const advisor = (
        await pluginRegistry.getTranslationAdvisor(prisma, advisorPluginId)
      ).find((a) => a.getId() === advisorId);

      if (!advisor) {
        return null;
      }

      return TranslationAdvisorDataSchema.parse({
        id: advisor.getId(),
        name: advisor.getName(),
        pluginId: advisorPluginId,
      });
    }),
});
