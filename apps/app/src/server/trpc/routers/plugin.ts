import { prisma } from "@cat/db";
import { PluginSchema } from "@cat/shared";
import { z } from "zod/v4";
import { authedProcedure, router } from "../server";
import { importPluginQueue } from "@/server/processor/importPlugin";

export const pluginRouter = router({
  listAll: authedProcedure.query(async () => {
    return z.array(PluginSchema).parse(
      await prisma.plugin.findMany({
        include: {
          Versions: true,
          Permissions: true,
          Tags: true,
        },
        orderBy: {
          name: "asc",
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
  importFromLocal: authedProcedure
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
});
