import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  PluginConfigInstanceSchema,
  PluginSchema,
} from "@cat/shared/schema/prisma/plugin";
import { logger } from "@cat/shared/utils";
import { TranslationAdvisorDataSchema } from "@cat/shared/schema/misc";
import {
  pauseAllProcessors,
  resumeAllProcessors,
} from "@/server/processor/index.ts";
import { authedProcedure, router } from "@/server/trpc/server.ts";

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
      return z
        .array(
          PluginSchema.required({
            Installations: true,
          }),
        )
        .parse(
          await prisma.plugin.findMany({
            include: {
              Versions: true,
              Permissions: true,
              Tags: true,
              Installations: true,
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
