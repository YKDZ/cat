import {
  logger,
  PluginConfigInstanceSchema,
  PluginConfigSchema,
  PluginSchema,
  TranslationAdvisorDataSchema,
} from "@cat/shared";
import { z } from "zod";
import { authedProcedure, router } from "../server";
import { importPluginQueue } from "@/server/processor/importPlugin";
import { pauseAllProcessors, resumeAllProcessors } from "@/server/processor";
import { TRPCError } from "@trpc/server";
import type { InputJsonValue } from "@prisma/client/runtime/client";
import type { PluginConfigInstatnceScopeType } from "@cat/db";

export const pluginRouter = router({
  delete: authedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
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
  queryGlobalConfig: authedProcedure
    .input(z.object({ pluginId: z.string(), key: z.string() }))
    .output(PluginConfigSchema.nullable())
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { pluginId, key } = input;

      return PluginConfigSchema.nullable().parse(
        await prisma.pluginConfig.findUnique({
          where: {
            pluginId_key: {
              pluginId,
              key,
            },
          },
        }),
      );
    }),
  queryConfigInstance: authedProcedure
    .input(
      z.object({
        configId: z.int(),
        scopeType: z.custom<PluginConfigInstatnceScopeType>(),
        scopeId: z.string(),
      }),
    )
    .output(PluginConfigInstanceSchema.nullable())
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { configId, scopeType, scopeId } = input;

      return PluginConfigInstanceSchema.nullable().parse(
        await prisma.pluginConfigInstance.findUnique({
          where: {
            configId_scopeType_scopeId: {
              configId,
              scopeType,
              scopeId,
            },
          },
        }),
      );
    }),
  upsertConfigInstance: authedProcedure
    .input(
      z.object({
        configId: z.number(),
        scopeType: z.custom<PluginConfigInstatnceScopeType>(),
        scopeId: z.string(),
        scopeMeta: z.json().nullable(),
        value: z.json(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
        user,
      } = ctx;
      const { configId, scopeType, scopeId, scopeMeta, value } = input;

      await prisma.pluginConfigInstance.upsert({
        where: {
          configId_scopeType_scopeId: {
            configId,
            scopeType,
            scopeId,
          },
        },
        create: {
          scopeType,
          scopeId,
          scopeMeta: scopeMeta as InputJsonValue,
          value: value as InputJsonValue,
          creatorId: user.id,
          configId,
        },
        update: {
          value: value as InputJsonValue,
        },
      });
    }),
  query: authedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .output(PluginSchema.nullable())
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { id } = input;
      return PluginSchema.nullable().parse(
        await prisma.plugin.findUnique({
          where: {
            id,
          },
          include: {
            Configs: true,
          },
        }),
      );
    }),
  listAll: authedProcedure.query(async ({ ctx }) => {
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
  importFromGitHub: authedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        ref: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { owner, repo, ref } = input;

      const task = await prisma.task.create({
        data: {
          type: "import_plugin",
        },
      });

      await importPluginQueue.add(
        task.id,
        {
          origin: {
            type: "GITHUB",
            data: {
              owner,
              repo,
              ref,
            },
          },
        },
        {
          jobId: task.id,
        },
      );
    }),
  importFromLocal: authedProcedure
    .input(
      z.object({
        id: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { id } = input;

      const task = await prisma.task.create({
        data: {
          type: "import_plugin",
        },
      });

      await importPluginQueue.add(
        task.id,
        {
          origin: {
            type: "LOCAL",
            data: {
              id,
            },
          },
        },
        {
          jobId: task.id,
        },
      );
    }),
  reload: authedProcedure.mutation(async ({ ctx }) => {
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
