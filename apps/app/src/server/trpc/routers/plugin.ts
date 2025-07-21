import { prisma } from "@cat/db";
import {
  logger,
  PluginConfigSchema,
  PluginSchema,
  PluginUserConfigInstanceSchema,
} from "@cat/shared";
import { z } from "zod";
import { authedProcedure, router } from "../server";
import { importPluginQueue } from "@/server/processor/importPlugin";
import { pauseAllProcessors, resumeAllProcessors } from "@/server/processor";
import { TRPCError } from "@trpc/server";

export const pluginRouter = router({
  delete: authedProcedure
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
  queryGlobalConfig: authedProcedure
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
  queryUserConfigInstance: authedProcedure
    .input(z.object({ configId: z.int() }))
    .output(PluginUserConfigInstanceSchema.nullable())
    .query(async ({ ctx, input }) => {
      const { user } = ctx;
      const { configId } = input;

      return PluginUserConfigInstanceSchema.nullable().parse(
        await prisma.pluginUserConfigInstance.findUnique({
          where: {
            configId_creatorId: {
              configId,
              creatorId: user.id,
            },
          },
        }),
      );
    }),
  updateGlobalConfig: authedProcedure
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
  upsertUserConfig: authedProcedure
    .input(
      z.object({
        configId: z.number(),
        value: z.json(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx;
      const { configId, value } = input;

      await prisma.pluginUserConfigInstance.upsert({
        where: {
          configId_creatorId: {
            configId,
            creatorId: user.id,
          },
          Config: {
            userOverridable: true,
          },
        },
        create: {
          value,
          creatorId: user.id,
          configId,
        },
        update: {
          value,
        },
      });
    }),
  updateUserConfig: authedProcedure
    .input(
      z.object({
        configId: z.number(),
        value: z.json().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx;
      const { configId, value, isActive } = input;

      await prisma.pluginUserConfigInstance.update({
        where: {
          configId_creatorId: {
            configId,
            creatorId: user.id,
          },
          Config: {
            userOverridable: true,
          },
        },
        data: {
          value,
          isActive,
        },
      });
    }),
  query: authedProcedure
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
  queryWithUserOverridableConfig: authedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .output(
      PluginSchema.omit({ Configs: true })
        .extend({
          Configs: z.array(PluginConfigSchema.omit({ value: true })),
        })
        .nullable(),
    )
    .query(async ({ input }) => {
      const { id } = input;

      return PluginSchema.omit({ Configs: true })
        .extend({
          Configs: z.array(PluginConfigSchema.omit({ value: true })),
        })
        .nullable()
        .parse(
          await prisma.plugin.findUnique({
            where: {
              id,
            },
            include: {
              Configs: {
                where: {
                  userOverridable: true,
                },
                omit: {
                  value: true,
                },
              },
            },
          }),
        );
    }),
  listAll: authedProcedure.query(async () => {
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
  listAllUserConfigurable: authedProcedure.query(async () => {
    return z.array(PluginSchema).parse(
      await prisma.plugin.findMany({
        where: {
          Configs: {
            some: {
              userOverridable: true,
            },
          },
        },
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
  importFromGitHub: authedProcedure
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

      await importPluginQueue.add(task.id, {
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
  importFromLocal: authedProcedure
    .input(
      z.object({
        id: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const { id } = input;

      const task = await prisma.task.create({
        data: {
          type: "import_plugin",
        },
      });

      await importPluginQueue.add(task.id, {
        taskId: task.id,
        origin: {
          type: "LOCAL",
          data: {
            id,
          },
        },
      });
    }),
  reload: authedProcedure.mutation(async ({ ctx }) => {
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
