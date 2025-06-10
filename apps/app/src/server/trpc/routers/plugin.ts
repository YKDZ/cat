import { prisma } from "@cat/db";
import { logger, PluginConfigSchema, PluginSchema } from "@cat/shared";
import { z } from "zod/v4";
import { publicProcedure, router } from "../server";
import { importPluginQueue } from "@/server/processor/importPlugin";
import { pauseAllProcessors, resumeAllProcessors } from "@/server/processor";
import { TRPCError } from "@trpc/server";

export const pluginRouter = router({
  delete: publicProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id } = input;

      await prisma.plugin.delete({
        where: {
          id,
        },
      });
    }),
  queryConfig: publicProcedure
    .input(z.object({ pluginId: z.string(), key: z.string() }))
    .output(PluginConfigSchema.nullable())
    .query(async ({ input }) => {
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
  updateConfig: publicProcedure
    .input(z.object({ pluginId: z.string(), key: z.string(), value: z.json() }))
    .mutation(async ({ input }) => {
      const { pluginId, key, value } = input;

      await prisma.pluginConfig.update({
        where: {
          pluginId_key: {
            pluginId,
            key,
          },
        },
        data: {
          value,
        },
      });
    }),
  query: publicProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(async ({ input }) => {
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
  listAll: publicProcedure.query(async () => {
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
  importFromGitHub: publicProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        ref: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const { owner, repo, ref } = input;

      const task = await prisma.task.create({
        data: {
          type: "import_plugin",
        },
      });

      importPluginQueue.add(task.id, {
        taskId: task.id,
        origin: {
          type: "GITHUB",
          data: {
            owner,
            repo,
            ref,
          },
        },
      });
    }),
  importFromLocal: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const { name } = input;

      const task = await prisma.task.create({
        data: {
          type: "import_plugin",
        },
      });

      importPluginQueue.add(task.id, {
        taskId: task.id,
        origin: {
          type: "LOCAL",
          data: {
            name,
          },
        },
      });
    }),
  reload: publicProcedure.mutation(async ({ ctx }) => {
    const { pluginRegistry } = ctx;

    logger.info("PROCESSER", "About to pause all processors to reload plugin");
    await pauseAllProcessors()
      .then(() => {
        logger.info("PROCESSER", "Successfully paused all processors");
      })
      .catch((e) => {
        logger.info("PROCESSER", "Error when pausing all processors", e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Plugin reload was cancelled because error when pausing all processors",
        });
      });

    await pluginRegistry.reload();

    logger.info(
      "PROCESSER",
      "About to resume all processors after plugin reloaded",
    );
    await resumeAllProcessors()
      .then(() => {
        logger.info("PROCESSER", "Successfully resumed all processors");
      })
      .catch((e) => {
        logger.info("PROCESSER", "Error when resuming all processors", e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Error when resuming all processors after plugin reloaded. Please check console",
        });
      });
  }),
});
