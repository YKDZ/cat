import { z } from "zod/v4";
import { authedProcedure, router } from "../server";
import { TaskSchema } from "@cat/shared";
import { prisma } from "@cat/db";
import { cleanDanglingFilesQueue } from "@/server/processor/cleanDanglingFiles";

export const taskRouter = router({
  listProjectExportTranslatedFileTask: authedProcedure
    .input(
      z.object({
        projectId: z.ulid(),
      }),
    )
    .output(z.array(TaskSchema))
    .query(async ({ input }) => {
      const { projectId } = input;

      return z.array(TaskSchema).parse(
        await prisma.task.findMany({
          where: {
            meta: {
              path: ["projectId"],
              equals: projectId,
            },
          },
          orderBy: {
            updatedAt: "desc",
          },
        }),
      );
    }),
  triggerCleanDanglingFiles: authedProcedure.mutation(async () => {
    const task = await prisma.task.create({
      data: {
        type: "clean_dangling_files",
      },
    });

    await cleanDanglingFilesQueue.add(task.id, {
      taskId: task.id,
    });
  }),
});
