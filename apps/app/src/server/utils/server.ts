import { getPrismaDB } from "@cat/db";
import { logger } from "@cat/shared";
import type { Job } from "bullmq";
import getPluginRegistry from "../pluginRegistry";
import {
  importPluginQueue,
  importPluginQueueEvents,
} from "../processor/importPlugin";

export const scanLocalPlugins = async () => {
  const { client: prisma } = await getPrismaDB();
  const existPluginIds: string[] = [];
  const jobs: Job[] = [];

  await prisma.$transaction(async (tx) => {
    existPluginIds.push(
      ...(
        await tx.plugin.findMany({
          select: {
            id: true,
          },
        })
      ).map((plugin) => plugin.id),
    );

    await Promise.all(
      (await (await getPluginRegistry(prisma)).getPluginIdInLocalPlugins())
        .filter((id) => !existPluginIds.includes(id))
        .map(async (id) => {
          const task = await tx.task.create({
            data: {
              type: "import_plugin",
            },
          });

          jobs.push(
            await importPluginQueue.add(task.id, {
              taskId: task.id,
              origin: {
                type: "LOCAL",
                data: {
                  id,
                },
              },
            }),
          );
        }),
    );
  });

  if (existPluginIds.length === 0) {
    await importPluginQueueEvents.waitUntilReady();

    await Promise.all(
      jobs.map(
        async (job) => await job.waitUntilFinished(importPluginQueueEvents),
      ),
    );

    (await getPluginRegistry(prisma)).reload(prisma);
    logger.info(
      "SERVER",
      "Reloaded plugins successfully for there was no plugins registered in the database before",
    );
  }
};
